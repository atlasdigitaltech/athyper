import fs from "node:fs";
import { docker, sql, quote } from "./protected-reveal-client.mjs";
export const proposal = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-manual-ui-walkthrough-20260912.proposal.dev.json",
  ),
);
export function revokeManualAccess(reason) {
  const ref = quote(proposal.proposalRevision);
  sql(
    `BEGIN;UPDATE authz.group_member SET status='revoked',status_changed_at=clock_timestamp(),status_changed_by=created_by WHERE source_ref=${ref} AND status='active';UPDATE authz.group_role SET status='revoked',status_changed_at=clock_timestamp(),status_changed_by=created_by WHERE source_ref=${ref} AND status='active';SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`,
  );
  const active = Number(
    sql(
      `SELECT (SELECT count(*) FROM authz.group_member WHERE source_ref=${ref} AND status='active')+(SELECT count(*) FROM authz.group_role WHERE source_ref=${ref} AND status='active');`,
    ),
  );
  if (active !== 0) throw Error("Manual access remains active");
  const result = {
    at: new Date().toISOString(),
    proposalRevision: proposal.proposalRevision,
    reason,
    active: 0,
  };
  fs.writeFileSync(
    "governance/policy/reports/business-partner-manual-ui-revocation-20260912.dev.json",
    JSON.stringify(result, null, 2) + "\n",
    { flag: "wx" },
  );
  return result;
}
export { docker, sql, quote };
