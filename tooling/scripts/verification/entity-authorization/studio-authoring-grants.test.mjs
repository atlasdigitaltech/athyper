import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildStudioAuthoringGrantSql,
  grantHash,
} from "./studio-authoring-grants.mjs";
const p = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-v2-studio-authoring-grants.proposal.dev.json",
    ),
  ),
  a = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-v2-studio-authoring-grants.acceptance.dev.json",
    ),
  );
test("changed grants cannot reuse the recorded approval", () => {
  const changed = structuredClone(p);
  changed.assignments[0].permissions.push("metadata.entity.activate");
  assert.throws(() => buildStudioAuthoringGrantSql(changed, a));
  const { proposalRevision, ...body } = changed;
  changed.proposalRevision = grantHash(body);
  assert.throws(() => buildStudioAuthoringGrantSql(changed, a));
  assert.throws(() =>
    buildStudioAuthoringGrantSql(p, { ...a, scope: "blanket" }),
  );
});
test("application remains time bounded and revocation does not reinstate authority", () => {
  const apply = buildStudioAuthoringGrantSql(p, a, { commit: true });
  assert.match(apply, /Outside approved grant window/);
  assert.match(apply, /Existing authority changed/);
  const revoke = buildStudioAuthoringGrantSql(p, a, {
    commit: true,
    revoke: true,
  });
  assert.doesNotMatch(revoke, /INSERT INTO authz/);
  assert.doesNotMatch(revoke, /SET status='active'/);
  assert.match(revoke, /SET status='revoked'/);
  assert.doesNotMatch(revoke, /runtime_meta|publication\.release/);
});
test("unapproved proposals can only be rehearsed with rollback", () => {
  const preview = buildStudioAuthoringGrantSql(p, null);
  assert.match(preview, /ROLLBACK;\s*$/);
  assert.doesNotMatch(preview, /COMMIT;/);
  assert.throws(() => buildStudioAuthoringGrantSql(p, null, { commit: true }));
  assert.throws(() =>
    buildStudioAuthoringGrantSql(p, null, { commit: true, revoke: true }),
  );
});
test("scope and validity cannot disagree with the SQL assignment", () => {
  for (const change of [
    { scopeTargetId: "different-tenant" },
    { scopeKind: "company" },
    { effectiveUntil: p.effectiveFrom },
  ]) {
    const { proposalRevision, ...body } = p;
    const changed = { ...body, ...change };
    const proposal = { ...changed, proposalRevision: grantHash(changed) };
    assert.throws(() => buildStudioAuthoringGrantSql(proposal, null));
  }
});
