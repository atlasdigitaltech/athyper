import { run, proposalPrefix } from "./affordance-count-run.mjs";
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { accessInsertionSql } from "./access-sql.mjs";
import { docker, sql, quote, fingerprint } from "./protected-reveal-client.mjs";
const prefix = proposalPrefix,
  p = JSON.parse(fs.readFileSync(prefix + ".proposal.dev.json")),
  a = JSON.parse(fs.readFileSync(prefix + ".user-approval.dev.json"));
const { proposalRevision, ...body } = p;
assert.equal(
  createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  proposalRevision,
);
assert.equal(a.decision, "approved");
assert.equal(a.proposalRevision, proposalRevision);
assert(
  Date.now() >= Date.parse(p.effectiveFrom) &&
    Date.now() < Date.parse(p.effectiveUntil),
);
for (const mode of ["api", "worker", "neon-ui"]) {
  const c = JSON.parse(docker(["inspect", "athyper-bp-enter-" + mode]))[0];
  assert(c.State.Running);
  assert.equal(c.Image, mode === "neon-ui" ? p.uiImage : p.runtimeImage);
}
const output = `governance/policy/reports/business-partner-affordance-count-access-application-${run}.dev.json`;
assert(!fs.existsSync(output));
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
  assert.equal(r.assurance, "elevated");
  assert.equal(
    r.principalId,
    p.batches.find((b) => b.account === actor).principalId,
  );
  assert.equal(r.releaseSet, p.releaseSetHash);
  sessions.push({ actor, principalId: r.principalId, assurance: r.assurance });
}
const others = () =>
  sql(
    `SELECT jsonb_build_object('memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM authz.group_member m WHERE source_ref IS DISTINCT FROM ${quote(proposalRevision)}),'assignments',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM authz.group_role m WHERE source_ref IS DISTINCT FROM ${quote(proposalRevision)}));`,
  );
assert.equal(
  Number(
    sql(
      `SELECT count(*) FROM authz.group_role WHERE source_ref=${quote(proposalRevision)};`,
    ),
  ),
  0,
);
const before = fingerprint(),
  unchanged = others();
const result = JSON.parse(
  sql(
    accessInsertionSql(p) +
      `DO $expiry$ BEGIN IF clock_timestamp()>=${quote(p.effectiveUntil)}::timestamptz THEN RAISE EXCEPTION 'Window closed';END IF;END $expiry$;COMMIT;`,
  ).trim(),
);
assert.equal(result.permissionAssignments, p.permissionAssignments);
assert.equal(result.newMemberships, p.batches.length);
assert.equal(result.newAssignments, p.batches.length);
assert.equal(others(), unchanged);
fs.writeFileSync(
  output,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      proposalRevision,
      sessions,
      result,
      before,
      after: fingerprint(),
      oldMembershipsAndAssignmentsUnchanged: true,
      effectiveUntil: p.effectiveUntil,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log({
  applied: true,
  result,
  oldAccessRestored: false,
  effectiveUntil: p.effectiveUntil,
});
