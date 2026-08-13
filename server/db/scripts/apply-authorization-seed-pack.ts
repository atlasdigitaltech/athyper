#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import {
  recordSeedExecution,
  registerSeedPack,
  seedReceipt,
  type ProvisionPlane,
} from "./safe-provision.js";
import { applyPlaneSeed } from "./provisioning/authorization-pack-applicator.js";
import {
  legalEntityResources,
  loadProvisionInputs,
  networkAccountResources,
  planeAssignments,
  planeOrder,
  THREE_PLANE_MANIFEST,
} from "./provisioning/three-plane-model.js";

export interface ApplyAuthorizationOptions {
  readonly plane: ProvisionPlane;
  readonly manifestPath?: string;
  readonly databaseUrl?: string;
  readonly dryRun?: boolean;
}

export async function applyAuthorizationSeedPack(options: ApplyAuthorizationOptions): Promise<unknown> {
  const inputs = await loadProvisionInputs(options.manifestPath ?? THREE_PLANE_MANIFEST);
  const pack = inputs.authorizationPacks[options.plane];
  const tenantCodes = new Set(inputs.manifest.tenants.map((tenant) => tenant.code));
  const assignments = planeAssignments(pack, options.plane, tenantCodes);
  const plan = {
    contractVersion: inputs.manifest.contractVersion,
    manifestVersion: inputs.manifest.manifestVersion,
    manifestSha256: inputs.manifestSha256,
    plane: options.plane,
    databaseName: inputs.manifest.planes[options.plane].databaseName,
    tenantCodes: inputs.manifest.tenants.map((tenant) => tenant.code),
    assignments: assignments.length,
    uniqueContexts: new Set(assignments.map((item) => `${item.tenantCode}:${item.subject.keycloakSubject}`)).size,
    legalEntityResources: options.plane === "neon" ? legalEntityResources(inputs).length : 0,
    networkAccountResources: options.plane === "mesh" ? networkAccountResources(inputs).length : 0,
    authorityRoles: pack.authority.roles.filter((role) => role.plane === options.plane).length,
    authorityGroups: pack.authority.groups.filter((group) => group.plane === options.plane).length,
    mode: options.dryRun ? "plan" : "apply",
  };
  if (options.dryRun) return plan;

  const databaseUrl = options.databaseUrl ?? resolveDatabaseUrl(inputs.manifest.planes[options.plane].databaseUrlEnvironment);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `athyper:three-plane:v1:${options.plane}`,
    ]);
    const result = await applyPlaneSeed(client, inputs, options.plane);
    const packSource = await readFile(inputs.authorizationPackPaths[options.plane], "utf8");
    const receipt = seedReceipt({
      plane: options.plane,
      packKey: `authorization-v2/${options.plane}/three-tenant`,
      sourcePath: relativePath(inputs.authorizationPackPaths[options.plane]),
      source: `-- seed-pack-version: ${inputs.manifest.manifestVersion}\n${packSource}`,
      manifestSha256: inputs.manifestSha256,
    });
    await registerSeedPack(client, receipt);
    await recordSeedExecution(client, receipt, "upgrade");
    await client.query("COMMIT");
    return { ...plan, mode: "applied", result, receipt };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

function resolveDatabaseUrl(primary: string): string {
  const fallbacks: Record<string, readonly string[]> = {
    ATHYPER_NEON_DATABASE_ADMIN_URL: ["DATABASE_ADMIN_URL"],
    ATHYPER_MESH_DATABASE_ADMIN_URL: ["MESH_DATABASE_ADMIN_URL"],
    ATHYPER_PLATFORM_DATABASE_ADMIN_URL: [],
  };
  for (const name of [primary, ...(fallbacks[primary] ?? [])]) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`database URL is required; set ${[primary, ...(fallbacks[primary] ?? [])].join(" or ")}`);
}

function relativePath(path: string): string {
  return path.replace(`${resolve(".")}\\`, "").replace(/\\/g, "/");
}

function option(args: readonly string[], name: string): string | undefined {
  const match = args.find((argument) => argument.startsWith(`${name}=`));
  return match?.slice(name.length + 1);
}

function parsePlane(value: string | undefined): ProvisionPlane {
  if (value && planeOrder().includes(value as ProvisionPlane)) return value as ProvisionPlane;
  throw new Error("--plane must be studio, neon, or mesh");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const result = await applyAuthorizationSeedPack({
    plane: parsePlane(option(args, "--plane")),
    manifestPath: option(args, "--manifest"),
    dryRun: args.includes("--dry-run") || args.includes("--plan"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
