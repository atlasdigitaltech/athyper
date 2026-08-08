#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPlaneFileBoundary,
  seedReceipt,
} from "../safe-provision.js";

interface SeedStateSnapshot {
  contractVersion: "wave6.seed-state-snapshot.v1";
  plane: "neon" | "mesh";
  databaseIdentity: string;
  captureKind:
    | "clean_build_a"
    | "clean_build_b"
    | "forced_reseed_a"
    | "forced_reseed_b"
    | "in_place_upgrade";
  seedLedgerSha256: string;
  seedOwnedSha256: string;
  identityCount: number;
  identityCanonicalSha256: string;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(scriptDirectory, "../..");
const repositoryRoot = resolve(databaseRoot, "../..");
const failures: string[] = [];

const seedFiles = await findSqlFiles(resolve(databaseRoot, "seed"));
const neonFiles = seedFiles.filter((path) =>
  !normalize(path).includes("/seed/tenants/mesh/")
);
const meshFiles = seedFiles.filter((path) =>
  normalize(path).includes("/seed/tenants/mesh/")
);
assertPlaneFileBoundary(
  "neon",
  neonFiles.map((path) => relative(databaseRoot, path)),
);
assertPlaneFileBoundary(
  "mesh",
  meshFiles.map((path) => relative(databaseRoot, path)),
);

const manifests = {
  neon: await seedManifest("neon", neonFiles),
  mesh: await seedManifest("mesh", meshFiles),
};
const allSeedSource = (
  await Promise.all(seedFiles.map(async (path) =>
    stripSqlComments(await readFile(path, "utf8"))
  ))
).join("\n");
const destructivePatterns = [
  {
    id: "global_authorization_truncate",
    pattern:
      /\bTRUNCATE(?:\s+TABLE)?\s+(?:master\.)?(?:auth_|principal|tenant_admin_grant|access_grant)/i,
  },
  {
    id: "global_authorization_delete",
    pattern:
      /\bDELETE\s+FROM\s+master\.(?:auth_|principal|tenant_admin_grant|access_grant)/i,
  },
];
for (const rule of destructivePatterns) {
  if (rule.pattern.test(allSeedSource)) failures.push(rule.id);
}

const sourceFiles = {
  safe: await read("server/db/scripts/safe-provision.ts"),
  neon: await read("server/scripts/db/provision.ts"),
  mesh: await read("server/db/scripts/provision-mesh.ts"),
  identity: await read(
    "server/db/scripts/migrate/migrate-preserved-identities.ts",
  ),
  keycloak: await read(
    "tools/scripts/reconcile-keycloak-authorization-v2.mjs",
  ),
  disposition: await read(
    "server/db/scripts/migrate/execute-fresh-database-disposition.ts",
  ),
  package: await read("server/db/package.json"),
  neonReset: await read(
    "stack/scripts/db/transaction/neon/seed-db-dev-reset.bat",
  ),
  meshReset: await read(
    "stack/scripts/db/transaction/mesh/seed-db-dev-reset.bat",
  ),
  iamResetSh: await read("stack/scripts/db/session/iam/reset-iam.sh"),
  iamResetBat: await read("stack/scripts/db/session/iam/reset-iam.bat"),
};

requireTokens("safe provision", sourceFiles.safe, [
  "pg_advisory_lock",
  "seed_pack_ledger_v2",
  "immutable seed pack content drift",
  "database_reset_guard_v2",
  "schema_fingerprint_sha256 !== currentSchemaFingerprint",
]);
requireTokens("Neon provision", sourceFiles.neon, [
  "assertPlaneFileBoundary(",
  '"neon"',
  'acquireProvisionLock(client, "neon")',
  "registerSeedPack",
  "recordSeedExecution",
]);
requireTokens("Mesh provision", sourceFiles.mesh, [
  'assertPlaneFileBoundary("mesh"',
  'acquireProvisionLock(client, "mesh")',
  "MESH_DATABASE_ADMIN_URL",
]);
if (/process\.env\.DATABASE_ADMIN_URL\b/.test(sourceFiles.mesh)) {
  failures.push("Mesh provision retains Neon DATABASE_ADMIN_URL discovery");
}
requireTokens("identity executor", sourceFiles.identity, [
  "identity field-authority conflict",
  "canonical hash does not match",
  "unmanagedIdentityMutation: false",
  "INSERT INTO master.principal",
  "INSERT INTO mesh.principal",
]);
if (/\b(?:UPDATE|DELETE)\s+(?:master|mesh)\.principal\b/i.test(sourceFiles.identity)) {
  failures.push("identity executor contains principal update/delete");
}
requireTokens("Keycloak reconciler", sourceFiles.keycloak, [
  "userMutations: 0",
  "deletes: 0",
  "unmanagedResourcesPreserved: true",
]);
if (/\/users(?:[/?`'"]|$)/.test(sourceFiles.keycloak)) {
  failures.push("additive Keycloak reconciler references a user endpoint");
}
requireTokens("disposition executor", sourceFiles.disposition, [
  "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
  "target is not fresh/empty",
  "sourceSha256",
  "targetSha256",
  "deletes: 0",
  "truncates: 0",
]);
requireTokens("package reset routing", sourceFiles.package, [
  '"db:reset:neon"',
  '"db:reset:mesh"',
  "--no-mesh",
]);
for (const [name, source] of Object.entries({
  neonReset: sourceFiles.neonReset,
  meshReset: sourceFiles.meshReset,
  iamResetSh: sourceFiles.iamResetSh,
  iamResetBat: sourceFiles.iamResetBat,
})) {
  requireTokens(`${name} guard`, source, ["I_UNDERSTAND_DATA_WILL_BE_DESTROYED"]);
}

const snapshots = await readSnapshots(process.argv.slice(2));
const repeatability = snapshots.length === 0
  ? {
    status: "operational_evidence_pending",
    requiredCaptures: [
      "clean_build_a",
      "clean_build_b",
      "forced_reseed_a",
      "forced_reseed_b",
      "in_place_upgrade",
    ],
  }
  : verifySnapshots(snapshots);

if (failures.length > 0) {
  throw new Error(`Wave 6 verification failed:\n- ${failures.join("\n- ")}`);
}
process.stdout.write(`${JSON.stringify({
  contractVersion: "wave6.safe-seeds-and-identity-tooling.v1",
  staticGates: "passed",
  seedPacks: manifests,
  repeatability,
  liveMutationPerformed: false,
}, null, 2)}\n`);

async function seedManifest(
  plane: "neon" | "mesh",
  paths: string[],
): Promise<{ fileCount: number; manifestSha256: string }> {
  const lines: string[] = [];
  for (const path of [...paths].sort()) {
    const source = await readFile(path, "utf8");
    const sourcePath = normalize(relative(databaseRoot, path));
    const receipt = seedReceipt({
      plane,
      packKey: sourcePath,
      sourcePath,
      source,
    });
    lines.push(
      [
        receipt.packKey,
        receipt.packVersion,
        receipt.contentSha256,
      ].join(":"),
    );
  }
  return {
    fileCount: lines.length,
    manifestSha256: createHash("sha256").update(lines.join("\n")).digest("hex"),
  };
}

async function readSnapshots(args: string[]): Promise<SeedStateSnapshot[]> {
  const paths = args.filter((arg) => arg.startsWith("--snapshot="))
    .map((arg) => arg.slice("--snapshot=".length));
  if (paths.length !== 0 && paths.length !== 5) {
    throw new Error("provide exactly five --snapshot files or none");
  }
  return Promise.all(paths.map(async (path) =>
    JSON.parse(await readFile(path, "utf8")) as SeedStateSnapshot
  ));
}

function verifySnapshots(snapshots: SeedStateSnapshot[]) {
  const kinds = new Map(snapshots.map((snapshot) => [snapshot.captureKind, snapshot]));
  const requiredKinds: SeedStateSnapshot["captureKind"][] = [
    "clean_build_a",
    "clean_build_b",
    "forced_reseed_a",
    "forced_reseed_b",
    "in_place_upgrade",
  ];
  for (const kind of requiredKinds) {
    if (!kinds.has(kind)) throw new Error(`missing Wave 6 snapshot ${kind}`);
  }
  const plane = snapshots[0]?.plane;
  if (
    snapshots.some((snapshot) =>
      snapshot.contractVersion !== "wave6.seed-state-snapshot.v1"
      || snapshot.plane !== plane
      || !/^[0-9a-f]{64}$/.test(snapshot.seedLedgerSha256)
      || !/^[0-9a-f]{64}$/.test(snapshot.seedOwnedSha256)
      || !/^[0-9a-f]{64}$/.test(snapshot.identityCanonicalSha256)
    )
  ) {
    throw new Error("invalid or mixed-plane Wave 6 seed snapshots");
  }
  const baseline = kinds.get("clean_build_a")!;
  for (const kind of requiredKinds.slice(1)) {
    const candidate = kinds.get(kind)!;
    if (
      candidate.seedLedgerSha256 !== baseline.seedLedgerSha256
      || candidate.seedOwnedSha256 !== baseline.seedOwnedSha256
      || candidate.identityCount !== baseline.identityCount
      || candidate.identityCanonicalSha256 !== baseline.identityCanonicalSha256
    ) {
      throw new Error(`seed/identity state drift in ${kind}`);
    }
  }
  return { status: "passed", plane, comparedCaptures: requiredKinds };
}

function requireTokens(name: string, source: string, tokens: string[]): void {
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${name} missing ${token}`);
  }
}

async function read(path: string): Promise<string> {
  return readFile(resolve(repositoryRoot, path), "utf8");
}

async function findSqlFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) output.push(...await findSqlFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".sql")) output.push(path);
  }
  return output;
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}

function stripSqlComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
}
