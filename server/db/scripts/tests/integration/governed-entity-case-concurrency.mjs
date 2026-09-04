#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
const plane = process.env.DATABASE_PLANE?.trim() || "neon";
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!new Set(["studio", "neon", "mesh"]).has(plane))
  throw new Error("DATABASE_PLANE must be studio, neon, or mesh");

const { Client } = pg;
const fixture = {
  contractId: randomUUID(),
  contractEntityId: randomUUID(),
  releaseId: randomUUID(),
  revisionId: randomUUID(),
  caseId: randomUUID(),
  formId: randomUUID(),
  prefix: `g1-concurrency-${randomUUID()}`,
};

const control = new Client({
  connectionString: databaseUrl,
  application_name: "g1-case-concurrency-control",
});
await control.connect();
let tenantId;
let actorId;
try {
  const identity = await control.query(`
    SELECT tenant.id AS tenant_id, principal.id AS actor_id
      FROM master.tenant AS tenant
      JOIN master.principal AS principal
        ON principal.tenant_id = tenant.id AND principal.status = 'active'
     ORDER BY tenant.id, principal.id
     LIMIT 1
  `);
  assert.equal(
    identity.rowCount,
    1,
    "concurrency probe requires one active tenant principal",
  );
  tenantId = identity.rows[0].tenant_id;
  actorId = identity.rows[0].actor_id;
  await setContext(control);
  await control.query(
    `
    INSERT INTO runtime_meta.entity_contract(
      id, tenant_id, entity_id, entity_code, release_id, revision_id, release_no,
      contract_schema_code, contract_schema_version, entity_contract_hash,
      contract_json, publication_key, signature_algorithm, signing_key_id,
      signature, published_at, status, status_changed_at
    ) VALUES (
      $1, $2, $3, 'master.business_partner', $4, $5, 1,
      'athyper.entity-contract', '1.0.0', repeat('c', 64),
      '{"type":"object","required":["name","country"],"additionalProperties":false,"properties":{"name":{"type":"string"},"country":{"type":"string"}}}'::jsonb,
      'g1.concurrency', 'ed25519', 'g1-key', 'probe', clock_timestamp() - interval '1 second',
      'published', clock_timestamp()
    )
  `,
    [
      fixture.contractId,
      tenantId,
      fixture.contractEntityId,
      fixture.releaseId,
      fixture.revisionId,
    ],
  );

  const created = await command(
    control,
    0,
    null,
    { name: "Alpha", country: "MY" },
    `${fixture.prefix}-create`,
  );
  assert.equal(created.row_version, "1");
  const baseSnapshotId = created.snapshot_id;

  const [left, right] = await Promise.all([
    runConcurrent(
      1,
      baseSnapshotId,
      { name: "Beta", country: "MY" },
      `${fixture.prefix}-merge-left`,
    ),
    runConcurrent(
      1,
      baseSnapshotId,
      { name: "Alpha", country: "SG" },
      `${fixture.prefix}-merge-right`,
    ),
  ]);
  assert.deepEqual([left.row_version, right.row_version].sort(), ["2", "3"]);
  assert.equal(left.disposition, "accepted");
  assert.equal(right.disposition, "accepted");

  const afterMerge = await currentState();
  assert.equal(afterMerge.row_version, "3");
  assert.deepEqual(afterMerge.payload_json, { name: "Beta", country: "SG" });

  const [firstConflict, secondConflict] = await Promise.all([
    runConcurrent(
      3,
      afterMerge.current_snapshot_id,
      { name: "Gamma", country: "SG" },
      `${fixture.prefix}-conflict-left`,
    ),
    runConcurrent(
      3,
      afterMerge.current_snapshot_id,
      { name: "Delta", country: "SG" },
      `${fixture.prefix}-conflict-right`,
    ),
  ]);
  assert.deepEqual(
    [firstConflict.disposition, secondConflict.disposition].sort(),
    ["accepted", "conflict"],
  );
  const conflict =
    firstConflict.disposition === "conflict" ? firstConflict : secondConflict;
  assert.deepEqual(conflict.conflict_paths, ["/name"]);
  assert.equal(conflict.row_version, "4");

  const beforeReplay = await currentState();
  const replayKey = `${fixture.prefix}-exact-replay`;
  const [firstReplay, secondReplay] = await Promise.all([
    runConcurrent(
      4,
      beforeReplay.current_snapshot_id,
      { name: "Epsilon", country: "SG" },
      replayKey,
    ),
    runConcurrent(
      4,
      beforeReplay.current_snapshot_id,
      { country: "SG", name: "Epsilon" },
      replayKey,
    ),
  ]);
  assert.deepEqual([firstReplay.replayed, secondReplay.replayed].sort(), [
    false,
    true,
  ]);
  assert.equal(firstReplay.snapshot_id, secondReplay.snapshot_id);
  assert.equal(firstReplay.outbox_id, secondReplay.outbox_id);

  const counts = await control.query(
    `
    SELECT
      (SELECT count(*)::int FROM document.entity_case_command_evidence WHERE tenant_id = $1 AND entity_case_id = $2) AS evidence_count,
      (SELECT count(*)::int FROM event.outbox WHERE tenant_id = $1 AND aggregate_type = 'entity_case' AND aggregate_id = $2) AS outbox_count,
      (SELECT count(*)::int FROM snapshot.entity_snapshot_identity WHERE tenant_id = $1 AND entity_type = 'document.entity_case' AND entity_id = $2) AS snapshot_count
  `,
    [tenantId, fixture.caseId],
  );
  assert.deepEqual(counts.rows[0], {
    evidence_count: 6,
    outbox_count: 6,
    snapshot_count: 5,
  });
  console.log(`G1_GOVERNED_ENTITY_CASE_LIVE_CONCURRENCY_OK plane=${plane}`);
} finally {
  if (tenantId) await cleanup();
  await control.end();
}

