import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const p = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-company-execution-bound-20260912.proposal.dev.json",
    ),
  ),
  amendment = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-company-image-correction-v2-20260912.proposal.dev.json",
    ),
  ),
  fixture = JSON.parse(
    fs.readFileSync(
      "governance/policy/reports/business-partner-company-lifecycle-fixtures-20260912.dev.json",
    ),
  );
const output =
  "governance/policy/reports/business-partner-company-context-revocation-20260912.dev.json";
assert.ok(!fs.existsSync(output));
const report = {
  createdAt: new Date().toISOString(),
  runtimeImage: amendment.runtimeImage,
  releaseSetHash: amendment.releaseSetHash,
  checks: [],
  passed: false,
  revoked: false,
};
const save = () =>
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
const docker = (args, input) =>
  cp.execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const sql = (input) =>
  docker(
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
    input,
  );
const base = "/api/neon/business-partner-company-setup-cases";
const send = (account, name, path, method = "GET", data, expected = [200]) => {
  const r = JSON.parse(
    docker(
      [
        "exec",
        "-i",
        "athyper-bp-enter-ui-session-client",
        "node",
        "/app/server/qualification-client/session-client.mjs",
        account,
        path,
        method,
      ],
      data === undefined ? "" : JSON.stringify(data),
    ),
  );
  const check = {
    name,
    account,
    status: r.status,
    code: r.body?.code,
    releaseSet: r.releaseSet,
    passed:
      expected.includes(r.status) && r.releaseSet === amendment.releaseSetHash,
  };
  report.checks.push(check);
  save();
  assert.ok(check.passed, JSON.stringify(check));
  return r.body;
};
const company = randomUUID();
report.unauthorizedCompanyFixtureId = company;
sql(
  `BEGIN;SET LOCAL app.current_tenant_id='${p.tenantId}';DO $f$ DECLARE actor uuid;BEGIN SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id='${p.tenantId}' AND code='seed.three-plane-provisioner';PERFORM set_config('app.current_principal_id',actor::text,true);INSERT INTO master.company_code(id,tenant_id,legal_entity_id,code,name,functional_currency,country_code,status,created_by) SELECT '${company}',tenant_id,legal_entity_id,'qual_${company.slice(0, 8)}','Isolated unauthorized company fixture',functional_currency,country_code,'draft',actor FROM master.company_code WHERE id='${fixture.company}';UPDATE master.company_code SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id='${company}';INSERT INTO master.operating_organization_company_assignment(tenant_id,operating_organization_id,company_code_id,participation_role,status,created_by) SELECT tenant_id,operating_organization_id,'${company}',participation_role,'active',actor FROM master.operating_organization_company_assignment WHERE tenant_id='${p.tenantId}' AND company_code_id='${fixture.company}' AND operating_organization_id='${fixture.org}';END $f$;COMMIT;`,
);
save();
const payload = {
  kind: "configure_company",
  source: { kind: "manual" },
  requestedRole: "customer",
  targetBusinessPartnerId: fixture.bp,
  operatingOrganizationId: fixture.org,
  companyCodeId: fixture.company,
  idempotencyKey: randomUUID(),
  proposedPayload: {
    name: "Isolated revocation case",
    ownershipClass: "internal",
    customerType: "intercompany",
    currencyCode: "MYR",
    paymentTermId: fixture.ids.payment,
    defaultAccountingProfileId: fixture.ids.accounting,
  },
};
send(
  "catl.admin",
  "valid_unauthorized_company_rejected",
  base,
  "POST",
  { ...payload, companyCodeId: company },
  [403],
);
send(
  "catl.admin",
  "unauthorized_company_collection_rejected",
  base + "?companyCodeId=" + company,
  "GET",
  undefined,
  [403],
);
const draft = send(
  "catl.admin",
  "create_revocation_draft",
  base,
  "POST",
  { ...payload, idempotencyKey: randomUUID() },
  [201],
);
report.revocationCaseId = draft.request.id;
save();
const view = send(
  "catl.admin",
  "read_before_revocation",
  base + "/" + draft.request.id + "/view",
);
assert.equal(view.request.companyCodeId, fixture.company);
const assignment = JSON.parse(
  sql(
    `SELECT row_to_json(a) FROM master.operating_organization_company_assignment a WHERE tenant_id='${p.tenantId}' AND operating_organization_id='${fixture.org}' AND company_code_id='${fixture.company}';`,
  ),
);
const stamp = `SET LOCAL app.current_tenant_id='${p.tenantId}';SET LOCAL app.current_principal_id='${p.batches[0].principalId}';`;
try {
  sql(
    `BEGIN;${stamp}UPDATE master.operating_organization_company_assignment SET status='inactive',status_changed_at=now(),status_changed_by='${p.batches[0].principalId}' WHERE id='${assignment.id}';COMMIT;`,
  );
  send(
    "catl.admin",
    "stale_organization_company_context_rejected",
    base,
    "POST",
    { ...payload, idempotencyKey: randomUUID() },
    [403],
  );
} finally {
  sql(
    `BEGIN;${stamp}UPDATE master.operating_organization_company_assignment SET status='${assignment.status}',status_changed_at=now(),status_changed_by='${p.batches[0].principalId}' WHERE id='${assignment.id}';COMMIT;`,
  );
  report.contextRestored = true;
  save();
}
send(
  "catl.admin",
  "compatible_context_restored",
  base + "?companyCodeId=" + fixture.company,
);
const before = JSON.parse(
  sql(
    `SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM authz.group_member m WHERE source_ref<>'${p.proposalRevision}';`,
  ),
);
sql(
  `BEGIN;${stamp}UPDATE authz.group_member SET status='revoked',status_changed_at=now(),status_changed_by=created_by WHERE source_ref='${p.proposalRevision}';UPDATE authz.group_role SET status='revoked',status_changed_at=now(),status_changed_by=created_by WHERE source_ref='${p.proposalRevision}';COMMIT;`,
);
report.revoked = true;
save();
assert.deepEqual(
  JSON.parse(
    sql(
      `SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM authz.group_member m WHERE source_ref<>'${p.proposalRevision}';`,
    ),
  ),
  before,
);
report.otherMembershipsUnchanged = true;
for (const account of ["catl.admin", "catl.owner"])
  send(
    account,
    "read_after_revocation",
    base + "/" + draft.request.id + "/view",
    "GET",
    undefined,
    [403],
  );
send(
  "catl.admin",
  "command_after_read_and_revocation",
  base + "/" + draft.request.id + "/validate",
  "POST",
  { expectedVersion: view.request.rowVersion },
  [403],
);
send(
  "catl.admin",
  "create_after_revocation",
  base,
  "POST",
  { ...payload, idempotencyKey: randomUUID() },
  [403],
);
report.passed = true;
report.completedAt = new Date().toISOString();
save();
console.log({ passed: true, checks: report.checks, revoked: true });
