#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

type Plane = "neon" | "mesh";

interface Contract {
  status: string;
  cascadeDropsAllowed: boolean;
  liveExecution: { authorized: boolean; reason: string };
}

interface RemovalObject {
  stage: number;
  plane: Plane | "both";
  kind: "table" | "function";
  name: string;
}

interface RemovalManifest {
  schemaVersion: number;
  manifestId: string;
  dropBehavior: string;
  objects: RemovalObject[];
}

interface ContractionAuthorization {
  contractVersion: "wave9.contraction-authorization.v1";
  executionId: string;
  plane: Plane;
  expectedDatabase: string;
  repositoryRevision: string;
  wave8: {
    certified: boolean;
    rehearsalId: string;
    certificationSha256: string;
  };
  rollbackRetention: {
    completed: boolean;
    endedAt: string;
    approvalTicket: string;
    owner: string;
  };
  repository: {
    applicationReaderWriterFindings: number;
  };
  live: {
    databaseDependencyFindings: number;
    applicationReaderWriterFindings: number;
    projectionLagTransactions: number;
    rollbackDependsOnLegacyObject: boolean;
  };
  approval: {
    status: "approved";
    changeTicket: string;
    changeOwner: string;
    securityApprover: string;
    databaseOwner: string;
    approvedAt: string;
  };
}

