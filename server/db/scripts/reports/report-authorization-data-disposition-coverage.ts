#!/usr/bin/env tsx
/**
 * Read-only live overlay for the checked-in table/object disposition inventory.
 *
 * It inventories every live user table/partition, inherits a disposition only
 * from a known partition parent, and refuses to apply schema defaults to
 * unversioned runtime tables. External stores are verified through a separate
 * non-secret evidence manifest.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

interface Options {
  plane: "neon" | "mesh";
  output?: string;
  externalEvidence?: string;
  strict: boolean;
}

interface LiveRelation {
  oid: string;
  schema_name: string;
  relation_name: string;
  relation_kind: "r" | "p" | "m" | "f";
  parent_oid: string | null;
}

interface InventoryRow {
  id: string;
  schema: string;
  table: string;
  dataClass: string;
  disposition: string;
  retention: string;
  evidence: string;
  approvalStatus: string;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../../..");
const options = parseOptions(process.argv.slice(2));
const connectionVariable = options.plane === "mesh"
  ? "MESH_DATABASE_URL"
  : "DATABASE_URL";
const connectionString = process.env[connectionVariable]?.trim();
if (!connectionString) {
  throw new Error(
    `${connectionVariable} is required for the ${options.plane} live disposition report.`,
  );
}

const inventoryPath = resolve(
  repositoryRoot,
  "config/governance/authorization-data-disposition-inventory.v1.json",
);
const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as {
  policyHash: string;
  approval: { status: string };
  gates: { allDispositionsApproved: boolean };
  tables: InventoryRow[];
  externalObjects: Array<{
    id: string;
    dataClass: string;
    disposition: string;
    retention: string;
    evidence: string;
    approvalStatus: string;
  }>;
};
const externalEvidence = options.externalEvidence
  ? JSON.parse(await readFile(options.externalEvidence, "utf8")) as {
      schemaVersion: number;
      policyHash: string;
      environment: string;
      inventoryAuthoritative: boolean;
      inventorySourceUri: string;
      inventorySourceSha256: string;
      inventoryCapturedAt: string;
      objects: Array<{
        id: string;
        status: string;
        evidenceUri: string;
        evidenceSha256: string;
        verifiedBy: string;
        verifiedAt: string;
      }>;
    }
  : null;

const authoritativeExternalInventory =
  externalEvidence?.schemaVersion === 1 &&
  externalEvidence.inventoryAuthoritative === true &&
  Boolean(externalEvidence.environment?.trim()) &&
  Boolean(externalEvidence.inventorySourceUri?.trim()) &&
  /^[0-9a-f]{64}$/.test(externalEvidence.inventorySourceSha256 ?? "") &&
  !Number.isNaN(Date.parse(externalEvidence.inventoryCapturedAt ?? "")) &&
  Date.parse(externalEvidence.inventoryCapturedAt) <= Date.now();

const client = new pg.Client({
  connectionString,
  application_name: "wave0-authorization-data-disposition-report",
});

try {
  await client.connect();
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL statement_timeout = '60s'");

  const boundary = (await client.query<{
    database_name: string;
    database_oid: string;
    captured_at: string;
  }>(`
    SELECT
      current_database() AS database_name,
      (SELECT oid::text FROM pg_database WHERE datname = current_database())
        AS database_oid,
      statement_timestamp()::text AS captured_at
  `)).rows[0];
  if (!boundary) throw new Error("Unable to read database identity.");

  const captureClockQuery = options.plane === "mesh"
    ? `
        SELECT
          plane_key,
          source_database_id::text,
          capture_contract_version,
          current_watermark::text,
          installed_at::text,
          updated_at::text
        FROM mesh_log.authorization_capture_clock
        WHERE singleton_id = 1
      `
    : `
        SELECT
          'neon'::text AS plane_key,
          source_database_id::text,
          capture_contract_version,
          current_watermark::text,
          installed_at::text,
          updated_at::text
        FROM event.authorization_capture_clock
        WHERE singleton_id = 1
      `;
  const captureClock = (await client.query<{
    plane_key: string;
    source_database_id: string;
    capture_contract_version: string;
    current_watermark: string;
    installed_at: string;
    updated_at: string;
  }>(captureClockQuery)).rows[0] ?? null;

  const relations = (await client.query<LiveRelation>(`
    SELECT
      relation.oid::text,
      namespace.nspname AS schema_name,
      relation.relname AS relation_name,
      relation.relkind AS relation_kind,
      inheritance.inhparent::text AS parent_oid
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_inherits AS inheritance
      ON inheritance.inhrelid = relation.oid
    WHERE relation.relkind IN ('r', 'p', 'm', 'f')
      AND namespace.nspname <> 'information_schema'
      AND namespace.nspname !~ '^pg_'
    ORDER BY namespace.nspname, relation.relname
  `)).rows;

  const duplicateInventoryIds = duplicates(inventory.tables.map((row) => row.id));
  const inventoryById = new Map(inventory.tables.map((row) => [row.id, row]));
  const relationByOid = new Map(relations.map((row) => [row.oid, row]));
  const liveTables = relations.map((relationRow) => {
    const id = `${relationRow.schema_name}.${relationRow.relation_name}`;
    const direct = inventoryById.get(id);
    const ancestor = direct
      ? null
      : findRegisteredAncestor(relationRow, relationByOid, inventoryById);
    const decision = direct ?? ancestor?.inventory ?? null;
    return {
      id,
      relationKind: relationRow.relation_kind === "p"
        ? "partitioned_table"
        : relationRow.relation_kind === "m"
          ? "materialized_view"
          : relationRow.relation_kind === "f"
            ? "foreign_table"
            : relationRow.parent_oid ? "partition" : "table",
      dispositionMatch: direct
        ? "exact_versioned_table"
        : ancestor ? "inherited_partition_parent" : "unmatched",
      inheritedFrom: ancestor?.id ?? null,
      dataClass: decision?.dataClass ?? null,
      disposition: decision?.disposition ?? null,
      retention: decision?.retention ?? null,
      approvalStatus: decision?.approvalStatus ?? null,
    };
  });
  const unmatched = liveTables.filter((row) => row.dispositionMatch === "unmatched");
  const forbiddenPlaneObjects = liveTables.filter((row) =>
    options.plane === "neon"
      ? ["mesh", "mesh_control", "mesh_log"].includes(row.id.split(".")[0] ?? "")
      : !["public", "shared", "mesh", "mesh_control", "mesh_log"]
        .includes(row.id.split(".")[0] ?? ""),
  );

  const evidenceById = new Map(
    (externalEvidence?.objects ?? []).map((row) => [row.id, row]),
  );
  const duplicateExternalEvidenceIds = duplicates(
    (externalEvidence?.objects ?? []).map((row) => row.id),
  );
  const externalObjects = inventory.externalObjects.map((object) => {
    const evidence = evidenceById.get(object.id);
    const verified =
      externalEvidence?.schemaVersion === 1 &&
      externalEvidence.policyHash === inventory.policyHash &&
      evidence?.status === "verified" &&
      /^[0-9a-f]{64}$/.test(evidence.evidenceSha256) &&
      Boolean(evidence.evidenceUri) &&
      Boolean(evidence.verifiedBy) &&
      !Number.isNaN(Date.parse(evidence.verifiedAt)) &&
      Date.parse(evidence.verifiedAt) <= Date.now() &&
      Date.parse(evidence.verifiedAt) >=
        Date.parse(externalEvidence.inventoryCapturedAt);
    return {
      ...object,
      verified,
      verification: verified ? evidence : null,
    };
  });
  const missingExternalEvidence = externalObjects
    .filter((row) => !row.verified)
    .map((row) => row.id);
  const unexpectedExternalEvidence = [...evidenceById.keys()]
    .filter((id) => !inventory.externalObjects.some((row) => row.id === id))
    .sort();

  const blockingReasons = [
    ...(!captureClock ? ["authorization_capture_clock_missing"] : []),
    ...(captureClock && captureClock.plane_key !== options.plane
      ? ["authorization_capture_clock_plane_mismatch"]
      : []),
    ...(duplicateInventoryIds.length ? ["duplicate_checked_in_table_disposition"] : []),
    ...(unmatched.length ? ["unmatched_live_table"] : []),
    ...(forbiddenPlaneObjects.length ? ["opposite_plane_schema_present"] : []),
    ...(
      inventory.approval.status !== "approved" ||
      inventory.gates?.allDispositionsApproved !== true
        ? ["disposition_policy_not_approved"]
        : []
    ),
    ...(!externalEvidence ? ["external_object_evidence_missing"] : []),
    ...(externalEvidence && !authoritativeExternalInventory
      ? ["external_inventory_not_authoritative"]
      : []),
    ...(externalEvidence && externalEvidence.policyHash !== inventory.policyHash
      ? ["external_evidence_policy_hash_mismatch"]
      : []),
    ...(missingExternalEvidence.length ? ["unverified_external_object"] : []),
    ...(unexpectedExternalEvidence.length ? ["unexpected_external_evidence"] : []),
    ...(duplicateExternalEvidenceIds.length ? ["duplicate_external_evidence"] : []),
  ];
  const report = {
    schemaVersion: "wave0.authorization-data-disposition-coverage.v1",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    plane: options.plane,
    database: boundary,
    authorizationCapture: captureClock
      ? {
          plane: captureClock.plane_key,
          sourceDatabaseId: captureClock.source_database_id,
          contractVersion: captureClock.capture_contract_version,
          currentWatermark: captureClock.current_watermark,
          installedAt: captureClock.installed_at,
          updatedAt: captureClock.updated_at,
        }
      : null,
    inventory: {
      path: relative(repositoryRoot, inventoryPath).replaceAll("\\", "/"),
      policyHash: inventory.policyHash,
      approvalStatus: inventory.approval.status,
    },
    externalInventory: externalEvidence
      ? {
          environment: externalEvidence.environment ?? null,
          authoritative: authoritativeExternalInventory,
          sourceUri: externalEvidence.inventorySourceUri ?? null,
          sourceSha256: externalEvidence.inventorySourceSha256 ?? null,
          capturedAt: externalEvidence.inventoryCapturedAt ?? null,
        }
      : null,
    gate: {
      passed: blockingReasons.length === 0,
      blockingReasons,
    },
    summary: {
      liveTableCount: liveTables.length,
      exactMatchCount: liveTables.filter(
        (row) => row.dispositionMatch === "exact_versioned_table",
      ).length,
      inheritedPartitionCount: liveTables.filter(
        (row) => row.dispositionMatch === "inherited_partition_parent",
      ).length,
      unmatched: unmatched.length,
      multiplyMatched: duplicateInventoryIds.length,
      forbiddenPlaneObjectCount: forbiddenPlaneObjects.length,
      externalObjectCount: externalObjects.length,
      unverifiedExternalObjectCount: missingExternalEvidence.length,
      unexpectedExternalEvidenceCount: unexpectedExternalEvidence.length,
    },
    liveTables,
    unmatchedTables: unmatched,
    duplicateInventoryIds,
    forbiddenPlaneObjects,
    externalObjects,
    missingExternalEvidence,
    unexpectedExternalEvidence,
    duplicateExternalEvidenceIds,
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, serialized, "utf8");
    process.stdout.write(`Wrote ${options.output}\n`);
  } else {
    process.stdout.write(serialized);
  }
  if (options.strict && blockingReasons.length > 0) process.exitCode = 2;
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  await client.end().catch(() => undefined);
}

function parseOptions(args: string[]): Options {
  const options: Options = { plane: "neon", strict: false };
  for (const argument of args) {
    if (argument === "--strict") options.strict = true;
    else if (argument.startsWith("--plane=")) {
      const plane = argument.slice("--plane=".length);
      if (plane !== "neon" && plane !== "mesh") {
        throw new Error("--plane must be neon or mesh");
      }
      options.plane = plane;
    } else if (argument.startsWith("--output=")) {
      const value = argument.slice("--output=".length).trim();
      if (!value) throw new Error("--output requires a path");
      options.output = resolve(value);
    } else if (argument.startsWith("--external-evidence=")) {
      const value = argument.slice("--external-evidence=".length).trim();
      if (!value) throw new Error("--external-evidence requires a path");
      options.externalEvidence = resolve(value);
    } else if (argument === "--help") {
      process.stdout.write(
        "Usage: report-authorization-data-disposition-coverage.ts "
        + "[--plane=neon|mesh] [--external-evidence=PATH] "
        + "[--output=PATH] [--strict]\n"
        + "Neon requires DATABASE_URL; Mesh requires MESH_DATABASE_URL. "
        + "There is no cross-plane connection fallback.\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function findRegisteredAncestor(
  relation: LiveRelation,
  relationByOid: Map<string, LiveRelation>,
  inventoryById: Map<string, InventoryRow>,
) {
  const visited = new Set<string>();
  let parentOid = relation.parent_oid;
  while (parentOid && !visited.has(parentOid)) {
    visited.add(parentOid);
    const parent = relationByOid.get(parentOid);
    if (!parent) return null;
    const id = `${parent.schema_name}.${parent.relation_name}`;
    const inventoryRow = inventoryById.get(id);
    if (inventoryRow) return { id, inventory: inventoryRow };
    parentOid = parent.parent_oid;
  }
  return null;
}

function duplicates(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}
