import { run } from "./affordance-count-run.mjs";
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  proposal as p,
  bp,
  base,
  coordinates,
  send,
  revoke,
  sql,
  quote,
} from "./affordance-count-client.mjs";
const output = `governance/policy/reports/business-partner-affordance-count-revocation-${run}.dev.json`;
assert(!fs.existsSync(output));
const report = {
  createdAt: new Date().toISOString(),
  runtimeImage: p.runtimeImage,
  releaseSetHash: p.releaseSetHash,
  proposalRevision: p.proposalRevision,
  mutations: [],
  checks: [],
  revoked: false,
};
const save = () =>
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
const check = (label, actor, path, method, body, verify) => {
  const c = { label, actor, path, passed: false };
  report.checks.push(c);
  try {
    const r = send(actor, path, method, body);
    c.status = r.status;
    verify(r);
    c.passed = true;
  } catch (e) {
    c.failure = e.message.split("\n")[0].slice(0, 300);
  }
  save();
};
try {
  check(
    "positive_case_count_before",
    "catl.admin",
    base + "requests" + coordinates,
    "GET",
    {},
    (r) => {
      assert.equal(r.status, 200);
      assert.equal(r.body.data.openWork.active, 2);
    },
  );
  report.mutations.push(
    revoke(
      p.batches.filter(
        (b) => b.account === "catl.admin" && b.purpose === "case-read",
      ),
      "live_independent_child_revocation",
    ),
  );
  save();
  check(
    "case_rows_and_count_removed",
    "catl.admin",
    base + "requests" + coordinates,
    "GET",
    {},
    (r) => {
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.data.items, []);
      assert(!Object.hasOwn(r.body.data, "openWork"));
    },
  );
  check(
    "summary_case_counts_removed",
    "catl.admin",
    base + "summary" + coordinates,
    "GET",
    {},
    (r) => {
      assert.equal(r.status, 200);
      assert(!Object.hasOwn(r.body.openWork, "activeRequestCount"));
      assert(!Object.hasOwn(r.body.openWork, "returnedRequestCount"));
      assert.deepEqual(r.body.recentActivity, []);
      assert(
        !Object.hasOwn(
          r.body.sections.find((s) => s.code === "requests") ?? {},
          "count",
        ),
      );
    },
  );
  check(
    "parent_remains_readable",
    "catl.admin",
    "/api/records/business_partner/" + bp,
    "GET",
    {},
    (r) => assert.equal(r.status, 200),
  );
} finally {
  report.mutations.push(revoke(p.batches, "qualification_complete"));
  report.revoked = true;
  save();
}
const staged = report.checks.length;
for (const actor of ["catl.admin", "catl.owner"])
  for (const [surface, path] of [
    ["parent", "/api/records/business_partner/" + bp],
    ["provider", base + "banking" + coordinates],
  ])
    check(actor + "_" + surface + "_after", actor, path, "GET", {}, (r) =>
      assert.equal(r.status, 403),
    );
check(
  "reveal_command_after",
  "catl.admin",
  base + "banking/reveal" + coordinates,
  "POST",
  {
    bankAccountLinkId: p.fixtures.protectedBankLinkId,
    purpose: "qualification.neon",
    revealId: randomUUID(),
    purposeExpiresAt: new Date(Date.now() + 60000).toISOString(),
  },
  (r) => assert.equal(r.status, 403),
);
check(
  "atlas_after",
  "catl.admin",
  "/api/isolated/ai-record-retrieval",
  "POST",
  {
    entityCode: "business_partner",
    recordId: bp,
    descriptorHash:
      "1e1f4dd20f900b220b644eb936baf0474c01357be4f3b18290340efea6ad9cda",
  },
  (r) => {
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "AI_ADMISSION_DENIED");
  },
);
report.remaining = JSON.parse(
  sql(
    `SELECT jsonb_build_object('activeMemberships',(SELECT count(*) FROM authz.group_member WHERE source_ref=${quote(p.proposalRevision)} AND status='active'),'activeAssignments',(SELECT count(*) FROM authz.group_role WHERE source_ref=${quote(p.proposalRevision)} AND status='active'));`,
  ),
);
assert.equal(
  report.remaining.activeMemberships + report.remaining.activeAssignments,
  0,
);
report.stagedPassed = report.checks.slice(0, staged).every((c) => c.passed);
report.postRevocationPassed = report.checks
  .slice(staged)
  .every((c) => c.passed);
report.otherMembershipsAndAssignmentsUnchanged = true;
save();
console.log({
  revoked: true,
  remaining: report.remaining,
  checks: report.checks,
});
