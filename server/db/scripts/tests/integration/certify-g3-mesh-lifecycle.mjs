#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Client } from "pg";

const root = resolve(import.meta.dirname, "../../../../.."),
  url =
    arg("--mesh-database-url") ??
    process.env.ATHYPER_MESH_DATABASE_ADMIN_URL ??
    process.env.DATABASE_URL,
  output = arg("--output");
if (!url)
  throw new Error(
    "--mesh-database-url or ATHYPER_MESH_DATABASE_ADMIN_URL is required",
  );
const system = "00000000-0000-0000-0000-000000000000",
  ids = {
    buyerTenant: randomUUID(),
    supplierTenant: randomUUID(),
    buyerPrincipal: randomUUID(),
    supplierPrincipal: randomUUID(),
    buyerAccount: randomUUID(),
    supplierAccount: randomUUID(),
  },
  probes = [];
const db = new Client({
  connectionString: url,
  application_name: "g3-mesh-certification",
});
await db.connect();
try {
  await seed();
  await context(db, "buyer");
  const buyerExpiry = new Date(Date.now() + 86400000).toISOString(),
    buyerIssue = await db.query(issueSql(), [
      ids.supplierTenant,
      ids.buyerAccount,
      ids.supplierAccount,
      "buyer_request",
      "commercial",
      "mesh.registration-intent",
      1,
      "a".repeat(64),
      {
        displayName: "Supplier candidate",
        countryCode: "MY",
        requestedCapabilities: ["profile_exchange"],
      },
      "b".repeat(64),
      buyerExpiry,
      "Buyer invitation",
      "g3-buyer-registration",
      ids.buyerPrincipal,
    ]);
  const buyerExchange = buyerIssue.rows[0].exchange_id;
  const replay = await db.query(issueSql(), [
    ids.supplierTenant,
    ids.buyerAccount,
    ids.supplierAccount,
    "buyer_request",
    "commercial",
    "mesh.registration-intent",
    1,
    "a".repeat(64),
    {
      displayName: "Supplier candidate",
      countryCode: "MY",
      requestedCapabilities: ["profile_exchange"],
    },
    "b".repeat(64),
    buyerExpiry,
    "Buyer invitation",
    "g3-buyer-registration",
    ids.buyerPrincipal,
  ]);
  assert.equal(replay.rows[0].replayed, true);
  pass("buyer_registration_exact_replay");
  await context(db, "supplier");
  await db.query(regLifecycleSql(), [
    buyerExchange,
    "accept",
    1,
    "Supplier accepted",
    "g3-buyer-registration-accept",
    ids.supplierPrincipal,
  ]);
  pass("buyer_registration_counterparty_acceptance");
  const selfIssue = await db.query(issueSql(), [
    ids.buyerTenant,
    ids.supplierAccount,
    ids.buyerAccount,
    "supplier_self_registration",
    "commercial",
    "mesh.registration-intent",
    1,
    "c".repeat(64),
    {
      displayName: "Self-registering supplier",
      countryCode: "MY",
      requestedCapabilities: ["profile_exchange"],
    },
    "d".repeat(64),
    new Date(Date.now() + 86400000).toISOString(),
    "Supplier self registration",
    "g3-supplier-self-registration",
    ids.supplierPrincipal,
  ]);
  await context(db, "buyer");
  await db.query(regLifecycleSql(), [
    selfIssue.rows[0].exchange_id,
    "accept",
    1,
    "Sponsor accepted",
    "g3-supplier-self-accept",
    ids.buyerPrincipal,
  ]);
  pass("supplier_self_registration_sponsor_acceptance");
  const discovery = await db.query(discoverySql(), [
    ids.buyerTenant,
    ids.buyerAccount,
    ids.supplierTenant,
    ids.supplierAccount,
    new Date().toISOString().slice(0, 10),
    null,
    "Discovery nomination",
    "g3-discovery",
    ids.buyerPrincipal,
  ]);
  const discoveryRelationship = discovery.rows[0].relationship_id;
  assert.equal(discovery.rows[0].status, "requested");
  await rejected("discovery_cannot_request_access_capability", "42501", () =>
    db.query(capRequestSql(), [
      discoveryRelationship,
      "sourcing",
      new Date().toISOString().slice(0, 10),
      null,
      {},
      "No preaccept access",
      "g3-discovery-sourcing",
      ids.buyerPrincipal,
    ]),
  );
  const discoveryState = await db.query(
    `SELECT r.status relationship_status,c.status capability_status,c.capability_code FROM mesh.network_relationship r JOIN mesh.network_relationship_capability c ON c.network_relationship_id=r.id WHERE r.id=$1`,
    [discoveryRelationship],
  );
  assert.deepEqual(discoveryState.rows[0], {
    relationship_status: "requested",
    capability_status: "requested",
    capability_code: "profile_exchange",
  });
  pass("discovery_is_profile_only_and_non_authorizing");
  await context(db, "supplier");
  await db.query(
    `SELECT * FROM mesh.command_accept_network_relationship($1,1,$2,$3,$4)`,
    [
      discoveryRelationship,
      "Discovery accepted",
      "g3-discovery-accept",
      ids.supplierPrincipal,
    ],
  );
  const relationship = discoveryRelationship;
  await context(db, "buyer");
  const requested = await db.query(capRequestSql(), [
    relationship,
    "procurement",
    new Date().toISOString().slice(0, 10),
    null,
    { protocol: "as4", documentKinds: ["purchase_order"] },
    "Procurement capability",
    "g3-capability-procurement",
    ids.buyerPrincipal,
  ]);
  const capability = requested.rows[0].capability_id;
  await rejected("requester_cannot_self_accept", "55000", () =>
    db.query(capLifecycleSql(), [
      capability,
      "accept",
      1,
      "Self accept denied",
      "g3-capability-self-accept",
      ids.buyerPrincipal,
    ]),
  );
  await context(db, "supplier");
  const accepted = await db.query(capLifecycleSql(), [
    capability,
    "accept",
    1,
    "Counterparty accepted",
    "g3-capability-accept",
    ids.supplierPrincipal,
  ]);
  const acceptedReplay = await db.query(capLifecycleSql(), [
    capability,
    "accept",
    1,
    "Counterparty accepted",
    "g3-capability-accept",
    ids.supplierPrincipal,
  ]);
  assert.equal(accepted.rows[0].status, "active");
  assert.equal(acceptedReplay.rows[0].replayed, true);
  pass("capability_bilateral_acceptance_exact_replay");
  await rejected("direct_capability_mutation", "42501", () =>
    db.query(
      `UPDATE mesh.network_relationship_capability SET status='suspended',row_version=row_version+1 WHERE id=$1`,
      [capability],
    ),
  );
  await context(db, "buyer");
  await db.query(capLifecycleSql(), [
    capability,
    "suspend",
    2,
    "Buyer suspension",
    "g3-capability-suspend",
    ids.buyerPrincipal,
  ]);
  await context(db, "supplier");
  await db.query(capLifecycleSql(), [
    capability,
    "end",
    3,
    "Supplier termination",
    "g3-capability-end",
    ids.supplierPrincipal,
  ]);
  await context(db, "buyer");
  const onboarded = await db.query(capRequestSql(), [
    relationship,
    "procurement",
    new Date().toISOString().slice(0, 10),
    null,
    { protocol: "as4" },
    "Re-onboarding",
    "g3-capability-reonboard",
    ids.buyerPrincipal,
  ]);
  assert.equal(
    Number(
      (
        await db.query(
          `SELECT episode_no FROM mesh.network_relationship_capability WHERE id=$1`,
          [onboarded.rows[0].capability_id],
        )
      ).rows[0].episode_no,
    ),
    2,
  );
  pass("capability_suspension_termination_reonboarding");
  await concurrency(relationship);
  await context(db, "outsider");
  await rejected("wrong_participant_denied", "42501", () =>
    db.query(capLifecycleSql(), [
      onboarded.rows[0].capability_id,
      "accept",
      1,
      "Outsider",
      "g3-outsider",
      system,
    ]),
  );
  await rollbackProbe();
  const atomic = await db.query(
    `SELECT (SELECT count(*)::int FROM mesh.network_command_evidence WHERE aggregate_kind='network_relationship_capability' AND aggregate_id=$1) evidence,(SELECT count(*)::int FROM event.outbox WHERE aggregate_type='network_relationship_capability' AND aggregate_id=$1) outbox,(SELECT count(*)::int FROM audit.audit_log WHERE entity_type='network_relationship_capability' AND entity_id=$1) audit`,
    [capability],
  );
  assert.ok(
    atomic.rows[0].evidence >= 3 &&
      atomic.rows[0].outbox >= 3 &&
      atomic.rows[0].audit >= 3,
  );
  probes.push({
    code: "atomic_evidence_audit_outbox",
    passed: true,
    counts: atomic.rows[0],
  });
  await rlsProbe(buyerExchange);
  const passed = probes.every((x) => x.passed),
    evidence = {
      schemaVersion: 1,
      kind: "athyper.g3-mesh-lifecycle-certification",
      capturedAt: new Date().toISOString(),
      database: "athyper_mesh",
      sanitized: true,
      dataDisposition: "fixtures_deleted",
      probes,
      passed,
    };
  if (output) {
    const path = resolve(root, output);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  if (!passed) throw new Error("G3 certification failed");
  process.stdout.write(`G3_MESH_CERTIFICATION_OK probes=${probes.length}\n`);
} finally {
  await cleanup().catch(() => undefined);
  await db.end();
}

async function seed() {
  await db.query("BEGIN");
  try {
    for (const [tenantId, code] of [
      [ids.buyerTenant, "g3buyer"],
      [ids.supplierTenant, "g3supplier"],
    ])
      await db.query(
        `INSERT INTO master.tenant(id,code,name,display_name,realm_key,status,created_by)VALUES($1,$2,$2,$2,$3,'active',$1)`,
        [
          tenantId,
          `${code}_${tenantId.slice(0, 8)}`,
          `realm_${tenantId.slice(0, 8)}`,
        ],
      );
    for (const [principal, tenantId, code] of [
      [ids.buyerPrincipal, ids.buyerTenant, "buyer"],
      [ids.supplierPrincipal, ids.supplierTenant, "supplier"],
    ])
      await db.query(
        `INSERT INTO master.principal(id,tenant_id,code,name,principal_type,created_by)VALUES($1,$2,$3,$3,'user',$1)`,
        [principal, tenantId, `${code}_${principal.slice(0, 8)}`],
      );
    await db.query(
      `INSERT INTO mesh.network_account(id,tenant_id,account_code,display_name,network_role,status,created_by)VALUES($1,$2,$3,'G3 buyer','buyer','active',$4),($5,$6,$7,'G3 supplier','supplier','active',$8)`,
      [
        ids.buyerAccount,
        ids.buyerTenant,
        `g3buyer.${ids.buyerAccount.slice(0, 8)}`,
        ids.buyerPrincipal,
        ids.supplierAccount,
        ids.supplierTenant,
        `g3supplier.${ids.supplierAccount.slice(0, 8)}`,
        ids.supplierPrincipal,
      ],
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
async function concurrency(relationship) {
  await context(db, "buyer");
  const cap = (
    await db.query(capRequestSql(), [
      relationship,
      "invoicing",
      new Date().toISOString().slice(0, 10),
      null,
      {},
      "Invoice exchange",
      "g3-capability-race-request",
      ids.buyerPrincipal,
    ])
  ).rows[0].capability_id;
  const peers = [
    new Client({ connectionString: url }),
    new Client({ connectionString: url }),
  ];
  await Promise.all(peers.map((x) => x.connect()));
  try {
    await Promise.all(peers.map((x) => context(x, "supplier")));
    const values = (index) => [
      cap,
      "accept",
      1,
      "Concurrent accept",
      `g3-capability-race-${index}`,
      ids.supplierPrincipal,
    ];
    const results = await Promise.all(
      peers.map((x, index) =>
        x
          .query(capLifecycleSql(), values(index))
          .then(() => ({ ok: true, state: null }))
          .catch((error) => ({ ok: false, state: error.code ?? null })),
      ),
    );
    const winners = results.filter((x) => x.ok).length,
      loser = results.find((x) => !x.ok);
    probes.push({
      code: "capability_concurrency_one_winner",
      passed: winners === 1 && loser?.state === "40001",
      accepted: winners,
      loserSqlState: loser?.state ?? null,
    });
  } finally {
    await Promise.all(peers.map((x) => x.end()));
  }
}
async function rollbackProbe() {
  await context(db, "buyer");
  const key = "g3-registration-rollback",
    before = Number(
      (
        await db.query(
          "SELECT count(*)::int count FROM event.outbox WHERE tenant_id=$1",
          [ids.buyerTenant],
        )
      ).rows[0].count,
    );
  await db.query("BEGIN");
  try {
    await db.query(issueSql(), [
      ids.supplierTenant,
      ids.buyerAccount,
      ids.supplierAccount,
      "buyer_request",
      "commercial",
      "mesh.registration-intent",
      1,
      "e".repeat(64),
      { displayName: "Rollback" },
      "f".repeat(64),
      new Date(Date.now() + 86400000).toISOString(),
      "Rollback probe",
      key,
      ids.buyerPrincipal,
    ]);
    await db.query("ROLLBACK");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
  const counts = await db.query(
    `SELECT (SELECT count(*)::int FROM mesh.network_command_evidence WHERE idempotency_key=$1) evidence,(SELECT count(*)::int FROM event.outbox WHERE tenant_id=$2) outbox,(SELECT count(*)::int FROM mesh.registration_exchange WHERE intent_snapshot->>'displayName'='Rollback') exchange`,
    [key, ids.buyerTenant],
  );
  assert.deepEqual(counts.rows[0], {
    evidence: 0,
    outbox: before,
    exchange: 0,
  });
  pass("registration_atomic_rollback");
}
async function rlsProbe(exchange) {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL ROLE athyperapp");
    await context(db, "outsider");
    const hidden = await db.query(
      `SELECT count(*)::int count FROM mesh.registration_exchange WHERE id=$1`,
      [exchange],
    );
    assert.equal(hidden.rows[0].count, 0);
    await db.query("ROLLBACK");
    pass("registration_cross_tenant_rls");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
async function rejected(code, state, work) {
  try {
    await work();
    probes.push({ code, passed: false, sqlState: null });
  } catch (error) {
    probes.push({
      code,
      passed: error.code === state,
      sqlState: error.code ?? null,
      message: error.message.slice(0, 240),
    });
  }
}
function pass(code) {
  probes.push({ code, passed: true });
}
async function context(client, who) {
  const values =
    who === "buyer"
      ? [ids.buyerTenant, ids.buyerPrincipal, ids.buyerAccount]
      : who === "supplier"
        ? [ids.supplierTenant, ids.supplierPrincipal, ids.supplierAccount]
        : [system, system, null];
  await client.query(
    "SELECT set_config('app.database_plane','mesh',false),set_config('app.current_tenant_id',$1,false),set_config('app.current_principal_id',$2,false),set_config('app.current_network_account_id',COALESCE($3,''),false)",
    values,
  );
}
async function cleanup() {
  await db.query("ROLLBACK").catch(() => undefined);
  await db.query("BEGIN");
  await db.query("SET LOCAL session_replication_role=replica");
  const tenants = [ids.buyerTenant, ids.supplierTenant];
  await db.query("DELETE FROM event.outbox WHERE tenant_id=ANY($1::uuid[])", [
    tenants,
  ]);
  await db.query(
    "DELETE FROM audit.audit_log WHERE tenant_id=ANY($1::uuid[])",
    [tenants],
  );
  await db.query(
    "DELETE FROM mesh.network_command_evidence WHERE actor_tenant_id=ANY($1::uuid[])",
    [tenants],
  );
  await db.query(
    "DELETE FROM mesh.registration_exchange WHERE requester_tenant_id=ANY($1::uuid[]) OR counterparty_tenant_id=ANY($1::uuid[])",
    [tenants],
  );
  await db.query(
    "DELETE FROM mesh.network_relationship_capability WHERE network_relationship_id IN(SELECT id FROM mesh.network_relationship WHERE buyer_tenant_id=ANY($1::uuid[]) OR supplier_tenant_id=ANY($1::uuid[]))",
    [tenants],
  );
  await db.query(
    "DELETE FROM mesh.network_lifecycle_event WHERE owner_tenant_id=ANY($1::uuid[]) OR counterparty_tenant_id=ANY($1::uuid[])",
    [tenants],
  );
  await db.query(
    "DELETE FROM mesh.network_relationship WHERE buyer_tenant_id=ANY($1::uuid[]) OR supplier_tenant_id=ANY($1::uuid[])",
    [tenants],
  );
  await db.query(
    "DELETE FROM mesh.network_relationship_identity WHERE buyer_tenant_id=ANY($1::uuid[]) OR supplier_tenant_id=ANY($1::uuid[])",
    [tenants],
  );
  await db.query(
    "DELETE FROM mesh.network_account WHERE tenant_id=ANY($1::uuid[])",
    [tenants],
  );
  await db.query(
    "DELETE FROM master.principal WHERE tenant_id=ANY($1::uuid[])",
    [tenants],
  );
  await db.query("DELETE FROM master.tenant WHERE id=ANY($1::uuid[])", [
    tenants,
  ]);
  await db.query("COMMIT");
}
function issueSql() {
  return "SELECT * FROM mesh.command_issue_registration_exchange($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14)";
}
function regLifecycleSql() {
  return "SELECT * FROM mesh.command_registration_exchange_lifecycle($1,$2,$3,$4,$5,$6)";
}
function discoverySql() {
  return "SELECT * FROM mesh.command_discover_network_relationship($1,$2,$3,$4,$5,$6,$7,$8,$9)";
}
function capRequestSql() {
  return "SELECT * FROM mesh.command_request_relationship_capability($1,$2,$3,$4,$5::jsonb,$6,$7,$8)";
}
function capLifecycleSql() {
  return "SELECT * FROM mesh.command_relationship_capability_lifecycle($1,$2,$3,$4,$5,$6)";
}
function arg(name) {
  return process.argv
    .find((x) => x.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
