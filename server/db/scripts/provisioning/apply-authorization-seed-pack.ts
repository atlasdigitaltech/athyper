#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import {
  recordSeedExecution,
  registerSeedPack,
  seedReceipt,
  type ProvisionPlane,
  type QueryClient,
  authorizationProvisionLockKey,
} from "./safe-provision.js";
import { withAuthorizationProvisionTransaction } from "../../src/provisioning/authorization-transaction.js";
import { applyPlaneCatalog, applyPlaneSeed } from "./authorization-pack-applicator.js";
import {
  legalEntityResources,
  canonicalJson,
  loadProvisionInputs,
  networkAccountResources,
  planeAssignments,
  planeOrder,
  THREE_PLANE_MANIFEST,
} from "./three-plane-model.js";

export interface ApplyAuthorizationOptions {
  readonly plane: ProvisionPlane;
  readonly manifestPath?: string;
  readonly databaseUrl?: string;
  readonly dryRun?: boolean;
  readonly catalogOnly?: boolean;
  /** Caller owns BEGIN/COMMIT/ROLLBACK and connection lifetime when supplied. */
  readonly transactionClient?: QueryClient;
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
    mode: options.dryRun ? "plan" : options.catalogOnly ? "catalog-only" : "apply",
  };
  const packSource = await readFile(inputs.authorizationPackPaths[options.plane], "utf8");
  if (canonicalJson(JSON.parse(packSource)) !== canonicalJson(pack))
    throw new Error("Authorization seed pack changed during validation");
  const receipt = seedReceipt({
    plane: options.plane,
    packKey: options.catalogOnly
      ? `authorization-catalog-v2/${options.plane}`
      : `authorization-clean-slate-v1/${options.plane}/three-tenant`,
    sourcePath: relativePath(inputs.authorizationPackPaths[options.plane]),
    source: `-- seed-pack-version: ${inputs.manifest.manifestVersion}\n${packSource}`,
    manifestSha256: inputs.manifestSha256,
  });

  if (options.dryRun) return plan;

  const databaseUrl = options.transactionClient ? undefined : options.databaseUrl ?? resolveDatabaseUrl(inputs.manifest.planes[options.plane].databaseUrlEnvironment);
  const ownedClient = options.transactionClient ? undefined : new Client({ connectionString: databaseUrl });
  const client = options.transactionClient ?? ownedClient!;
  if (ownedClient) await ownedClient.connect();
  const apply = async () => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      authorizationProvisionLockKey(options.plane),
    ]);
    const result = options.catalogOnly
      ? await applyPlaneCatalog(client, inputs, options.plane)
      : await applyPlaneSeed(client, inputs, options.plane);
    await registerSeedPack(client, receipt);
    await recordSeedExecution(client, receipt, "upgrade");
    return { ...plan, mode: options.catalogOnly ? "catalog-applied" : "applied", result, receipt };
  };
  try {
    return ownedClient
      ? await withAuthorizationProvisionTransaction(ownedClient, options.plane, apply)
      : await apply();
  } finally {
    if (ownedClient) await ownedClient.end();
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
  const dbRoot = resolve(import.meta.dirname, "../..");
  const sourcePath = relative(dbRoot, path).replace(/\\/g, "/");
  if (sourcePath.startsWith("../") || sourcePath === "..") throw new Error("Authorization seed source must be inside server/db");
  return sourcePath;
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
    databaseUrl: option(args, "--database-url"),
    dryRun: args.includes("--dry-run") || args.includes("--plan"),
    catalogOnly: args.includes("--catalog-only"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
