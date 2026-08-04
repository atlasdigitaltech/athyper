#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

interface IdentityRow {
  principalId: string;
  boundaryId: string;
  principalCode: string;
  displayName: string;
  principalType: string;
  status: "active" | "inactive" | "locked" | "retired";
  bindingId: string;
  realmKey: string;
  providerCode: string;
  subjectId: string;
  username?: string | null;
  issuer?: string | null;
  clientId?: string | null;
}

interface IdentityManifest {
  contractVersion: "wave6.preserved-identity.v1";
  manifestId: string;
  plane: "neon" | "mesh";
  expectedDatabase: string;
  sourceSnapshotSha256: string;
  approvalTicket: string;
  fieldAuthority: Record<string, string>;
  identities: IdentityRow[];
  canonicalSha256: string;
}

const args = process.argv.slice(2);
const manifestPath = value(args, "--manifest");
const apply = args.includes("--apply");
if (!manifestPath) throw new Error("--manifest=<restricted JSON path> is required");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as IdentityManifest;
validateManifest(manifest);
const connectionVariable = manifest.plane === "mesh"
  ? "MESH_DATABASE_ADMIN_URL"
  : "DATABASE_ADMIN_URL";
const connectionString = process.env[connectionVariable]?.trim();
if (!connectionString) throw new Error(`${connectionVariable} is required`);

