import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertTargetReadApproval,
  buildTargetReadGrantSql,
} from "./target-read-grants.mjs";
const input = () => {
  const proposalBytes = readFileSync(
    "governance/policy/reviews/business-partner-target-read-grants.proposal.dev.json",
  );
  return {
    proposalBytes,
    proposal: JSON.parse(proposalBytes),
    approval: JSON.parse(
      readFileSync(
        "governance/policy/reviews/business-partner-target-read-grants.approval.dev.json",
      ),
    ),
    rehearsal: JSON.parse(
      readFileSync(
        "governance/policy/reports/business-partner-target-read-grants.dry-run.dev.json",
      ),
    ),
    now: "2026-09-11T00:00:00Z",
  };
};
test("exact approved binding is eligible at the window boundary", () => {
  assert.doesNotThrow(() => assertTargetReadApproval(input()));
});
test("before-window, expired and invalid clocks cannot apply", () => {
  for (const now of [
    "2026-09-10T23:59:59.999Z",
    "2026-12-10T00:00:00Z",
    "invalid",
  ])
    assert.throws(
      () => assertTargetReadApproval({ ...input(), now }),
      /window/,
    );
});
test("changed grants, principals, scopes and approvals cannot inherit consent", () => {
  for (const mutate of [
    (i) => i.proposal.role.permissions.pop(),
    (i) => i.approval.approvedPrincipalIds.pop(),
    (i) => (i.proposal.assignment.propagationMode = "subtree"),
    (i) => (i.approval.grantChangesAuthorized = false),
    (i) => (i.rehearsal.rollbackConfirmed = false),
    (i) => (i.approval.source.exactMessage = "assumed"),
  ]) {
    const i = input();
    mutate(i);
    assert.throws(() => assertTargetReadApproval(i));
  }
});
test("transaction is rollback-only by default and committed grants have database clock guards", () => {
  const p = input().proposal;
  assert.match(buildTargetReadGrantSql(p), /ROLLBACK;\s*$/);
  const sql = buildTargetReadGrantSql(p, { commit: true });
  assert.match(sql, /clock_timestamp\(\)</);
  assert.match(sql, /Existing authority changed/);
  assert.match(sql, /SERIALIZABLE/);
  assert.doesNotMatch(sql, /ON CONFLICT/);
  assert.match(sql, /COMMIT;\s*$/);
});
