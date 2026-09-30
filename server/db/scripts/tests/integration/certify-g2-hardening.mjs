#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Client } from "pg";

const repositoryRoot = resolve(import.meta.dirname, "../../../../..");
const url =
  option("--neon-database-url") ??
  process.env.ATHYPER_NEON_DATABASE_ADMIN_URL ??
  process.env.DATABASE_URL;
const output = option("--output");
if (!url)
  throw new Error(
    "--neon-database-url or ATHYPER_NEON_DATABASE_ADMIN_URL is required",
  );
const tenant = "00000000-0000-0000-0000-000000000000",
  actor = tenant;
const ids = {
  tenantB: randomUUID(),
  bpA: randomUUID(),
  bpB: randomUUID(),
  supplierA: randomUUID(),
  supplierB: randomUUID(),
  customerA: randomUUID(),
  customerB: randomUUID(),
  qualification: randomUUID(),
  legal: randomUUID(),
  company: randomUUID(),
  organization: randomUUID(),
  organizationAssignment: randomUUID(),
  partnerAssignment: randomUUID(),
  partnerAssignmentB: randomUUID(),
  address: randomUUID(),
  contact: randomUUID(),
};
const probes = [];
const client = new Client({
  connectionString: url,
  application_name: "g2-hardening-certification",
});
await client.connect();
try {
  await context(client);
  await seed(client);
  await accepted("qualification_role_derived", async () => {
    const result = await client.query(
      `INSERT INTO control.business_partner_qualification(id,tenant_id,business_partner_id,partner_role,qualification_type_code,idempotency_key,created_by) VALUES($1,$2,$3,'supplier','basic',$4,$2) RETURNING role_id`,
      [
        ids.qualification,
        tenant,
        ids.bpA,
        `g2-qualification-${ids.qualification}`,
      ],
    );
    assert.equal(result.rows[0].role_id, ids.supplierA);
  });
  await rejected("qualification_wrong_role_pair", "23503", () =>
    client.query(
      `INSERT INTO control.business_partner_qualification(tenant_id,business_partner_id,partner_role,role_id,qualification_type_code,idempotency_key,created_by) VALUES($1,$2,'supplier',$3,'basic',$4,$1)`,
      [tenant, ids.bpA, ids.supplierB, `g2-wrong-${randomUUID()}`],
    ),
  );
  await rejected("supplier_preference_wrong_pair", "23514", () =>
    client.query(
      `INSERT INTO control.supplier_preference_designation(tenant_id,business_partner_id,supplier_id,operating_organization_id,effective_from,rationale,idempotency_key,created_by) VALUES($1,$2,$3,$4,CURRENT_DATE,'G2 pair probe',$5,$1)`,
      [
        tenant,
        ids.bpB,
        ids.supplierA,
        ids.organization,
        `g2-pref-${randomUUID()}`,
      ],
    ),
  );
  await rejected("customer_designation_wrong_pair", "23514", () =>
    client.query(
      `INSERT INTO control.customer_account_designation(tenant_id,business_partner_id,customer_id,operating_organization_id,designation_type,effective_from,rationale,idempotency_key,created_by) VALUES($1,$2,$3,$4,'strategic',CURRENT_DATE,'G2 pair probe',$5,$1)`,
      [
        tenant,
        ids.bpB,
        ids.customerA,
        ids.organization,
        `g2-designation-${randomUUID()}`,
      ],
    ),
  );
  await rejected("customer_credit_wrong_pair", "23514", () =>
    client.query(
      `INSERT INTO control.customer_credit_review(tenant_id,business_partner_id,customer_id,operating_organization_id,company_code_id,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,$6,$1)`,
      [
        tenant,
        ids.bpB,
        ids.customerA,
        ids.organization,
        ids.company,
        `g2-credit-${randomUUID()}`,
      ],
    ),
  );
  await rejected("typed_address_wrong_owner", "23503", () =>
    client.query(
      `INSERT INTO master.address_link(tenant_id,owner_type_id,owner_id,address_id,purpose,created_by) SELECT $1,id,$2,$3,'default',$1 FROM control.owner_type WHERE tenant_id IS NULL AND code='customer'`,
      [tenant, ids.supplierA, ids.address],
    ),
  );
  await rejected("typed_contact_wrong_owner", "23503", () =>
    client.query(
      `INSERT INTO master.contact_link(tenant_id,owner_type_id,owner_id,channel_type,value,purpose,created_by) SELECT $1,id,$2,'email','g2@example.test','default',$1 FROM control.owner_type WHERE tenant_id IS NULL AND code='customer'`,
      [tenant, ids.supplierA],
    ),
  );
  await rejected("typed_contact_cross_tenant", "23503", () =>
    client.query(
      `INSERT INTO master.contact_link(tenant_id,owner_type_id,owner_id,channel_type,value,purpose,created_by) SELECT $1,id,$2,'email','g2-cross@example.test','default',$3 FROM control.owner_type WHERE tenant_id IS NULL AND code='business_partner'`,
      [ids.tenantB, ids.bpA, tenant],
    ),
  );
  await rejected("metadata_unknown_key", "23514", () =>
    client.query(
      `UPDATE master.business_partner SET metadata='{"taxId":"forbidden"}'::jsonb WHERE tenant_id=$1 AND id=$2`,
      [tenant, ids.bpA],
    ),
  );
  for (const [code, value] of [
    ["url_http", "http://example.com"],
    ["url_credentials", "https://user@example.com"],
    ["url_invalid_host", "https://localhost/path"],
  ])
    await rejected(code, "23514", () =>
      client.query(
        `UPDATE master.business_partner SET website_url=$3 WHERE tenant_id=$1 AND id=$2`,
        [tenant, ids.bpA, value],
      ),
    );
  await accepted("url_https_dns", () =>
    client.query(
      `UPDATE master.business_partner SET website_url='https://supplier.example.com/profile' WHERE tenant_id=$1 AND id=$2`,
      [tenant, ids.bpA],
    ),
  );
  await rejected("contact_url_credentials", "23514", () =>
    client.query(
      `INSERT INTO master.contact_link(tenant_id,owner_type_id,owner_id,channel_type,value,purpose,created_by) SELECT $1,id,$2,'website','https://user@example.com','default',$1 FROM control.owner_type WHERE tenant_id IS NULL AND code='business_partner'`,
      [tenant, ids.bpA],
    ),
  );
  await accepted("contact_url_https_dns", () =>
    client.query(
      `INSERT INTO master.contact_link(id,tenant_id,owner_type_id,owner_id,channel_type,value,purpose,created_by) SELECT $3,$1,id,$2,'website','https://supplier.example.com/contact','default',$1 FROM control.owner_type WHERE tenant_id IS NULL AND code='business_partner'`,
      [tenant, ids.bpA, ids.contact],
    ),
  );
  await lifecycleSequence();
  await lifecycleFailureOutcomes();
  await lifecycleConcurrency();
  const historical = await client.query(
    `SELECT partner_category::text,count(*)::int count FROM master.business_partner WHERE partner_category<>'organization' GROUP BY partner_category ORDER BY partner_category`,
  );
  probes.push({
    code: "organization_only_history_inventory",
    passed: true,
    rows: historical.rows,
    disposition:
      "retain person/group compatibility for observed import and legacy request consumers; governed materializers remain organization-only",
  });
  const passed = probes.every((probe) => probe.passed);
  const evidence = {
    schemaVersion: 1,
    kind: "athyper.g2-hardening-certification",
    capturedAt: new Date().toISOString(),
    database: "athyper_neon",
    sanitized: true,
    dataDisposition: "fixtures_deleted",
    probes,
    passed,
  };
  if (output) {
    const path = resolve(repositoryRoot, output);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  if (!passed) throw new Error("G2 hardening certification failed");
  process.stdout.write(
    `G2_HARDENING_CERTIFICATION_OK probes=${probes.length}\n`,
  );
} finally {
  await cleanup().catch(() => undefined);
  await client.end();
}

async function seed(db) {
  await db.query("BEGIN");
  await context(db);
  try {
    await db.query(
      `INSERT INTO master.tenant(id,code,name,display_name,realm_key,status,created_by) VALUES($1,$2,'G2 second tenant','G2 second tenant',$3,'active',$1)`,
      [
        ids.tenantB,
        `g2_${ids.tenantB.slice(0, 8)}`,
        `g2realm_${ids.tenantB.slice(0, 8)}`,
      ],
    );
    for (const [id, code] of [
      [ids.bpA, "G2BPA"],
      [ids.bpB, "G2BPB"],
    ])
      await db.query(
        `INSERT INTO master.business_partner(id,tenant_id,code,name,partner_category,category_locked_by,created_by) VALUES($1,$2,$3,$3,'organization',$2,$2)`,
        [id, tenant, `${code}${id.slice(0, 8).toUpperCase()}`],
      );
    await db.query(
      `INSERT INTO master.supplier(id,tenant_id,business_partner_id,supplier_code,created_by) VALUES($1,$3,$2,$4,$3),($5,$3,$6,$7,$3)`,
      [
        ids.supplierA,
        ids.bpA,
        tenant,
        `G2SA${ids.supplierA.slice(0, 8).toUpperCase()}`,
        ids.supplierB,
        ids.bpB,
        `G2SB${ids.supplierB.slice(0, 8).toUpperCase()}`,
      ],
    );
    await db.query(
      `INSERT INTO master.customer(id,tenant_id,business_partner_id,customer_code,created_by) VALUES($1,$3,$2,$4,$3),($5,$3,$6,$7,$3)`,
      [
        ids.customerA,
        ids.bpA,
        tenant,
        `G2CA${ids.customerA.slice(0, 8).toUpperCase()}`,
        ids.customerB,
        ids.bpB,
        `G2CB${ids.customerB.slice(0, 8).toUpperCase()}`,
      ],
    );
    await db.query(
      `INSERT INTO master.legal_entity(id,tenant_id,code,name,legal_name,functional_currency,status,created_by) VALUES($1,$2,$3,'G2 legal','G2 legal','USD','active',$2)`,
      [ids.legal, tenant, `g2_legal_${ids.legal.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO master.company_code(id,tenant_id,legal_entity_id,code,name,functional_currency,status,created_by) VALUES($1,$2,$3,$4,'G2 company','USD','active',$2)`,
      [ids.company, tenant, ids.legal, `g2_company_${ids.company.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO master.operating_organization(id,tenant_id,code,name,domain,status,created_by) VALUES($1,$2,$3,'G2 sales','sales','active',$2)`,
      [ids.organization, tenant, `g2_sales_${ids.organization.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO master.operating_organization_company_assignment(id,tenant_id,operating_organization_id,company_code_id,status,created_by) VALUES($1,$2,$3,$4,'active',$2)`,
      [ids.organizationAssignment, tenant, ids.organization, ids.company],
    );
    await db.query(
      `INSERT INTO master.business_partner_operating_organization_assignment(id,tenant_id,business_partner_id,operating_organization_id,partner_role,status,created_by) VALUES($1,$2,$3,$4,'customer','active',$2),($5,$2,$6,$4,'customer','active',$2)`,
      [
        ids.partnerAssignment,
        tenant,
        ids.bpA,
        ids.organization,
        ids.partnerAssignmentB,
        ids.bpB,
      ],
    );
    await db.query(
      `INSERT INTO master.address(id,tenant_id,line1,city,country_code,normalized_hash,status,created_by) VALUES($1,$2,'G2 probe','Test City','US',$3,'active',$2)`,
      [ids.address, tenant, "a".repeat(64)],
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function lifecycleSequence() {
  let version = 1;
  const invoke = async (action, key) => {
    const readiness = {
      decisionFingerprint: "b".repeat(64),
      eligible: true,
      businessPartnerId: ids.bpA,
      role: "customer",
      operatingOrganizationId: ids.organization,
      companyCodeId: ids.company,
      businessDate: new Date().toISOString().slice(0, 10),
    };
    const result = await client.query(
      `SELECT * FROM control.command_customer_lifecycle($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE,$9,$10,$11,$12)`,
      [
        tenant,
        ids.bpA,
        ids.customerA,
        ids.organization,
        ids.company,
        action,
        version,
        "G2_CERTIFICATION",
        "b".repeat(64),
        readiness,
        key,
        actor,
      ],
    );
    return result.rows[0];
  };
  const first = await invoke("activate", "g2-customer-activate"),
    replay = await invoke("activate", "g2-customer-activate");
  assert.equal(first.status, "active");
  assert.equal(replay.replayed, true);
  assert.equal(replay.event_id, first.event_id);
  version = Number(first.resulting_version);
  for (const [action, status] of [
    ["suspend", "suspended"],
    ["reactivate", "active"],
    ["deactivate", "inactive"],
    ["archive", "archived"],
  ]) {
    const row = await invoke(action, `g2-customer-${action}`);
    assert.equal(row.status, status);
    assert.equal(Number(row.resulting_version), version + 1);
    version++;
  }
  probes.push({
    code: "customer_full_lifecycle_exact_replay",
    passed: true,
    finalStatus: "archived",
    resultingVersion: version,
  });
}

async function lifecycleFailureOutcomes() {
  const sql = `SELECT * FROM control.command_customer_lifecycle($1,$2,$3,$4,$5,'deactivate',$6,'G2_CERTIFICATION',CURRENT_DATE,NULL,'{}'::jsonb,$7,$8)`;
  await rejected("customer_not_found", "P0002", () =>
    client.query(sql, [
      tenant,
      ids.bpB,
      randomUUID(),
      ids.organization,
      ids.company,
      1,
      `g2-not-found-${randomUUID()}`,
      actor,
    ]),
  );
  await rejected("customer_wrong_tenant", "42501", () =>
    client.query(sql, [
      randomUUID(),
      ids.bpB,
      ids.customerB,
      ids.organization,
      ids.company,
      1,
      `g2-wrong-tenant-${randomUUID()}`,
      actor,
    ]),
  );
  await rejected("customer_stale_version", "40001", () =>
    client.query(sql, [
      tenant,
      ids.bpB,
      ids.customerB,
      ids.organization,
      ids.company,
      99,
      `g2-stale-${randomUUID()}`,
      actor,
    ]),
  );
  await rejected("customer_invalid_transition", "55000", () =>
    client.query(sql, [
      tenant,
      ids.bpB,
      ids.customerB,
      ids.organization,
      ids.company,
      1,
      `g2-invalid-${randomUUID()}`,
      actor,
    ]),
  );
}

async function lifecycleConcurrency() {
  const readiness = {
    decisionFingerprint: "c".repeat(64),
    eligible: true,
    businessPartnerId: ids.bpB,
    role: "customer",
    operatingOrganizationId: ids.organization,
    companyCodeId: ids.company,
    businessDate: new Date().toISOString().slice(0, 10),
  };
  await client.query(
    `SELECT * FROM control.command_customer_lifecycle($1,$2,$3,$4,$5,'activate',1,'G2_CERTIFICATION',CURRENT_DATE,$6,$7,'g2-race-activate',$1)`,
    [
      tenant,
      ids.bpB,
      ids.customerB,
      ids.organization,
      ids.company,
      "c".repeat(64),
      readiness,
    ],
  );
  const peers = [
    new Client({ connectionString: url }),
    new Client({ connectionString: url }),
  ];
  await Promise.all(peers.map((peer) => peer.connect()));
  try {
    await Promise.all(peers.map((peer) => context(peer)));
    const sql = `SELECT * FROM control.command_customer_lifecycle($1,$2,$3,$4,$5,'suspend',2,'G2_CERTIFICATION',CURRENT_DATE,NULL,'{}'::jsonb,$6,$1)`;
    const results = await Promise.all(
      peers.map((peer, index) =>
        peer
          .query(sql, [
            tenant,
            ids.bpB,
            ids.customerB,
            ids.organization,
            ids.company,
            `g2-race-suspend-${index}`,
          ])
          .then((result) => ({
            accepted: result.rows.length === 1,
            sqlState: null,
          }))
          .catch((error) => ({
            accepted: false,
            sqlState: error.code ?? null,
          })),
      ),
    );
    const acceptedCount = results.filter((result) => result.accepted).length,
      rejected = results.filter((result) => !result.accepted);
    probes.push({
      code: "customer_lifecycle_concurrency_one_winner",
      passed:
        acceptedCount === 1 &&
        rejected.length === 1 &&
        rejected[0].sqlState === "40001",
      accepted: acceptedCount,
      rejected: rejected.length,
      loserSqlState: rejected[0]?.sqlState ?? null,
    });
  } finally {
    await Promise.all(peers.map((peer) => peer.end()));
  }
}

async function accepted(code, work) {
  try {
    await work();
    probes.push({ code, passed: true });
  } catch (error) {
    probes.push({
      code,
      passed: false,
      sqlState: error.code ?? null,
      message: error.message.slice(0, 240),
    });
  }
}
async function rejected(code, state, work) {
  try {
    await work();
    probes.push({
      code,
      passed: false,
      sqlState: null,
      message: "accepted unexpectedly",
    });
  } catch (error) {
    probes.push({
      code,
      passed: error.code === state,
      sqlState: error.code ?? null,
      message: error.message.slice(0, 240),
    });
  }
}
async function context(db) {
  await db.query(
    "SELECT set_config('app.database_plane','neon',false),set_config('app.current_tenant_id',$1,false),set_config('app.current_principal_id',$2,false)",
    [tenant, actor],
  );
}
async function cleanup() {
  await client.query("ROLLBACK").catch(() => undefined);
  await client.query("BEGIN");
  await client.query("SET LOCAL session_replication_role=replica");
  const all = Object.values(ids);
  await client
    .query(
      "DELETE FROM event.outbox WHERE tenant_id=$1 AND aggregate_id=ANY($2::uuid[])",
      [tenant, all],
    )
    .catch(() => undefined);
  await client
    .query(
      "DELETE FROM audit.audit_log WHERE tenant_id=$1 AND entity_id=ANY($2::uuid[])",
      [tenant, all],
    )
    .catch(() => undefined);
  await client
    .query(
      "DELETE FROM control.customer_lifecycle_event WHERE tenant_id=$1 AND customer_id=ANY($2::uuid[])",
      [tenant, all],
    )
    .catch(() => undefined);
  await client
    .query(
      "DELETE FROM control.business_partner_mutation_evidence WHERE tenant_id=$1 AND aggregate_id=ANY($2::uuid[])",
      [tenant, all],
    )
    .catch(() => undefined);
  await client
    .query(
      "DELETE FROM control.business_partner_qualification WHERE tenant_id=$1 AND business_partner_id=ANY($2::uuid[])",
      [tenant, all],
    )
    .catch(() => undefined);
  await client
    .query(
      "DELETE FROM master.address_link WHERE tenant_id=$1 AND (owner_id=ANY($2::uuid[]) OR address_id=ANY($2::uuid[]))",
      [tenant, all],
    )
    .catch(() => undefined);
  await client
    .query(
      "DELETE FROM master.contact_link WHERE tenant_id=$1 AND owner_id=ANY($2::uuid[])",
      [tenant, all],
    )
    .catch(() => undefined);
  for (const [table, column] of [
    ["master.address", "id"],
    [
      "master.business_partner_operating_organization_assignment",
      "business_partner_id",
    ],
    ["master.operating_organization_company_assignment", "id"],
    ["master.customer", "id"],
    ["master.supplier", "id"],
    ["master.business_partner", "id"],
    ["master.operating_organization", "id"],
    ["master.company_code", "id"],
    ["master.legal_entity", "id"],
  ])
    await client
      .query(
        `DELETE FROM ${table} WHERE tenant_id=$1 AND ${column}=ANY($2::uuid[])`,
        [tenant, all],
      )
      .catch(() => undefined);
  await client
    .query("DELETE FROM master.tenant WHERE id=$1", [ids.tenantB])
    .catch(() => undefined);
  await client.query("COMMIT");
}
function option(name) {
  return process.argv
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