const args = process.argv.slice(2);
const plane = option("--plane") as Plane | undefined;
const expectedDatabase = option("--expected-database");
const authorizationPath = option("--authorization");
const execute = args.includes("--execute");
const acknowledgement = option("--acknowledge");
if (
  (plane !== "neon" && plane !== "mesh")
  || !expectedDatabase
  || !authorizationPath
) {
  throw new Error(
    "--plane=neon|mesh, --expected-database, and --authorization are required",
  );
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../../..");
const contractPath = resolve(
  repositoryRoot,
  "config/governance/authorization-wave9-contraction-contract.v1.json",
);
const manifestPath = resolve(
  repositoryRoot,
  "config/governance/authorization-wave9-legacy-removal-manifest.v1.json",
);
const sqlPath = resolve(
  repositoryRoot,
  `server/db/migrations/contraction/${plane}/001_authorization_v2_tombstone.sql`,
);
const [contractText, manifestText, authorizationText, sql] = await Promise.all([
  readFile(contractPath, "utf8"),
  readFile(manifestPath, "utf8"),
  readFile(resolve(authorizationPath), "utf8"),
  readFile(sqlPath, "utf8"),
]);
const contract = JSON.parse(contractText) as Contract;
const manifest = JSON.parse(manifestText) as RemovalManifest;
const authorization = JSON.parse(authorizationText) as ContractionAuthorization;
const blockers = validateAuthorization(
  contract,
  manifest,
  authorization,
  plane,
  expectedDatabase,
);
const plan = manifest.objects
  .filter((item) => item.plane === plane || item.plane === "both")
  .sort((left, right) => left.stage - right.stage);

if (!execute) {
  process.stdout.write(`${JSON.stringify({
    contractVersion: "wave9.tombstone-plan.v1",
    plane,
    expectedDatabase,
    executionAuthorized: blockers.length === 0,
    blockers,
    cascadeDropsAllowed: false,
    transactionMode: "single_transaction_restrict",
    objects: plan,
    liveMutationPerformed: false,
  }, null, 2)}\n`);
  process.exit(0);
}

if (blockers.length > 0) {
  throw new Error(`Wave 9 contraction is blocked:\n- ${blockers.join("\n- ")}`);
}
if (
  acknowledgement !== `DROP_LEGACY_AUTHORIZATION_${plane.toUpperCase()}`
) {
  throw new Error(
    `--acknowledge=DROP_LEGACY_AUTHORIZATION_${plane.toUpperCase()} is required`,
  );
}

const variable = plane === "mesh"
  ? "MESH_DATABASE_ADMIN_URL"
  : "DATABASE_ADMIN_URL";
const connectionString = process.env[variable]?.trim();
if (!connectionString) throw new Error(`${variable} is required`);
const evidenceSha256 = sha256(authorizationText);
const manifestSha256 = sha256(manifestText);
const client = new pg.Client({
  connectionString,
  application_name: `wave9-tombstone-${plane}`,
});

await client.connect();
try {
  await client.query("BEGIN");
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`athyper:wave9:contraction:${plane}`],
  );
  const identity = await client.query<{
    database_name: string;
    opposite_schema_count: string;
  }>(`
    SELECT
      current_database() AS database_name,
      (
        SELECT count(*)::text
          FROM pg_namespace
         WHERE nspname = ANY(
           CASE $1
             WHEN 'neon' THEN ARRAY['mesh', 'mesh_control', 'mesh_log']
             ELSE ARRAY['master', 'control', 'document', 'event', 'log']
           END
         )
      ) AS opposite_schema_count
  `, [plane]);
  if (
    identity.rows[0]?.database_name !== expectedDatabase
    || Number(identity.rows[0]?.opposite_schema_count) !== 0
  ) throw new Error("exact database identity or plane boundary mismatch");

  for (const [key, value] of Object.entries({
    authorized: "true",
    plane,
    execution_id: authorization.executionId,
    evidence_sha256: evidenceSha256,
    manifest_sha256: manifestSha256,
    repository_revision: authorization.repositoryRevision,
  })) {
    await client.query("SELECT set_config($1, $2, true)", [
      `athyper.wave9.${key}`,
      value,
    ]);
  }

  await client.query(sql);
  const remaining = await findRemainingObjects(client, plan);
  if (remaining.length > 0) {
    throw new Error(
      `tombstone left legacy objects:\n- ${remaining.join("\n- ")}`,
    );
  }
  const receipt = await client.query(`
    SELECT plane, execution_id, database_name, repository_revision,
           evidence_sha256, removal_manifest_sha256, completed_at, completed_by
      FROM public.authorization_contraction_receipt_v2
     WHERE plane = $1
  `, [plane]);
  if (receipt.rowCount !== 1) throw new Error("tombstone receipt was not recorded");
  await client.query("COMMIT");
  process.stdout.write(`${JSON.stringify({
    contractVersion: "wave9.tombstone-receipt.v1",
    plane,
    expectedDatabase,
    evidenceSha256,
    manifestSha256,
    remainingLegacyObjects: 0,
    receipt: receipt.rows[0],
    liveMutationPerformed: true,
  }, null, 2)}\n`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

function validateAuthorization(
  checkedInContract: Contract,
  removalManifest: RemovalManifest,
  input: ContractionAuthorization,
  selectedPlane: Plane,
  database: string,
): string[] {
  const failures: string[] = [];
  if (
    checkedInContract.status !== "approved"
    || !checkedInContract.liveExecution.authorized
  ) failures.push(`checked_in_contract_not_authorized:${checkedInContract.liveExecution.reason}`);
  if (checkedInContract.cascadeDropsAllowed || removalManifest.dropBehavior !== "restrict_only") {
    failures.push("restrict_only_drop_contract_violated");
  }
  if (
    input.contractVersion !== "wave9.contraction-authorization.v1"
    || input.plane !== selectedPlane
    || input.expectedDatabase !== database
    || !input.executionId?.trim()
    || !input.repositoryRevision?.trim()
  ) failures.push("authorization_boundary_mismatch");
  if (
    !input.wave8?.certified
    || !input.wave8.rehearsalId?.trim()
    || !isSha256(input.wave8.certificationSha256)
  ) failures.push("wave8_not_certified");
  const retentionEnd = Date.parse(input.rollbackRetention?.endedAt ?? "");
  if (
    !input.rollbackRetention?.completed
    || !Number.isFinite(retentionEnd)
    || retentionEnd > Date.now()
    || !input.rollbackRetention.approvalTicket?.trim()
    || !input.rollbackRetention.owner?.trim()
  ) failures.push("rollback_retention_not_complete");
  if (
    input.repository?.applicationReaderWriterFindings !== 0
    || input.live?.databaseDependencyFindings !== 0
    || input.live?.applicationReaderWriterFindings !== 0
    || input.live?.projectionLagTransactions !== 0
    || input.live?.rollbackDependsOnLegacyObject
  ) failures.push("legacy_dependency_or_writer_remains");
  if (
    input.approval?.status !== "approved"
    || !input.approval.changeTicket?.trim()
    || !input.approval.changeOwner?.trim()
    || !input.approval.securityApprover?.trim()
    || !input.approval.databaseOwner?.trim()
    || !Number.isFinite(Date.parse(input.approval.approvedAt))
  ) failures.push("contraction_approval_incomplete");
  return [...new Set(failures)].sort();
}

async function findRemainingObjects(
  client: pg.Client,
  objects: RemovalObject[],
): Promise<string[]> {
  const remaining: string[] = [];
  for (const item of objects) {
    const [schema, name] = splitQualified(item.name);
    if (item.kind === "table") {
      const result = await client.query<{ present: boolean }>(
        "SELECT to_regclass($1) IS NOT NULL AS present",
        [item.name],
      );
      if (result.rows[0]?.present) remaining.push(item.name);
    } else {
      const result = await client.query<{ present: boolean }>(`
        SELECT EXISTS (
          SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = $1 AND p.proname = $2
        ) AS present
      `, [schema, name]);
      if (result.rows[0]?.present) remaining.push(item.name);
    }
  }
  return remaining.sort();
}

function splitQualified(value: string): [string, string] {
  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`invalid qualified object name: ${value}`);
  }
  return [parts[0], parts[1]];
}

function option(name: string): string | undefined {
  return args.find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1).trim();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
