import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha = (x) => createHash("sha256").update(x).digest("hex"),
  read = (p) => JSON.parse(fs.readFileSync(p));
const prefix =
    "governance/policy/reviews/business-partner-final-66-dispositions-20260912",
  p = read(prefix + ".proposal.dev.json"),
  { proposalRevision, ...body } = p;
assert.equal(sha(JSON.stringify(body)), proposalRevision);
assert.equal(p.kind, "bp_final_release_66_disposition_review");
assert.equal(p.activationAuthorized, false);
assert.equal(p.compatibilityRetirementAuthorized, false);
assert.equal(p.executionParityApproved, false);
assert.equal(p.grantChanges.length, 0);
const evidence = [
  p.sourceProposal,
  p.amendment,
  p.historicalLedger,
  p.finalArtifact,
  ...p.sources,
  ...p.qualification,
  p.regressions,
];
for (const e of evidence)
  assert.equal(
    sha(fs.readFileSync(e.path)),
    e.sha256,
    "EVIDENCE_CHANGED:" + e.path,
  );
const prior = read(p.sourceProposal.path),
  ids = [...prior.rows, ...prior.currentDifferenceProposals]
    .map((r) => r.id)
    .sort();
assert.equal(ids.length, 66);
assert.equal(new Set(p.rows.map((r) => r.id)).size, 66);
assert.deepEqual(p.rows.map((r) => r.id).sort(), ids);
const sources = new Map(p.sources.map((s) => [s.path, read(s.path)]));
for (const s of sources.values()) {
  assert.equal(s.runtimeImage, p.runtimeImage);
  assert.equal(s.releaseSetHash, p.releaseSetHash);
  assert.equal(s.diagnosticComplete, true);
  assert.equal(s.authorityUnchanged, true);
}
for (const row of p.rows) {
  assert.equal(row.executionParityClaimed, false);
  if (row.origin === "live") assert.equal(row.historicalCauseProven, false);
  for (const o of row.observations) {
    const source = sources.get(o.source);
    assert(source);
    assert.equal(source.actor, o.actor);
    assert.equal(new Set(o.evaluationRefs).size, o.count);
    for (const ref of o.evaluationRefs) {
      const c = source.comparisons.find((c) => c.evaluationRef === ref);
      assert(c);
      assert.equal(c.operationKey, row.operation);
      for (const key of [
        "sourceAuthority",
        "sourceStage",
        "targetState",
        "targetStage",
        "backendState",
      ])
        assert.equal(c[key], o[key]);
    }
  }
  assert(
    row.observations.length > 0 ||
      (row.deferredInSignedProfile &&
        row.surfaceEvidence.length === 2 &&
        row.surfaceEvidence.every((s) => s.status === 409)),
  );
}
const regressions = read(p.regressions.path);
assert(regressions.passed && regressions.testCount === 58);
for (const f of [...regressions.results, ...regressions.files])
  assert.equal(
    sha(fs.readFileSync(f.path)),
    f.sha256,
    "REGRESSION_CHANGED:" + f.path,
  );
let accepted = false;
const acceptancePath = prefix + ".user-acceptance.dev.json";
if (fs.existsSync(acceptancePath)) {
  const a = read(acceptancePath);
  assert.equal(a.kind, "explicit_user_final_66_disposition_acceptance");
  assert.equal(a.proposalRevision, proposalRevision);
  assert.equal(a.releaseSetHash, p.releaseSetHash);
  assert.equal(a.runtimeImage, p.runtimeImage);
  assert.equal(a.source.channel, "user");
  assert(
    [
      "accepted",
      "approved",
      "accepted the [66 proposed dispositions](/home/chandravel_natarajan/src/athyper/docs/reviews/business-partner-final-66-dispositions-20260912.md) and also complete UI reveal affordances and positive ordinary-case open-work counts.",
    ].includes(a.source.exactMessage),
  );
  assert.equal(a.source.respondingToProposalRevision, proposalRevision);
  assert.equal(a.actor.type, "conversation_user");
  assert.equal(a.actor.namedAccountImpersonated, false);
  assert.equal(a.activationAuthorized, false);
  assert.equal(a.grantsChanged, false);
  assert.equal(a.compatibilityRetirementAuthorized, false);
  assert.deepEqual(a.decisions.map((d) => d.id).sort(), ids);
  assert.equal(new Set(a.decisions.map((d) => d.id)).size, 66);
  for (const row of p.rows) {
    const d = a.decisions.find((d) => d.id === row.id);
    assert.equal(d.decision, "accept");
    assert.equal(d.disposition, row.proposedDisposition);
  }
  accepted = true;
}
const output =
  "governance/policy/reports/business-partner-final-66-dispositions-" +
  (accepted ? "accepted" : "pending") +
  "-20260912.dev.json";
const report = {
  createdAt: new Date().toISOString(),
  proposalRevision,
  runtimeImage: p.runtimeImage,
  releaseSetHash: p.releaseSetHash,
  evidenceValidated: true,
  total: 66,
  accepted: accepted ? 66 : 0,
  pending: accepted ? 0 : 66,
  activationAuthorized: false,
  compatibilityRetirementAuthorized: false,
  grantsChanged: false,
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
  flag: "wx",
});
console.log(report);
