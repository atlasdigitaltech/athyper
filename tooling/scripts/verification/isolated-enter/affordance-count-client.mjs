import { run, proposalPrefix } from "./affordance-count-run.mjs";
import fs from "node:fs";
import assert from "node:assert/strict";
import { docker, sql, quote, fingerprint } from "./protected-reveal-client.mjs";
export { docker, sql, quote, fingerprint };
export const proposal = JSON.parse(
  fs.readFileSync(proposalPrefix + ".proposal.dev.json"),
);
export const bp = proposal.fixtures.businessPartnerId,
  base = "/api/neon/business-partners/" + bp + "/360/",
  coordinates =
    "?operatingOrganizationId=" +
    proposal.fixtures.operatingOrganizationId +
    "&companyCodeId=" +
    proposal.fixtures.companyCodeId;
export function send(actor, path, method = "GET", body = {}) {
  const before = fingerprint();
  const r = JSON.parse(
    docker(
      [
        "exec",
        "-i",
        "athyper-bp-enter-ui-session-client",
        "node",
        "/app/server/qualification-client/session-client.mjs",
        actor,
        path,
        method,
      ],
      JSON.stringify(body),
    ),
  );
  assert.deepEqual(fingerprint(), before);
  assert.equal(r.releaseSet, proposal.releaseSetHash);
  assert.equal(
    r.principalId,
    proposal.batches.find((b) => b.account === actor).principalId,
  );
  return r;
}
export function revoke(batches, reason) {
  assert(batches.length > 0);
  const groups = batches.map((b) => quote(b.groupId)).join(",");
  const others = () =>
    sql(
      `SELECT jsonb_build_object('memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM authz.group_member m WHERE source_ref IS DISTINCT FROM ${quote(proposal.proposalRevision)}),'assignments',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM authz.group_role m WHERE source_ref IS DISTINCT FROM ${quote(proposal.proposalRevision)}));`,
    );
  const before = others();
  sql(
    `BEGIN;UPDATE authz.group_member SET status='revoked',status_changed_at=clock_timestamp(),status_changed_by=created_by WHERE source_ref=${quote(proposal.proposalRevision)} AND group_id IN (${groups}) AND status='active';UPDATE authz.group_role SET status='revoked',status_changed_at=clock_timestamp(),status_changed_by=created_by WHERE source_ref=${quote(proposal.proposalRevision)} AND group_id IN (${groups}) AND status='active';SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`,
  );
  assert.equal(others(), before);
  return {
    at: new Date().toISOString(),
    reason,
    groupIds: batches.map((b) => b.groupId),
    otherMembershipsAndAssignmentsUnchanged: true,
  };
}
