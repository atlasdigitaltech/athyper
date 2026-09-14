import fs from "node:fs";
import assert from "node:assert/strict";
import {
  proposal,
  bp,
  base,
  coordinates,
  organization,
  company,
  sql,
  quote,
  journal,
  fingerprint,
} from "./protected-reveal-client.mjs";
const wrong = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-company-context-revocation-20260912.dev.json",
  ),
).unauthorizedCompanyFixtureId;
const before = fingerprint();
const assignment = JSON.parse(
  sql(
    `SELECT row_to_json(a) FROM master.operating_organization_company_assignment a WHERE tenant_id=${quote(proposal.tenantId)} AND operating_organization_id=${quote(organization)} AND company_code_id=${quote(company)};`,
  ),
);
const stamp = `SET LOCAL app.current_tenant_id=${quote(proposal.tenantId)};SET LOCAL app.current_principal_id=${quote(proposal.batches[0].principalId)};`;
const report = journal("context", (check, report) => {
  for (const actor of ["catl.admin", "catl.owner"]) {
    check(
      actor + "_wrong_company",
      actor,
      base +
        "customer-company?operatingOrganizationId=" +
        organization +
        "&companyCodeId=" +
        wrong,
      "GET",
      {},
      (r) => {
        assert.equal(r.status, 403);
      },
    );
  }
  check(
    "finance_missing_context",
    "catl.admin",
    base + "business-activity",
    "GET",
    {},
    (r) => {
      assert.equal(r.status, 409);
    },
  );
  try {
    sql(
      `BEGIN;${stamp}UPDATE master.operating_organization_company_assignment SET status='inactive',status_changed_at=clock_timestamp(),status_changed_by=${quote(proposal.batches[0].principalId)} WHERE id=${quote(assignment.id)};COMMIT;`,
    );
    for (const section of ["customer-company", "business-activity"])
      check(
        "stale_" + section,
        "catl.admin",
        base + section + coordinates,
        "GET",
        {},
        (r) => {
          assert([400, 403, 409].includes(r.status));
          assert.equal(r.body.code, "BP_360_SCOPE_INVALID");
        },
      );
  } finally {
    sql(
      `BEGIN;${stamp}UPDATE master.operating_organization_company_assignment SET status=${quote(assignment.status)},status_changed_at=clock_timestamp(),status_changed_by=${quote(proposal.batches[0].principalId)} WHERE id=${quote(assignment.id)};COMMIT;`,
    );
    report.compatibleContextRestored = true;
  }
  check(
    "finance_after_context_restore",
    "catl.admin",
    base + "business-activity" + coordinates,
    "GET",
    {},
    (r) => {
      assert.equal(r.status, 200);
      const f = r.body.data.providers.find((p) => p.provider === "finance");
      assert.equal(f.state, "ready");
      assert.equal(f.metrics.find((m) => m.code === "draft_journals").value, 1);
    },
  );
  report.contextMutationAuditRetained = true;
});
assert.deepEqual(fingerprint(), before);
if (!report.complete) process.exitCode = 1;
