import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { accessInsertionSql } from "./access-sql.mjs";
import { docker, sql, quote, fingerprint } from "./protected-reveal-client.mjs";
const prefix =
    "governance/policy/reviews/business-partner-manual-ui-walkthrough-20260912",
  out =
    "governance/policy/reports/business-partner-manual-ui-access-20260912.dev.json";
assert(!fs.existsSync(prefix + ".proposal.dev.json") && !fs.existsSync(out));
const prior = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-final-closure-execution-20260912.proposal.dev.json",
  ),
);
const batches = prior.batches
  .filter((b) => b.purpose !== "reveals")
  .map((b) => ({
    ...b,
    roleId: randomUUID(),
    groupId: randomUUID(),
    assignmentId: randomUUID(),
    code:
      "bp.manual.ui." + b.account.split(".")[1] + "." + b.purpose + ".20260912",
    permissions: b.permissions.filter((p) => !p.code.endsWith(".reveal")),
  }));
assert(
  batches.every(
    (b) =>
      b.permissions.length &&
      b.permissions.every(
        (p) =>
          !p.requires_mfa &&
          !p.requires_sod &&
          /\.(read|discover|enter|navigate_manage|navigate_overview|[a-z_]+_read)$/.test(
            p.code,
          ),
      ),
  ),
);
const p = {
  schemaVersion: 1,
  kind: "isolated_neon_manual_ui_walkthrough",
  tenantId: prior.tenantId,
  releaseId: prior.releaseId,
  artifactHash: prior.artifactHash,
  runtimeImage: prior.runtimeImage,
  uiImage: prior.uiImage,
  releaseSetHash: prior.releaseSetHash,
  effectiveFrom: new Date().toISOString(),
  effectiveUntil: "2026-09-12T16:00:00.000Z",
  batches,
  permissionAssignments: batches.reduce((n, b) => n + b.permissions.length, 0),
  fixtures: prior.fixtures,
  scope:
    "Manual read-only browsing of existing isolated synthetic partners; no create/submit/approve/apply or protected reveals",
  permissionScopeNote:
    "Existing tenant read and exact company/case-read scopes; no claim of per-test-record IAM restriction",
  cleanup:
    "Revoke when user finishes, with midnight MYT hard expiry; no renewal",
  enforcementActivationAuthorized: false,
  compatibilityRetirementAuthorized: false,
  sharedDevChanges: false,
};
assert(Date.now() < Date.parse(p.effectiveUntil));
p.proposalRevision = createHash("sha256")
  .update(JSON.stringify(p))
  .digest("hex");
fs.writeFileSync(
  prefix + ".proposal.dev.json",
  JSON.stringify(p, null, 2) + "\n",
  { flag: "wx" },
);
fs.writeFileSync(
  prefix + ".user-approval.dev.json",
  JSON.stringify(
    {
      schemaVersion: 1,
      decision: "approved",
      proposalRevision: p.proposalRevision,
      approvedAt: new Date().toISOString(),
      source: {
        channel: "user",
        exactMessage: "ok.. go ahead",
        respondingTo:
          "Simple manual walkthrough using existing test partners, one approval for needed permissions today and cleanup when finished",
      },
      actor: { type: "conversation_user", namedAccountImpersonated: false },
      effectiveUntil: p.effectiveUntil,
      grantsRestoreAuthorized: false,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
for (const mode of ["api", "worker", "neon-ui"]) {
  const c = JSON.parse(docker(["inspect", "athyper-bp-enter-" + mode]))[0];
  assert(c.State.Running);
  assert.equal(c.Image, mode === "neon-ui" ? p.uiImage : p.runtimeImage);
}
const sessions = [];
for (const actor of ["catl.admin", "catl.owner"]) {
  const r = JSON.parse(
    docker(
      [
        "exec",
        "-i",
        "athyper-bp-enter-ui-session-client",
        "node",
        "/app/server/qualification-client/session-client.mjs",
        actor,
        "/api/iam/me",
        "GET",
      ],
      "{}",
    ),
  );
  assert.equal(r.status, 200);
  assert.equal(
    r.principalId,
    batches.find((b) => b.account === actor).principalId,
  );
  assert.equal(r.releaseSet, p.releaseSetHash);
  sessions.push({ actor, principalId: r.principalId, assurance: r.assurance });
}
const before = fingerprint(),
  rehearsal = JSON.parse(sql(accessInsertionSql(p) + "ROLLBACK;").trim());
assert.deepEqual(fingerprint(), before);
assert.equal(rehearsal.permissionAssignments, p.permissionAssignments);
const old = () =>
    sql(
      `SELECT jsonb_build_object('memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM authz.group_member m WHERE source_ref IS DISTINCT FROM ${quote(p.proposalRevision)}),'assignments',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM authz.group_role m WHERE source_ref IS DISTINCT FROM ${quote(p.proposalRevision)}));`,
    ),
  oldRows = old();
const result = JSON.parse(
  sql(
    accessInsertionSql(p) +
      `DO $expiry$ BEGIN IF clock_timestamp()>=${quote(p.effectiveUntil)}::timestamptz THEN RAISE EXCEPTION 'Window expired';END IF;END $expiry$;COMMIT;`,
  ).trim(),
);
assert.equal(old(), oldRows);
assert.deepEqual(result, rehearsal);
fs.writeFileSync(
  out,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      proposalRevision: p.proposalRevision,
      result,
      sessions,
      effectiveUntil: p.effectiveUntil,
      rehearsalRolledBack: true,
      oldMembershipsAndAssignmentsUnchanged: true,
      readOnly: true,
      sharedDevChanged: false,
      before,
      after: fingerprint(),
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log({
  applied: true,
  readOnly: true,
  result,
  effectiveUntil: p.effectiveUntil,
});