async function setContext(client) {
  await client.query("SELECT set_config('app.database_plane', $1, false)", [
    plane,
  ]);
  await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [
    tenantId,
  ]);
  await client.query(
    "SELECT set_config('app.current_principal_id', $1, false)",
    [actorId],
  );
}

async function command(
  client,
  expectedVersion,
  baseSnapshotId,
  payload,
  idempotencyKey,
) {
  const result = await client.query(
    `
    SELECT * FROM document.command_entity_case_draft(
      $1, $2, $3, $4, 'G1.CONCURRENCY', 'master.business_partner', 'register', NULL,
      'g1-concurrency', $5, repeat('c', 64), $6, 1, repeat('d', 64), $7::jsonb, $8, $9, NULL
    )
  `,
    [
      tenantId,
      fixture.caseId,
      expectedVersion,
      baseSnapshotId,
      fixture.contractId,
      fixture.formId,
      JSON.stringify(payload),
      idempotencyKey,
      actorId,
    ],
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

async function runConcurrent(
  expectedVersion,
  baseSnapshotId,
  payload,
  idempotencyKey,
) {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "g1-case-concurrency-worker",
  });
  await client.connect();
  try {
    await setContext(client);
    return await command(
      client,
      expectedVersion,
      baseSnapshotId,
      payload,
      idempotencyKey,
    );
  } finally {
    await client.end();
  }
}

async function currentState() {
  const result = await control.query(
    `
    SELECT entity_case.row_version, entity_case.current_snapshot_id, entity_snapshot.payload_json
      FROM document.entity_case AS entity_case
      JOIN snapshot.entity_snapshot AS entity_snapshot
        ON entity_snapshot.tenant_id = entity_case.tenant_id
       AND entity_snapshot.snapshot_id = entity_case.current_snapshot_id
     WHERE entity_case.tenant_id = $1 AND entity_case.id = $2
  `,
    [tenantId, fixture.caseId],
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

async function cleanup() {
  await control.query("BEGIN");
  try {
    await control.query("SET LOCAL session_replication_role = replica");
    await control.query(
      "DELETE FROM event.outbox WHERE tenant_id = $1 AND aggregate_type = 'entity_case' AND aggregate_id = $2",
      [tenantId, fixture.caseId],
    );
    await control.query(
      "DELETE FROM document.entity_case_command_evidence WHERE tenant_id = $1 AND entity_case_id = $2",
      [tenantId, fixture.caseId],
    );
    await control.query(
      "DELETE FROM event.command_execution WHERE tenant_id = $1 AND command_code = 'entity.case.draft.write' AND idempotency_key LIKE $2",
      [tenantId, `${fixture.prefix}%`],
    );
    await control.query(
      "DELETE FROM document.entity_case WHERE tenant_id = $1 AND id = $2",
      [tenantId, fixture.caseId],
    );
    await control.query(
      "DELETE FROM snapshot.entity_snapshot WHERE tenant_id = $1 AND snapshot_id IN (SELECT id FROM snapshot.entity_snapshot_identity WHERE tenant_id = $1 AND entity_type = 'document.entity_case' AND entity_id = $2)",
      [tenantId, fixture.caseId],
    );
    await control.query(
      "DELETE FROM snapshot.entity_snapshot_identity WHERE tenant_id = $1 AND entity_type = 'document.entity_case' AND entity_id = $2",
      [tenantId, fixture.caseId],
    );
    await control.query(
      "DELETE FROM runtime_meta.entity_contract WHERE tenant_id = $1 AND id = $2",
      [tenantId, fixture.contractId],
    );
    await control.query("COMMIT");
  } catch (error) {
    await control.query("ROLLBACK");
    throw error;
  }
}
