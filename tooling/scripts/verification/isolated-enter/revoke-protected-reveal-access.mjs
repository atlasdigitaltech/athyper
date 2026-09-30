import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  proposal,
  fixtures,
  bp,
  base,
  coordinates,
  ai,
  send,
  sql,
  quote,
  journal,
} from "./protected-reveal-client.mjs";

const reportPath =
  "governance/policy/reports/business-partner-protected-reveal-revocation-20260912.dev.json";
if (fs.existsSync(reportPath)) throw Error("PRESERVE_REVOCATION_EVIDENCE");
const others = () =>
  JSON.parse(
    sql(
      `SELECT jsonb_build_object('memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id),'[]') FROM authz.group_member m WHERE source_ref IS DISTINCT FROM ${quote(proposal.proposalRevision)}),'assignments',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM authz.group_role r WHERE source_ref IS DISTINCT FROM ${quote(proposal.proposalRevision)}));`,
    ),
  );
const before = others(),
  mutations = [];
const revoke = (batches) => {
  const groups = batches.map((b) => quote(b.groupId)).join(",");
  const result = sql(
    `BEGIN;UPDATE authz.group_member SET status='revoked',status_changed_at=clock_timestamp(),status_changed_by=created_by WHERE source_ref=${quote(proposal.proposalRevision)} AND group_id IN (${groups}) AND status='active';UPDATE authz.group_role SET status='revoked',status_changed_at=clock_timestamp(),status_changed_by=created_by WHERE source_ref=${quote(proposal.proposalRevision)} AND group_id IN (${groups}) AND status='active';SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`,
  );
  mutations.push({
    at: new Date().toISOString(),
    groups: batches.map((b) => ({
      account: b.account,
      purpose: b.purpose,
      groupId: b.groupId,
    })),
    result: result.trim(),
  });
  assert.deepEqual(others(), before);
};
const status = (n) => (r) => assert.equal(r.status, n);
const partial = journal("staged-revocation", (check) => {
  const command = {
    bankAccountLinkId: fixtures.ids.bankLink,
    purpose: "qualification.neon",
    revealId: randomUUID(),
    purposeExpiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  check(
    "bank_reveal_before",
    "catl.admin",
    base + "banking/reveal" + coordinates,
    "POST",
    command,
    (r) => {
      assert.equal(r.status, 200);
      assert.equal(r.body.value, "GB82WEST12345698765432");
    },
  );
  revoke(
    proposal.batches.filter(
      (b) => b.account === "catl.admin" && b.purpose === "reveals",
    ),
  );
  check(
    "bank_reveal_after",
    "catl.admin",
    base + "banking/reveal" + coordinates,
    "POST",
    command,
    status(403),
  );
  check(
    "bank_masked_after_reveal_revoke",
    "catl.admin",
    base + "banking",
    "GET",
    {},
    (r) => {
      assert.equal(r.status, 200);
      assert(!JSON.stringify(r.body).includes("GB82WEST12345698765432"));
    },
  );
  check(
    "finance_before",
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
  revoke(
    proposal.batches.filter(
      (b) => b.account === "catl.admin" && b.purpose === "finance-activity",
    ),
  );
  check(
    "finance_after",
    "catl.admin",
    base + "business-activity" + coordinates,
    "GET",
    {},
    (r) => {
      assert.equal(r.status, 200);
      const f = r.body.data.providers.find((p) => p.provider === "finance");
      assert.equal(f.state, "unavailable");
      assert.equal(f.metrics?.length ?? 0, 0);
      assert.equal(f.reasonCode, "FINANCE_ACTIVITY_FORBIDDEN");
    },
  );
  check(
    "atlas_before",
    "catl.admin",
    "/api/isolated/ai-record-retrieval",
    "POST",
    ai,
    status(200),
  );
  revoke(
    proposal.batches.filter(
      (b) => b.account === "catl.admin" && b.purpose === "atlas",
    ),
  );
  check(
    "atlas_after",
    "catl.admin",
    "/api/isolated/ai-record-retrieval",
    "POST",
    ai,
    (r) => {
      assert.equal(r.status, 403);
      assert.equal(r.body.code, "AI_ADMISSION_DENIED");
    },
  );
  check(
    "parent_after_atlas_revoke",
    "catl.admin",
    "/api/records/business_partner/" + bp,
    "GET",
    {},
    status(200),
  );
  check(
    "owner_attachment_before",
    "catl.owner",
    base + "attachments",
    "GET",
    {},
    (r) => {
      assert.equal(r.status, 200);
      assert.equal(r.body.data.items[0].id, fixtures.ids.attachments[0]);
    },
  );
  revoke(
    proposal.batches.filter(
      (b) =>
        b.account === "catl.owner" &&
        ["comment", "attachment"].includes(b.purpose),
    ),
  );
  for (const section of ["comments", "attachments"])
    check(
      "owner_" + section + "_after",
      "catl.owner",
      base + section,
      "GET",
      {},
      (r) => {
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.data.items, []);
      },
    );
  check(
    "owner_parent_after_child_revoke",
    "catl.owner",
    "/api/records/business_partner/" + bp,
    "GET",
    {},
    status(200),
  );
  check(
    "admin_cases_before",
    "catl.admin",
    base + "requests" + coordinates,
    "GET",
    {},
    (r) => {
      assert.equal(r.status, 200);
      assert(r.body.data.items.length > 0);
    },
  );
  revoke(
    proposal.batches.filter(
      (b) => b.account === "catl.admin" && b.purpose === "case-read",
    ),
  );
  check(
    "admin_cases_after",
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
    "owner_cases_unchanged",
    "catl.owner",
    base + "requests" + coordinates,
    "GET",
    {},
    (r) => {
      assert.equal(r.status, 200);
      assert(r.body.data.items.length > 0);
    },
  );
});
// Cleanup runs even when individual staged assertions failed.
revoke(proposal.batches);
const final = journal("post-revocation", (check) => {
  for (const actor of ["catl.admin", "catl.owner"]) {
    check(
      actor.split(".")[1] + "_record",
      actor,
      "/api/records/business_partner/" + bp,
      "GET",
      {},
      status(403),
    );
    check(
      actor.split(".")[1] + "_provider",
      actor,
      base + "banking",
      "GET",
      {},
      status(403),
    );
  }
  check(
    "atlas",
    "catl.admin",
    "/api/isolated/ai-record-retrieval",
    "POST",
    ai,
    status(403),
  );
  check(
    "reveal_command",
    "catl.admin",
    base + "banking/reveal" + coordinates,
    "POST",
    {
      bankAccountLinkId: fixtures.ids.bankLink,
      purpose: "qualification.neon",
      revealId: randomUUID(),
      purposeExpiresAt: new Date(Date.now() + 60000).toISOString(),
    },
    status(403),
  );
});
const remaining = JSON.parse(
  sql(
    `SELECT jsonb_build_object('activeMemberships',(SELECT count(*) FROM authz.group_member WHERE source_ref=${quote(proposal.proposalRevision)} AND status='active'),'activeAssignments',(SELECT count(*) FROM authz.group_role WHERE source_ref=${quote(proposal.proposalRevision)} AND status='active'));`,
  ),
);
assert.equal(remaining.activeMemberships, 0);
assert.equal(remaining.activeAssignments, 0);
assert.deepEqual(others(), before);
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      proposalRevision: proposal.proposalRevision,
      runtimeImage: proposal.runtimeImage,
      releaseSetHash: proposal.releaseSetHash,
      revoked: true,
      remaining,
      mutations,
      stagedPassed: partial.complete,
      postRevocationPassed: final.complete,
      otherMembershipsAndAssignmentsUnchanged: true,
      atlasLiveRevocation: partial.checks
        .filter((x) => ["atlas_before", "atlas_after"].includes(x.label))
        .every((x) => x.passed),
      commandWasPreviouslyAdmitted:
        partial.checks.find((c) => c.label === "bank_reveal_before")?.passed ===
        true,
      positiveFilteredCountQualified: false,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log({
  revoked: true,
  remaining,
  stagedPassed: partial.complete,
  postRevocationPassed: final.complete,
});
