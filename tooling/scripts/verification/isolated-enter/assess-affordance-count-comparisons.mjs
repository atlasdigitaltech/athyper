import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { run } from "./affordance-count-run.mjs";
import { proposal as p } from "./affordance-count-client.mjs";
const read = (path) => JSON.parse(fs.readFileSync(path)),
  hash = (path) =>
    createHash("sha256").update(fs.readFileSync(path)).digest("hex");
const prefix =
    "governance/policy/reviews/business-partner-final-66-dispositions-20260912",
  acceptedProposal = read(prefix + ".proposal.dev.json"),
  acceptance = read(prefix + ".user-acceptance.dev.json");
assert.equal(acceptance.proposalRevision, acceptedProposal.proposalRevision);
assert.equal(acceptedProposal.artifactHash, p.artifactHash);
assert.equal(acceptedProposal.releaseId, p.releaseId);
assert.equal(acceptance.decisions.length, 66);
assert(acceptance.decisions.every((d) => d.decision === "accept"));
const sources = ["admin", "owner"]
  .map(
    (actor) =>
      "governance/policy/reports/business-partner-affordance-count-comparisons-" +
      actor +
      "-" +
      run +
      ".dev.json",
  )
  .map((path) => ({ path, sha256: hash(path), data: read(path) }));
for (const s of sources) {
  assert.equal(s.data.runtimeImage, p.runtimeImage);
  assert.equal(s.data.releaseSetHash, p.releaseSetHash);
  assert(s.data.authorityUnchanged && s.data.diagnosticComplete);
}
const tuple = (o) =>
  JSON.stringify([
    o.actor,
    o.sourceAuthority,
    o.sourceStage,
    o.targetState,
    o.targetStage,
    o.backendState,
  ]);
const rows = acceptedProposal.rows.map((row) => {
  const decision = acceptance.decisions.find((d) => d.id === row.id);
  assert.equal(decision.disposition, row.proposedDisposition);
  const baseline = new Set(row.observations.map(tuple));
  const observations = sources.flatMap((s) =>
    s.data.comparisons
      .filter((c) => c.operationKey === row.operation)
      .map((c) => ({
        actor: s.data.actor,
        source: s.path,
        evaluationRef: c.evaluationRef,
        ...Object.fromEntries(
          [
            "sourceAuthority",
            "sourceStage",
            "targetState",
            "targetStage",
            "backendState",
          ].map((k) => [k, c[k]]),
        ),
      })),
  );
  const newStates = [
    ...new Map(
      observations
        .filter((o) => !baseline.has(tuple(o)))
        .map((o) => [tuple(o), o]),
    ).values(),
  ];
  return {
    id: row.id,
    operation: row.operation,
    acceptedDisposition: decision.disposition,
    acceptanceAppliesToOriginalRevision: true,
    candidateObservations: observations,
    newStates,
    deferredInUnchangedSignedProfile: row.deferredInSignedProfile,
  };
});
const report = {
  createdAt: new Date().toISOString(),
  runtimeImage: p.runtimeImage,
  uiImage: p.uiImage,
  releaseSetHash: p.releaseSetHash,
  artifactHash: p.artifactHash,
  acceptedProposalRevision: acceptedProposal.proposalRevision,
  originalAcceptedCount: 66,
  originalAcceptancePreserved: true,
  newAcceptanceManufactured: false,
  sources: sources.map(({ path, sha256 }) => ({ path, sha256 })),
  rows,
  rowsWithNewStates: rows.filter((r) => r.newStates.length).map((r) => r.id),
  rowsWithoutCandidateObservation: rows
    .filter((r) => !r.candidateObservations.length)
    .map((r) => r.id),
  activationAuthorized: false,
  compatibilityRetirementAuthorized: false,
};
fs.writeFileSync(
  `governance/policy/reports/business-partner-affordance-count-66-comparison-${run}.dev.json`,
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log({
  accepted: 66,
  rowsWithNewStates: report.rowsWithNewStates,
  rowsWithoutCandidateObservation: report.rowsWithoutCandidateObservation,
});
