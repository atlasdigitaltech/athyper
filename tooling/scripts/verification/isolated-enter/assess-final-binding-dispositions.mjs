import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const prefix =
    "governance/policy/reviews/business-partner-final-binding-66-dispositions-20260912",
  read = (p) => JSON.parse(fs.readFileSync(p)),
  hash = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex"),
  p = read(prefix + ".proposal.dev.json"),
  { proposalRevision, ...body } = p;
assert.equal(
  createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  proposalRevision,
);
assert.equal(p.kind, "bp_final_binding_66_disposition_refresh");
assert.equal(p.rows.length, 66);
assert.equal(new Set(p.rows.map((r) => r.id)).size, 66);
assert(
  !p.activationAuthorized &&
    !p.compatibilityRetirementAuthorized &&
    !p.executionParityApproved,
);
assert.equal(p.grantChanges.length, 0);
for (const s of [...p.baseline, p.comparison, ...p.sources, ...p.qualification])
  assert.equal(hash(s.path), s.sha256, "EVIDENCE_CHANGED:" + s.path);
const baseline = read(p.baseline[0].path),
  oldAcceptance = read(p.baseline[1].path);
assert.equal(oldAcceptance.proposalRevision, baseline.proposalRevision);
assert.equal(p.originalAcceptedProposalRevision, baseline.proposalRevision);
assert.deepEqual(
  p.rows.map((r) => r.id).sort(),
  baseline.rows.map((r) => r.id).sort(),
);
const sources = new Map(p.sources.map((s) => [s.path, read(s.path)]));
for (const s of sources.values()) {
  assert.equal(s.runtimeImage, p.runtimeImage);
  assert.equal(s.releaseSetHash, p.releaseSetHash);
  assert(s.authorityUnchanged && s.diagnosticComplete);
}
for (const r of p.rows) {
  const prior = baseline.rows.find((x) => x.id === r.id);
  assert.equal(r.proposedDisposition, prior.proposedDisposition);
  assert.equal(r.executionParityClaimed, false);
  assert(
    r.observations.length ||
      (r.deferredInSignedProfile &&
        r.surfaceEvidence.length === 2 &&
        r.surfaceEvidence.every((s) => s.status === 409)),
  );
  for (const o of r.observations) {
    const s = sources.get(o.source);
    assert(s && s.actor === o.actor);
    const c = s.comparisons.find((c) => c.evaluationRef === o.evaluationRef);
    assert(c && c.operationKey === r.operation);
    for (const k of [
      "sourceAuthority",
      "sourceStage",
      "targetState",
      "targetStage",
      "backendState",
    ])
      assert.equal(c[k], o[k]);
  }
}
let accepted = false;
const ap = prefix + ".user-acceptance.dev.json";
if (fs.existsSync(ap)) {
  const a = read(ap);
  assert.equal(a.kind, "explicit_user_final_binding_66_acceptance");
  assert.equal(a.proposalRevision, proposalRevision);
  assert.equal(a.runtimeImage, p.runtimeImage);
  assert.equal(a.uiImage, p.uiImage);
  assert.equal(a.releaseSetHash, p.releaseSetHash);
  assert.equal(a.source.channel, "user");
  assert.equal(a.source.respondingToProposalRevision, proposalRevision);
  assert.equal(a.actor.type, "conversation_user");
  assert.equal(a.actor.namedAccountImpersonated, false);
  assert(
    !a.activationAuthorized &&
      !a.compatibilityRetirementAuthorized &&
      !a.grantsChanged,
  );
  assert.equal(a.decisions.length, 66);
  assert.equal(new Set(a.decisions.map((d) => d.id)).size, 66);
  for (const r of p.rows) {
    const d = a.decisions.find((d) => d.id === r.id);
    assert(
      d && d.decision === "accept" && d.disposition === r.proposedDisposition,
    );
  }
  accepted = true;
}
const report = {
  createdAt: new Date().toISOString(),
  proposalRevision,
  runtimeImage: p.runtimeImage,
  uiImage: p.uiImage,
  releaseSetHash: p.releaseSetHash,
  total: 66,
  accepted: accepted ? 66 : 0,
  pending: accepted ? 0 : 66,
  evidenceValidated: true,
  originalAcceptancePreserved: true,
  activationAuthorized: false,
  compatibilityRetirementAuthorized: false,
  grantsChanged: false,
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-final-binding-66-" +
    (accepted ? "accepted" : "pending") +
    "-20260912.dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log(report);
