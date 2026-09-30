import fs from "node:fs";
import cp from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const output =
  "governance/policy/reports/business-partner-company-lifecycle-fixtures-20260912.dev.json";
assert.ok(!fs.existsSync(output));
const ids = {
  customer: randomUUID(),
  payment: randomUUID(),
  accounting: randomUUID(),
};
const tenant = "44444444-4444-4444-8444-444444444444",
  bp = "01a092d1-8242-7948-9ce9-6f19c38c4b27",
  org = "a478f9c0-8226-5d22-9599-b8fb27a45180",
  company = "793b6cb3-3c61-57c0-9562-2cbc288bd4cf";
const q = (x) => "'" + String(x).replaceAll("'", "''") + "'";
const sql = `BEGIN;SET LOCAL app.current_tenant_id=${q(tenant)};DO $fixture$ DECLARE actor uuid;BEGIN SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=${q(tenant)} AND code='seed.three-plane-provisioner' AND status='active';PERFORM set_config('app.current_principal_id',actor::text,true);IF NOT EXISTS(SELECT 1 FROM master.business_partner WHERE tenant_id=${q(tenant)} AND id=${q(bp)} AND status='active') THEN RAISE EXCEPTION 'Fixture BP unavailable';END IF;
INSERT INTO master.customer(id,tenant_id,business_partner_id,customer_code,customer_type,status,created_by) VALUES(${q(ids.customer)},${q(tenant)},${q(bp)},${q("QUAL." + ids.customer.toUpperCase())},'intercompany','prospect',actor);
INSERT INTO master.business_partner_operating_organization_assignment(tenant_id,business_partner_id,operating_organization_id,partner_role,status,created_by) VALUES(${q(tenant)},${q(bp)},${q(org)},'customer','active',actor);
INSERT INTO master.payment_term(id,tenant_id,code,name,due_days,status,created_by) VALUES(${q(ids.payment)},${q(tenant)},${q("QUAL." + ids.payment)},'Isolated company qualification fixture',30,'draft',actor);UPDATE master.payment_term SET status='active',status_changed_at=clock_timestamp(),status_changed_by=actor WHERE id=${q(ids.payment)};
INSERT INTO master.accounting_profile(id,tenant_id,code,name,direction,subledger_type,created_by) VALUES(${q(ids.accounting)},${q(tenant)},${q("QUAL." + ids.accounting)},'Isolated company qualification fixture','OUTBOUND','AR',actor);END $fixture$;SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`;
cp.execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-bp-enter-db",
    "psql",
    "-X",
    "-qAt",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
);
const report = {
  createdAt: new Date().toISOString(),
  kind: "isolated-synthetic-prerequisite-fixtures",
  ids,
  tenant,
  bp,
  org,
  company,
  retained: true,
  customerRoleCreatedByFixture: true,
  customerRoleCreationQualified: false,
  accessChanged: false,
  cleanup:
    "Retain linked finance/customer fixtures with case/approval history; no deletion without dependency review",
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(report);