const client = new pg.Client({
  connectionString,
  application_name: `wave6-preserved-identity-${manifest.plane}`,
});
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`athyper:wave6:identity:${manifest.plane}`],
  );
  const identity = (await client.query<{ database_name: string }>(
    "SELECT current_database() AS database_name",
  )).rows[0];
  if (identity?.database_name !== manifest.expectedDatabase) {
    throw new Error(
      `identity migration DB mismatch: expected ${manifest.expectedDatabase}, got ${identity?.database_name}`,
    );
  }

  let inserts = 0;
  let matches = 0;
  for (const row of [...manifest.identities].sort((a, b) =>
    a.principalId.localeCompare(b.principalId)
  )) {
    const existing = await loadExisting(client, manifest.plane, row);
    if (existing.length > 1) {
      throw new Error(`identity ${row.principalId} resolves to multiple target rows`);
    }
    if (existing[0]) {
      assertExact(existing[0], row);
      matches += 1;
      continue;
    }
    if (apply) {
      await insertIdentity(client, manifest.plane, row);
    }
    inserts += 1;
  }

  if (apply) {
    const verified = await verifyManifestSet(client, manifest);
    if (
      verified.count !== manifest.identities.length
      || verified.canonicalSha256 !== manifest.canonicalSha256
    ) {
      throw new Error(
        "post-migration identity count/canonical hash does not match the approved manifest",
      );
    }
    await recordReceipt(client, manifest, inserts, matches);
    await client.query("COMMIT");
  } else {
    await client.query("ROLLBACK");
  }
  process.stdout.write(`${JSON.stringify({
    contractVersion: manifest.contractVersion,
    manifestId: manifest.manifestId,
    plane: manifest.plane,
    mode: apply ? "applied" : "dry_run",
    exactMatches: matches,
    inserts,
    deletes: 0,
    updates: 0,
    unmanagedIdentityMutation: false,
  }, null, 2)}\n`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

async function loadExisting(
  client: pg.Client,
  plane: "neon" | "mesh",
  row: IdentityRow,
): Promise<Array<Record<string, unknown>>> {
  const master = plane === "neon";
  const schema = master ? "master" : "mesh";
  const code = master ? "principal.code" : "principal.principal_code";
  const name = master ? "principal.name" : "principal.display_name";
  const status = master
    ? "CASE WHEN principal.is_locked THEN 'locked' ELSE principal.status END"
    : "principal.status";
  const boundary = master
    ? "principal.tenant_id::text"
    : "$4::uuid::text";
  const boundaryPredicate = master
    ? "AND principal.tenant_id = $4::uuid"
    : "";
  const result = await client.query(`
    SELECT
      principal.id::text AS "principalId",
      ${boundary} AS "boundaryId",
      ${code} AS "principalCode",
      ${name} AS "displayName",
      principal.principal_type AS "principalType",
      ${status} AS status,
      binding.id::text AS "bindingId",
      binding.realm_key AS "realmKey",
      binding.provider_code AS "providerCode",
      binding.subject_id AS "subjectId",
      binding.username,
      binding.issuer,
      binding.client_id AS "clientId"
    FROM ${schema}.principal principal
    LEFT JOIN ${schema}.principal_identity_binding binding
      ON binding.principal_id = principal.id
    WHERE (
       principal.id = $1::uuid
       OR binding.id = $2::uuid
       OR (
          binding.realm_key = $3
          AND binding.provider_code = $5
          AND binding.subject_id = $6
       )
    )
       ${boundaryPredicate}
  `, [
    row.principalId,
    row.bindingId,
    row.realmKey,
    row.boundaryId,
    row.providerCode,
    row.subjectId,
  ]);
  return result.rows;
}

async function insertIdentity(
  client: pg.Client,
  plane: "neon" | "mesh",
  row: IdentityRow,
): Promise<void> {
  if (plane === "neon") {
    await client.query(`
      INSERT INTO master.principal (
        id, tenant_id, code, name, principal_type,
        is_locked, is_service_account, principal_source,
        status, created_by
      ) VALUES (
        $1::uuid, $2::uuid, lower($3), $4, $5,
        $6, $7, 'import', $8,
        '00000000-0000-0000-0000-000000000000'::uuid
      )
    `, [
      row.principalId,
      row.boundaryId,
      row.principalCode,
      row.displayName,
      row.principalType,
      row.status === "locked",
      row.principalType === "service_account",
      row.status === "locked" ? "active" : row.status,
    ]);
    await client.query(`
      INSERT INTO master.principal_identity_binding (
        id, tenant_id, principal_id, realm_key, provider_code,
        subject_id, username, issuer, client_id,
        synced_at, sync_status, idp_enabled, created_by
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4, $5,
        $6, lower($7), $8, $9,
        now(), 'synced', $10,
        '00000000-0000-0000-0000-000000000000'::uuid
      )
    `, [
      row.bindingId,
      row.boundaryId,
      row.principalId,
      row.realmKey,
      row.providerCode,
      row.subjectId,
      row.username ?? null,
      row.issuer ?? null,
      row.clientId ?? null,
      row.status === "active",
    ]);
    return;
  }
  await client.query(`
    INSERT INTO mesh.principal (
      id, principal_code, display_name, principal_type,
      status, created_by
    ) VALUES ($1::uuid, $2, $3, $4, $5, 'wave6_identity_migration')
  `, [
    row.principalId,
    row.principalCode,
    row.displayName,
    row.principalType,
    row.status,
  ]);
  await client.query(`
    INSERT INTO mesh.principal_identity_binding (
      id, principal_id, realm_key, provider_code, subject_id,
      username, issuer, client_id, synced_at, sync_status, created_by
    ) VALUES (
      $1::uuid, $2::uuid, $3, $4, $5,
      lower($6), $7, $8, now(), 'synced', 'wave6_identity_migration'
    )
  `, [
    row.bindingId,
    row.principalId,
    row.realmKey,
    row.providerCode,
    row.subjectId,
    row.username ?? null,
    row.issuer ?? null,
    row.clientId ?? null,
  ]);
}

async function verifyManifestSet(
  client: pg.Client,
  manifest: IdentityManifest,
): Promise<{ count: number; canonicalSha256: string }> {
  const rows: Record<string, unknown>[] = [];
  for (const identity of manifest.identities) {
    const existing = await loadExisting(client, manifest.plane, identity);
    if (existing.length !== 1) {
      throw new Error(`identity verification failed for ${identity.principalId}`);
    }
    rows.push(existing[0]!);
  }
  return {
    count: rows.length,
    canonicalSha256: canonicalHash(rows as unknown as IdentityRow[]),
  };
}

async function recordReceipt(
  client: pg.Client,
  manifest: IdentityManifest,
  inserts: number,
  matches: number,
): Promise<void> {
  const schema = manifest.plane === "mesh" ? "mesh_control" : "governance";
  await client.query(`
    INSERT INTO ${schema}.preserved_identity_migration_receipt_v2 (
      manifest_id, plane_code, source_snapshot_sha256,
      manifest_sha256, identity_count, inserted_count,
      exact_match_count, approval_ticket
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (manifest_id) DO NOTHING
  `, [
    manifest.manifestId,
    manifest.plane,
    manifest.sourceSnapshotSha256,
    manifest.canonicalSha256,
    manifest.identities.length,
    inserts,
    matches,
    manifest.approvalTicket,
  ]);
  const receipt = await client.query<{
    plane_code: string;
    source_snapshot_sha256: string;
    manifest_sha256: string;
    identity_count: number;
    inserted_count: number;
    exact_match_count: number;
    approval_ticket: string;
  }>(`
    SELECT
      plane_code, source_snapshot_sha256, manifest_sha256,
      identity_count, inserted_count, exact_match_count, approval_ticket
    FROM ${schema}.preserved_identity_migration_receipt_v2
    WHERE manifest_id = $1
  `, [manifest.manifestId]);
  const row = receipt.rows[0];
  if (
    !row
    || row.plane_code !== manifest.plane
    || row.source_snapshot_sha256 !== manifest.sourceSnapshotSha256
    || row.manifest_sha256 !== manifest.canonicalSha256
    || Number(row.identity_count) !== manifest.identities.length
    || Number(row.inserted_count) + Number(row.exact_match_count)
      !== manifest.identities.length
    || row.approval_ticket !== manifest.approvalTicket
  ) {
    throw new Error("immutable preserved identity receipt conflict");
  }
}

function assertExact(
  actual: Record<string, unknown>,
  expected: IdentityRow,
): void {
  const keys: Array<keyof IdentityRow> = [
    "principalId", "boundaryId", "principalCode", "displayName",
    "principalType", "status", "bindingId", "realmKey", "providerCode",
    "subjectId", "username", "issuer", "clientId",
  ];
  for (const key of keys) {
    if ((actual[key] ?? null) !== (expected[key] ?? null)) {
      throw new Error(
        `identity field-authority conflict ${expected.principalId}.${key}`,
      );
    }
  }
}

function validateManifest(manifest: IdentityManifest): void {
  const requiredFieldAuthority = {
    principalId: "manifest_immutable",
    boundaryId: "manifest_immutable",
    principalCode: "manifest_conflict_fail",
    displayName: "manifest_conflict_fail",
    principalType: "manifest_conflict_fail",
    status: "external_identity_conflict_fail",
    bindingId: "manifest_immutable",
    realmKey: "external_identity_immutable",
    providerCode: "external_identity_immutable",
    subjectId: "external_identity_immutable",
    username: "external_identity_conflict_fail",
    issuer: "external_identity_conflict_fail",
    clientId: "external_identity_conflict_fail",
  };
  if (
    manifest.contractVersion !== "wave6.preserved-identity.v1"
    || !manifest.manifestId
    || !manifest.expectedDatabase
    || !manifest.approvalTicket
    || !/^[0-9a-f]{64}$/.test(manifest.sourceSnapshotSha256)
    || !Array.isArray(manifest.identities)
    || manifest.identities.length === 0
  ) {
    throw new Error("invalid preserved identity manifest");
  }
  for (const [field, authority] of Object.entries(requiredFieldAuthority)) {
    if (manifest.fieldAuthority[field] !== authority) {
      throw new Error(`invalid field authority for ${field}`);
    }
  }
  if (
    Object.keys(manifest.fieldAuthority).some(
      (field) => !(field in requiredFieldAuthority),
    )
  ) {
    throw new Error("preserved identity manifest has unrecognized field authority");
  }
  const ids = manifest.identities.flatMap((row) => [
    row.principalId,
    row.bindingId,
  ]);
  if (new Set(ids).size !== ids.length) {
    throw new Error("preserved identity manifest contains duplicate IDs");
  }
  if (canonicalHash(manifest.identities) !== manifest.canonicalSha256) {
    throw new Error("preserved identity canonical hash mismatch");
  }
}

function canonicalHash(rows: IdentityRow[]): string {
  const canonical = [...rows]
    .sort((a, b) => a.principalId.localeCompare(b.principalId))
    .map((row) => JSON.stringify({
      bindingId: row.bindingId,
      boundaryId: row.boundaryId,
      clientId: row.clientId ?? null,
      displayName: row.displayName,
      issuer: row.issuer ?? null,
      principalCode: row.principalCode,
      principalId: row.principalId,
      principalType: row.principalType,
      providerCode: row.providerCode,
      realmKey: row.realmKey,
      status: row.status,
      subjectId: row.subjectId,
      username: row.username ?? null,
    }))
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

function value(args: string[], name: string): string | undefined {
  return args.find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1).trim();
}
