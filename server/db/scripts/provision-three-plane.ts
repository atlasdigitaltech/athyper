#!/usr/bin/env tsx

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "pg";

import { applyAuthorizationSeedPack } from "./apply-authorization-seed-pack.js";
import { verifyThreePlaneContexts } from "./verify-three-plane-contexts.js";
import {
  loadProvisionInputs,
  planeOrder,
  THREE_PLANE_MANIFEST,
} from "./provisioning/three-plane-model.js";

const databaseRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(databaseRoot, "../..");

export interface ThreePlaneProvisionOptions {
  readonly manifestPath?: string;
  readonly apply?: boolean;
  readonly skipFoundation?: boolean;
  readonly skipKeycloak?: boolean;
}

export async function provisionThreePlanes(options: ThreePlaneProvisionOptions): Promise<unknown> {
  const inputs = await loadProvisionInputs(options.manifestPath ?? THREE_PLANE_MANIFEST);
  const stages = [
    ...planeOrder().map((plane) => ({ stage: "ddl", plane })),
    ...planeOrder().map((plane) => ({ stage: "tenant-and-authorization", plane })),
    { stage: "top-level-receipt", plane: "studio" },
    { stage: "keycloak-reconciliation", plane: "identity" },
    { stage: "context-contract-verification", plane: "all" },
  ];
  if (!options.apply) {
    const planePlans = [];
    for (const plane of planeOrder()) {
      planePlans.push(await applyAuthorizationSeedPack({
        plane,
        manifestPath: inputs.manifestPath,
        dryRun: true,
      }));
    }
    return {
      contractVersion: inputs.manifest.contractVersion,
      manifestVersion: inputs.manifest.manifestVersion,
      manifestSha256: inputs.manifestSha256,
      mode: "plan",
      stages,
      planePlans,
    };
  }

  if (!options.skipFoundation) {
    for (const plane of planeOrder()) await runFoundation(plane);
  }
  const planeResults: unknown[] = [];
  for (const plane of planeOrder()) {
    planeResults.push(await applyAuthorizationSeedPack({
      plane,
      manifestPath: inputs.manifestPath,
    }));
  }
  const receiptId = await recordTopLevelReceipt(inputs, planeResults);
  if (!options.skipKeycloak) await reconcileKeycloak();
  const contextVerification = await verifyThreePlaneContexts(inputs.manifestPath);
  return {
    contractVersion: inputs.manifest.contractVersion,
    manifestVersion: inputs.manifest.manifestVersion,
    manifestSha256: inputs.manifestSha256,
    mode: "applied",
    receiptId,
    planeResults,
    keycloak: options.skipKeycloak ? "skipped" : "reconciled",
    contextVerification,
  };
}

async function runFoundation(plane: "studio" | "neon" | "mesh"): Promise<void> {
  await run("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "ddl/foundation-runner.ps1",
    "-Plane",
    plane,
  ], databaseRoot);
}

async function reconcileKeycloak(): Promise<void> {
  await run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
    "run",
    "iam:reconcile:authorization-v2",
    "--",
    "--apply",
    "--user-manifest=server/db/seed/contracts/authorization/admission/compiled/keycloak-admission.v1.json",
    "--tenant-manifest=server/db/seed/manifests/three-plane-demo.v1.json",
  ], repositoryRoot);
}

async function recordTopLevelReceipt(
  inputs: Awaited<ReturnType<typeof loadProvisionInputs>>,
  planeResults: readonly unknown[],
): Promise<string> {
  const environmentName = inputs.manifest.planes.studio.databaseUrlEnvironment;
  const databaseUrl = process.env[environmentName]?.trim();
  if (!databaseUrl) throw new Error(`top-level receipt requires ${environmentName}`);
  const client = new Client({ connectionString: databaseUrl });
  const receiptId = randomUUID();
  await client.connect();
  try {
    await client.query("BEGIN");
    const identity = await client.query<{ database: string; plane: string }>(`
      SELECT current_database() AS database,current_setting('app.database_plane',true) AS plane
    `);
    if (identity.rows[0]?.database !== "athyper_studio" || identity.rows[0]?.plane !== "studio") {
      throw new Error("refusing top-level receipt outside athyper_studio/studio");
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.three_plane_provision_receipt_v1 (
        receipt_id uuid PRIMARY KEY,
        contract_version text NOT NULL,
        manifest_version text NOT NULL,
        manifest_sha256 text NOT NULL,
        plane_results jsonb NOT NULL,
        completed_at timestamptz NOT NULL DEFAULT now(),
        completed_by text NOT NULL DEFAULT session_user,
        CONSTRAINT three_plane_provision_receipt_sha_chk
          CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
        CONSTRAINT three_plane_provision_receipt_results_chk
          CHECK (jsonb_typeof(plane_results)='array')
      )
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION public.trg_three_plane_provision_receipt_immutable()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN RAISE EXCEPTION 'three_plane_provision_receipt_v1 is immutable'; END
      $function$;
      DROP TRIGGER IF EXISTS trg_three_plane_provision_receipt_immutable
        ON public.three_plane_provision_receipt_v1;
      CREATE TRIGGER trg_three_plane_provision_receipt_immutable
        BEFORE UPDATE OR DELETE ON public.three_plane_provision_receipt_v1
        FOR EACH ROW EXECUTE FUNCTION public.trg_three_plane_provision_receipt_immutable()
    `);
    await client.query(`
      INSERT INTO public.three_plane_provision_receipt_v1 (
        receipt_id,contract_version,manifest_version,manifest_sha256,plane_results
      ) VALUES ($1::uuid,$2,$3,$4,$5::jsonb)
    `, [receiptId, inputs.manifest.contractVersion, inputs.manifest.manifestVersion,
      inputs.manifestSha256, JSON.stringify(planeResults)]);
    await client.query("REVOKE ALL ON public.three_plane_provision_receipt_v1 FROM PUBLIC");
    await client.query("COMMIT");
    return receiptId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function run(command: string, args: readonly string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(`${command} exited with code ${code ?? "unknown"}`)));
  });
}

function option(args: readonly string[], name: string): string | undefined {
  return args.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const result = await provisionThreePlanes({
    apply,
    manifestPath: option(args, "--manifest"),
    skipFoundation: args.includes("--skip-foundation"),
    skipKeycloak: args.includes("--skip-keycloak"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
