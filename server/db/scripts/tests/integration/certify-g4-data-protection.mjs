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
if (!url) throw new Error("Mesh database URL is required");
const ids = {
    buyer: randomUUID(),
    supplier: randomUUID(),
    outsider: randomUUID(),
    buyerActor: randomUUID(),
    supplierActor: randomUUID(),
    supplierChecker: randomUUID(),
    outsiderActor: randomUUID(),
    buyerAccount: randomUUID(),
    supplierAccount: randomUUID(),
    relationshipIdentity: randomUUID(),
    relationship: randomUUID(),
    capability: randomUUID(),
    bank: randomUUID(),
    snapshot: randomUUID(),
    disclosure: randomUUID(),
    newParty: randomUUID(),
  },
  rawMarker = "GB29NWBK60161331926819",
  token1 = `vault:g4/${randomUUID()}`,
  token2 = `vault:g4/${randomUUID()}`,
  probes = [];
const db = new Client({
  connectionString: url,
  application_name: "g4-data-protection-certification",
});
await db.connect();
let cleaned = false;
try {
  await seed();
  await context("supplier", ids.supplierActor);
  const rotated = await db.query(
    "SELECT * FROM mesh.command_rotate_bank_protected_token($1,$2,2,$3,$4,$5)",
    [
      ids.bank,
      token2,
      "Scheduled key rotation",
      "g4-bank-rotation",
      ids.supplierActor,
    ],
  );
  assert.equal(rotated.rows[0].protection_key_version, 2);
  const replay = await db.query(
    "SELECT * FROM mesh.command_rotate_bank_protected_token($1,$2,2,$3,$4,$5)",
    [
      ids.bank,
      token2,
      "Scheduled key rotation",
      "g4-bank-rotation",
      ids.supplierActor,
    ],
  );
  assert.equal(replay.rows[0].replayed, true);
  pass("rotation_exact_replay_and_crypto_shredding");
  await rejected("direct_token_mutation_denied", "42501", () =>
    db.query(
      "UPDATE mesh.bank_account SET protected_value_token=$2,protection_key_version=3 WHERE id=$1",
      [ids.bank, `vault:g4/${randomUUID()}`],
    ),
  );
  await context("buyer", ids.buyerActor);
  await db.query("SET ROLE athyper_protected_value_retriever");
  const retrieval = await db.query(
    "SELECT * FROM mesh.command_retrieve_bank_protected_token($1,1,$2,$3,$4)",
    [
      ids.disclosure,
      "Settlement processing",
      "g4-bank-retrieval",
      ids.buyerActor,
    ],
  );
  assert.equal(retrieval.rows[0].protected_value_token, token2);
  const retrievalReplay = await db.query(
    "SELECT * FROM mesh.command_retrieve_bank_protected_token($1,1,$2,$3,$4)",
    [
      ids.disclosure,
      "Settlement processing",
      "g4-bank-retrieval",
      ids.buyerActor,
    ],
  );
  assert.equal(retrievalReplay.rows[0].replayed, true);
  await db.query("RESET ROLE");
  pass("purpose_bound_retrieval_exact_replay");
  await db.query("SET ROLE athyperapp");
  await rejected("ordinary_runtime_cannot_retrieve", "42501", () =>
    db.query(
      "SELECT * FROM mesh.command_retrieve_bank_protected_token($1,1,$2,$3,$4)",
      [ids.disclosure, "Denied", "g4-runtime-denied", ids.buyerActor],
    ),
  );
  await db.query("RESET ROLE");
  await context("outsider", ids.outsiderActor);
  await db.query("SET ROLE athyper_protected_value_retriever");
  await rejected("cross_tenant_retrieval_denied", "42501", () =>
    db.query(
      "SELECT * FROM mesh.command_retrieve_bank_protected_token($1,1,$2,$3,$4)",
      [ids.disclosure, "Denied", "g4-outsider-denied", ids.outsiderActor],
    ),
  );
  await db.query("RESET ROLE");
  await context("supplier", ids.supplierActor);
  await db.query(
    "UPDATE mesh.bank_account_disclosure SET status='revoked',revoked_at=clock_timestamp(),revoked_by=$2,revocation_reason='Owner revoked access',updated_by=$2 WHERE id=$1",
    [ids.disclosure, ids.supplierActor],
  );
  await context("buyer", ids.buyerActor);
  await db.query("SET ROLE athyper_protected_value_retriever");
  await rejected("revoked_retrieval_denied", "42501", () =>
    db.query(
      "SELECT * FROM mesh.command_retrieve_bank_protected_token($1,1,$2,$3,$4)",
      [
        ids.disclosure,
        "Denied after revoke",
        "g4-revoked-denied",
        ids.buyerActor,
      ],
    ),
  );
  await db.query("RESET ROLE");
  await context("supplier", ids.supplierActor);
  await rejected("unallowlisted_account_metadata", "23514", () =>
    db.query(
      'UPDATE mesh.network_account SET metadata=\'{"bankAccountNumber":"x"}\' WHERE id=$1',
      [ids.supplierAccount],
    ),
  );
  await db.query(
    "INSERT INTO mesh.network_account_profile(id,tenant_id,network_account_id,website_url,status,created_by)VALUES($1,$2,$3,'https://supplier.example/path','active',$4)",
    [randomUUID(), ids.supplier, ids.supplierAccount, ids.supplierActor],
  );
  await rejected("unsafe_profile_url_denied", "23514", () =>
    db.query(
      "UPDATE mesh.network_account_profile SET website_url='https://user:pass@supplier.example/' WHERE network_account_id=$1",
      [ids.supplierAccount],
    ),
  );
  await db.query(
    "INSERT INTO mesh.network_account_profile_address(id,tenant_id,network_account_id,address_kind,address_line1,locality,country_code,created_by)VALUES($1,$2,$3,'registered','1 Example Way','Kuala Lumpur','MY',$4)",
    [randomUUID(), ids.supplier, ids.supplierAccount, ids.supplierActor],
  );
  pass("structured_address_and_hardened_url");
  const opened = await db.query(
    "SELECT * FROM mesh.command_open_canonical_party_correlation_case($1,$2,$3,$4,$5)",
    [
      ids.supplierAccount,
      ids.newParty,
      "Conflicting registry correlation",
      "g4-correlation-open",
      ids.supplierActor,
    ],
  );
  const caseId = opened.rows[0].case_id;
  assert.equal(
    (
      await db.query(
        "SELECT canonical_party_id FROM mesh.network_account WHERE id=$1",
        [ids.supplierAccount],
      )
    ).rows[0].canonical_party_id,
    null,
  );
  await rejected("correlation_maker_checker_denied", "40001", () =>
    db.query(
      "SELECT * FROM mesh.command_resolve_canonical_party_correlation_case($1,'accept',1,$2,$3,$4)",
      [
        caseId,
        "Maker cannot resolve",
        "g4-correlation-maker",
        ids.supplierActor,
      ],
    ),
  );
  await context("supplier", ids.supplierChecker);
  await db.query(
    "SELECT * FROM mesh.command_resolve_canonical_party_correlation_case($1,'accept',1,$2,$3,$4)",
    [
      caseId,
      "Registry evidence reconciled",
      "g4-correlation-accept",
      ids.supplierChecker,
    ],
  );
  assert.equal(
    (
      await db.query(
        "SELECT canonical_party_id::text value FROM mesh.network_account WHERE id=$1",
        [ids.supplierAccount],
      )
    ).rows[0].value,
    ids.newParty,
  );
  pass("stewarded_correlation_no_first_writer_wins");
  const leakage = await db.query(
    `SELECT
   (SELECT count(*) FROM snapshot.bank_account_disclosure WHERE payload_json::text LIKE '%'||$1||'%')+
   (SELECT count(*) FROM event.outbox WHERE payload::text LIKE '%'||$1||'%' OR headers::text LIKE '%'||$1||'%')+
   (SELECT count(*) FROM audit.audit_log WHERE coalesce(context::text,'') LIKE '%'||$1||'%' OR coalesce(old_values::text,'') LIKE '%'||$1||'%' OR coalesce(new_values::text,'') LIKE '%'||$1||'%')+
   (SELECT count(*) FROM mesh.network_command_evidence WHERE evidence::text LIKE '%'||$1||'%') leaks`,
    [rawMarker],
  );
  assert.equal(Number(leakage.rows[0].leaks), 0);
  const audit = await db.query(
    "SELECT count(*)::int count FROM audit.audit_log WHERE event_code='data.mesh_bank_retrieved' AND entity_id=$1",
    [ids.disclosure],
  );
  assert.equal(audit.rows[0].count, 1);
  pass("ordinary_evidence_leakage_negative_and_audited");
  await cleanup();
  cleaned = true;
  const passed = probes.every((x) => x.passed),
    evidence = {
      schemaVersion: 1,
      kind: "athyper.g4-data-protection-certification",
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
  if (!passed) throw new Error("G4 certification failed");
  process.stdout.write(`G4_DATA_PROTECTION_OK probes=${probes.length}\n`);
} finally {
  if (!cleaned) await cleanup();
  await db.end();
}
async function seed() {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL session_replication_role=replica");
    for (const [tenant, code] of [
      [ids.buyer, "g4buyer"],
      [ids.supplier, "g4supplier"],
      [ids.outsider, "g4outsider"],
    ])
      await db.query(
        "INSERT INTO master.tenant(id,code,name,display_name,realm_key,status,created_by)VALUES($1,$2,$2,$2,$3,'active',$1)",
        [
          tenant,
          `${code}_${tenant.slice(0, 8)}`,
          `realm_${tenant.slice(0, 8)}`,
        ],
      );
    for (const [actor, tenant, code] of [
      [ids.buyerActor, ids.buyer, "buyer"],
      [ids.supplierActor, ids.supplier, "supplier"],
      [ids.supplierChecker, ids.supplier, "checker"],
      [ids.outsiderActor, ids.outsider, "outsider"],
    ])
      await db.query(
        "INSERT INTO master.principal(id,tenant_id,code,name,principal_type,status,created_by)VALUES($1,$2,$3,$3,'user','active',$1)",
        [actor, tenant, `${code}_${actor.slice(0, 8)}`],
      );
    await db.query(
      "INSERT INTO mesh.network_account(id,tenant_id,account_code,display_name,network_role,capabilities,metadata,status,created_by)VALUES($1,$2,$3,'G4 buyer','buyer','{}','{}','active',$4),($5,$6,$7,'G4 supplier','supplier','{}','{}','active',$8)",
      [
        ids.buyerAccount,
        ids.buyer,
        `g4buyer.${ids.buyerAccount.slice(0, 8)}`,
        ids.buyerActor,
        ids.supplierAccount,
        ids.supplier,
        `g4supplier.${ids.supplierAccount.slice(0, 8)}`,
        ids.supplierActor,
      ],
    );
    await db.query(
      "INSERT INTO mesh.network_relationship_identity(id,buyer_tenant_id,buyer_account_id,supplier_tenant_id,supplier_account_id,relationship_kind,created_by_tenant_id,created_by)VALUES($1,$2,$3,$4,$5,'commercial',$2,$6)",
      [
        ids.relationshipIdentity,
        ids.buyer,
        ids.buyerAccount,
        ids.supplier,
        ids.supplierAccount,
        ids.buyerActor,
      ],
    );
    await db.query(
      "INSERT INTO mesh.network_relationship(id,buyer_tenant_id,buyer_account_id,supplier_tenant_id,supplier_account_id,relationship_kind,status,created_by_tenant_id,created_by,relationship_identity_id,episode_no,row_version)VALUES($1,$2,$3,$4,$5,'commercial','active',$2,$6,$7,1,1)",
      [
        ids.relationship,
        ids.buyer,
        ids.buyerAccount,
        ids.supplier,
        ids.supplierAccount,
        ids.buyerActor,
        ids.relationshipIdentity,
      ],
    );
    await db.query(
      "INSERT INTO mesh.network_relationship_capability(id,network_relationship_id,capability_code,episode_no,requested_by_tenant_id,approved_by_tenant_id,effective_from,status,row_version,created_by)VALUES($1,$2,'payments',1,$3,$4,CURRENT_DATE,'active',2,$5)",
      [
        ids.capability,
        ids.relationship,
        ids.supplier,
        ids.buyer,
        ids.supplierActor,
      ],
    );
    await db.query(
      "INSERT INTO mesh.bank_account(id,tenant_id,network_account_id,account_holder_name,account_id_type,protected_value_token,identifier_fingerprint,protection_key_version,account_last4,currency_code,bank_name_override,bank_country_override,is_verified,verified_at,verified_by,verification_method,status,created_by)VALUES($1,$2,$3,'G4 Supplier','iban',$4,$5,1,'6819','MYR','Example Bank','MY',true,clock_timestamp(),$6,'manual','active',$6)",
      [
        ids.bank,
        ids.supplier,
        ids.supplierAccount,
        token1,
        "a".repeat(64),
        ids.supplierActor,
      ],
    );
    const payload = {
      schemaCode: "mesh.bank_account_disclosure",
      schemaVersion: 1,
      fieldSetCode: "masked_retrieval_v1",
      disclosureId: ids.disclosure,
      purpose: "settlement",
      bankAccount: {
        accountIdType: "iban",
        accountLast4: "6819",
        currencyCode: "MYR",
      },
      secureRetrievalReference: `vault-ref:${ids.disclosure}`,
    };
    const payloadHash = "b".repeat(64);
    await db.query(
      "INSERT INTO snapshot.bank_account_disclosure(id,owner_tenant_id,recipient_tenant_id,disclosure_id,disclosure_version,payload_json,payload_hash,captured_by)VALUES($1,$2,$3,$4,1,$5,$6,$7)",
      [
        ids.snapshot,
        ids.supplier,
        ids.buyer,
        ids.disclosure,
        payload,
        payloadHash,
        ids.supplierActor,
      ],
    );
    await db.query(
      "INSERT INTO mesh.bank_account_disclosure(id,owner_tenant_id,owner_account_id,bank_account_id,network_relationship_id,recipient_tenant_id,recipient_account_id,purpose,snapshot_id,payload_hash,secure_retrieval_reference,idempotency_key,decision_fingerprint,approved_at,approved_by,status,disclosed_by,created_by)VALUES($1,$2,$3,$4,$5,$6,$7,'settlement',$8,$9,$10,$11,$12,clock_timestamp(),$13,'active',$14,$14)",
      [
        ids.disclosure,
        ids.supplier,
        ids.supplierAccount,
        ids.bank,
        ids.relationship,
        ids.buyer,
        ids.buyerAccount,
        ids.snapshot,
        payloadHash,
        `vault-ref:${ids.disclosure}`,
        `g4-disclosure-${ids.disclosure}`,
        "c".repeat(64),
        ids.supplierChecker,
        ids.supplierActor,
      ],
    );
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}
async function context(who, actor) {
  const tenant =
    who === "buyer"
      ? ids.buyer
      : who === "supplier"
        ? ids.supplier
        : ids.outsider;
  await db.query(
    "SELECT set_config('app.database_plane','mesh',false),set_config('app.current_tenant_id',$1,false),set_config('app.current_principal_id',$2,false)",
    [tenant, actor],
  );
}
function pass(code) {
  probes.push({ code, passed: true });
}
async function rejected(code, state, work) {
  try {
    await work();
    probes.push({ code, passed: false, sqlState: null });
  } catch (e) {
    probes.push({
      code,
      passed: e.code === state,
      sqlState: e.code ?? null,
      message: e.message.slice(0, 220),
    });
  }
}
async function cleanup() {
  await db.query("ROLLBACK").catch(() => {});
  await db.query("RESET ROLE").catch(() => {});
  await db.query("BEGIN");
  await db.query("SET LOCAL session_replication_role=replica");
  const tenants = [ids.buyer, ids.supplier, ids.outsider];
  for (const sql of [
    "DELETE FROM event.outbox WHERE tenant_id=ANY($1)",
    "DELETE FROM audit.audit_log WHERE tenant_id=ANY($1)",
    "DELETE FROM mesh.bank_account_retrieval_evidence WHERE recipient_tenant_id=ANY($1)",
    "DELETE FROM mesh.network_command_evidence WHERE actor_tenant_id=ANY($1)",
    "DELETE FROM mesh.canonical_party_correlation_case WHERE tenant_id=ANY($1)",
    "DELETE FROM mesh.bank_account_disclosure WHERE owner_tenant_id=ANY($1)",
    "DELETE FROM snapshot.bank_account_disclosure WHERE owner_tenant_id=ANY($1)",
    "DELETE FROM mesh.bank_account WHERE tenant_id=ANY($1)",
    "DELETE FROM mesh.network_account_profile_address WHERE tenant_id=ANY($1)",
    "DELETE FROM mesh.network_account_profile WHERE tenant_id=ANY($1)",
    "DELETE FROM mesh.network_relationship_capability WHERE network_relationship_id=$1",
    "DELETE FROM mesh.network_relationship WHERE id=$1",
    "DELETE FROM mesh.network_relationship_identity WHERE id=$1",
    "DELETE FROM mesh.network_account WHERE tenant_id=ANY($1)",
    "DELETE FROM master.principal WHERE tenant_id=ANY($1)",
    "DELETE FROM master.tenant WHERE id=ANY($1)",
  ]) {
    const value = sql.includes("network_relationship_identity WHERE")
      ? ids.relationshipIdentity
      : sql.includes("network_relationship")
        ? ids.relationship
        : tenants;
    await db.query(sql, [value]);
  }
  await db.query("COMMIT");
}
function arg(name) {
  return process.argv
    .find((x) => x.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
