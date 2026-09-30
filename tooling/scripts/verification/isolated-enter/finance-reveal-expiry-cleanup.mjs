import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sql, quote } from "./finance-reveal-client.mjs";
const p = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-finance-reveal-execution-20260912.proposal.dev.json",
    ),
  ),
  approval = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-finance-reveal-execution-20260912.user-approval.dev.json",
    ),
  );
const { proposalRevision, ...body } = p;
assert.equal(
  createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  proposalRevision,
);
assert.equal(approval.decision, "approved");
assert.equal(approval.proposalRevision, proposalRevision);
console.log({
  cleanupScheduledAt: p.effectiveUntil,
  proposalRevision,
  scope: "Only this proposal; no grants created or extended",
});
await new Promise((resolve) =>
  setTimeout(resolve, Math.max(0, Date.parse(p.effectiveUntil) - Date.now())),
);
const result = sql(
  `BEGIN;DO $expiry$ BEGIN IF clock_timestamp()<${quote(p.effectiveUntil)}::timestamptz THEN RAISE EXCEPTION 'Expiry not reached';END IF;END $expiry$;UPDATE authz.group_member SET status='revoked',status_changed_at=clock_timestamp(),status_changed_by=created_by WHERE source_ref=${quote(proposalRevision)} AND status='active';UPDATE authz.group_role SET status='revoked',status_changed_at=clock_timestamp(),status_changed_by=created_by WHERE source_ref=${quote(proposalRevision)} AND status='active';COMMIT;SELECT jsonb_build_object('activeMemberships',(SELECT count(*) FROM authz.group_member WHERE source_ref=${quote(proposalRevision)} AND status='active'),'activeAssignments',(SELECT count(*) FROM authz.group_role WHERE source_ref=${quote(proposalRevision)} AND status='active'));`,
);
const remaining = JSON.parse(result.trim());
assert.equal(remaining.activeMemberships, 0);
assert.equal(remaining.activeAssignments, 0);
const report = {
  completedAt: new Date().toISOString(),
  proposalRevision,
  remaining,
  expiryNotExtended: true,
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-finance-reveal-expiry-cleanup-20260912.dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log(report);
