import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const read = (p) => JSON.parse(fs.readFileSync(p)),
  sha = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const oldPrefix =
    "governance/policy/reviews/business-partner-final-66-dispositions-20260912",
  old = read(oldPrefix + ".proposal.dev.json"),
  accepted = read(oldPrefix + ".user-acceptance.dev.json");
assert.equal(old.proposalRevision, accepted.proposalRevision);
assert.equal(accepted.decisions.length, 66);
assert(accepted.decisions.every((d) => d.decision === "accept"));
const execution = read(
    "governance/policy/reviews/business-partner-final-closure-execution-20260912.proposal.dev.json",
  ),
  comparisonPath =
    "governance/policy/reports/business-partner-affordance-count-66-comparison-20260912-r5.dev.json",
  comparison = read(comparisonPath);
assert.equal(comparison.runtimeImage, execution.runtimeImage);
assert.equal(comparison.releaseSetHash, execution.releaseSetHash);
const qualificationPaths = [
  "business-partner-affordance-open-work-live-qualified-20260912-r5.dev.json",
  "business-partner-closure-owner-tax-ui-20260912-r5.dev.json",
  "business-partner-affordance-count-revocation-20260912-r5.dev.json",
  "business-partner-affordance-count-cleanup-20260912-r5.dev.json",
  "business-partner-affordance-count-final-access-20260912-r5.dev.json",
  "business-partner-affordance-count-audit-20260912-r5.dev.json",
  "business-partner-affordance-count-browser-scoped-diagnostic-20260912-r4.dev.json",
  "business-partner-affordance-count-browser-bank-completion-20260912-r4.dev.json",
  "business-partner-affordance-count-compatible-recovery-20260912-r4.dev.json",
].map((p) => "governance/policy/reports/" + p);
const qualifications = qualificationPaths.map((path) => ({
  path,
  sha256: sha(path),
  data: read(path),
}));
assert(qualifications[0].data.complete && qualifications[1].data.complete);
assert(
  qualifications[2].data.stagedPassed &&
    qualifications[2].data.postRevocationPassed &&
    qualifications[2].data.revoked,
);
assert.equal(qualifications[3].data.activeTemporaryAssignments, 0);
assert(
  qualifications[5].data.passed &&
    qualifications[7].data.complete &&
    qualifications[8].data.passed,
);
for (const q of qualifications.filter((q) => q.data.runtimeImage)) {
  assert.equal(q.data.runtimeImage, execution.runtimeImage);
  assert.equal(q.data.releaseSetHash, execution.releaseSetHash);
}
const sources = comparison.sources.map((s) => ({ ...s, data: read(s.path) }));
for (const s of sources) {
  assert.equal(sha(s.path), s.sha256);
  assert(s.data.diagnosticComplete && s.data.authorityUnchanged);
  assert.equal(s.data.runtimeImage, execution.runtimeImage);
  assert.equal(s.data.releaseSetHash, execution.releaseSetHash);
}
const explanations = {
  requests_read:
    "The isolated canonical Requests provider admits the parent read even when the legacy case-derived source permission is denied. Independently owned case rows, active/returned counts and activity require case-read authorization; populated omission and live revocation are qualified. This accepts provider admission only, not access to unauthorized children.",
  supplier_company_read:
    "The current execution grants customer-company read only. Both actors retain legacy source admission but lack the explicit supplier-company target permission, so target/backend deny at the permission stage. This is an intentional grant-matrix difference, not supplier-company read authorization.",
};
const rows = comparison.rows.map((r) => {
  const prior = old.rows.find((x) => x.id === r.id);
  assert(prior);
  const surfaceEvidence = r.candidateObservations.length
    ? []
    : sources.map((s) => {
        const route = s.data.checks.find((c) =>
          c.path.endsWith(
            "form-descriptor?mode=" +
              (r.operation === "create" ? "create" : "edit"),
          ),
        );
        assert(
          route && route.status === 409 && r.deferredInUnchangedSignedProfile,
        );
        return { actor: s.data.actor, source: s.path, ...route };
      });
  return {
    id: r.id,
    operation: r.operation,
    origin: prior.origin,
    proposedDisposition: r.acceptedDisposition,
    historicalExplanation: prior.historicalExplanation,
    ...(prior.historicalCauseProven === undefined
      ? {}
      : { historicalCauseProven: prior.historicalCauseProven }),
    deferredInSignedProfile: r.deferredInUnchangedSignedProfile,
    observations: r.candidateObservations,
    newStates: r.newStates,
    surfaceEvidence,
    currentExplanation: r.newStates.length
      ? explanations[r.operation]
      : "No new actor-specific decision state relative to the accepted baseline, or operation remains deferred with current form409 evidence.",
    executionParityClaimed: false,
    status: "pending_explicit_final_binding_acceptance",
  };
});
assert.equal(rows.length, 66);
assert.equal(new Set(rows.map((r) => r.id)).size, 66);
const p = {
  schemaVersion: 1,
  kind: "bp_final_binding_66_disposition_refresh",
  createdAt: new Date().toISOString(),
  releaseId: execution.releaseId,
  artifactHash: execution.artifactHash,
  runtimeImage: execution.runtimeImage,
  uiImage: execution.uiImage,
  releaseSetHash: execution.releaseSetHash,
  originalAcceptedProposalRevision: old.proposalRevision,
  originalAcceptancePreserved: true,
  baseline: [
    oldPrefix + ".proposal.dev.json",
    oldPrefix + ".user-acceptance.dev.json",
  ].map((path) => ({ path, sha256: sha(path) })),
  comparison: { path: comparisonPath, sha256: sha(comparisonPath) },
  sources: sources.map(({ data, ...s }) => s),
  qualification: qualifications.map(({ data, ...q }) => q),
  comparisonCount: sources.reduce((n, s) => n + s.data.comparisons.length, 0),
  rowsWithNewStates: comparison.rowsWithNewStates,
  rows,
  executionParityApproved: false,
  historicalPerEventCausalityReconstructed: false,
  activationAuthorized: false,
  compatibilityRetirementAuthorized: false,
  grantChanges: [],
  separateQualification: [
    "Mesh excluded",
    "Full Atlas conversations, global/legal-entity ownership and cross-instance revocation synchronization not qualified here",
    "Earlier Finance/company/dependency journeys retain their original evidence bindings; not rerun by this closure",
  ],
  acceptance: { required: true, pending: 66, accepted: 0 },
};
p.proposalRevision = createHash("sha256")
  .update(JSON.stringify(p))
  .digest("hex");
const prefix =
  "governance/policy/reviews/business-partner-final-binding-66-dispositions-20260912";
fs.writeFileSync(
  prefix + ".proposal.dev.json",
  JSON.stringify(p, null, 2) + "\n",
  { flag: "wx" },
);
const doc =
  "# Final binding: 66 policy dispositions\n\nRevision **" +
  p.proposalRevision +
  "**. Prepared for explicit acceptance; the original 66 acceptance remains intact. This refresh binds the same 66 disposition choices to backend `" +
  p.runtimeImage +
  "`, UI `" +
  p.uiImage +
  "` and release set `" +
  p.releaseSetHash +
  "`.\n\n592 sequential, actor-attributed comparisons cover 60 rows. Six create/update rows remain deferred in the unchanged signed profile; both actors receive HTTP 409 from their current form descriptors. No create/update execution parity is claimed. Historical aggregate causes remain unproven where the original review said so.\n\nFour rows have new states, representing two operations:\n\n- **requests_read:** " +
  explanations.requests_read +
  "\n- **supplier_company_read:** " +
  explanations.supplier_company_read +
  "\n\nThe corrected release passes populated API masking/count checks, bank/tax browser reveals, tax close clearing, owner bank/tax no-reveal UI checks, bank expiry/live reveal revocation, and staged case/summary revocation while the parent remains readable. API/command/scoped Atlas denial, compatible recovery and cleanup are evidenced on this same image/binding. No product defects are proposed as intentional differences. All temporary access is revoked.\n\nAcceptance covers the disposition explanations and observed states below. It does not authorize grants, enforcement activation, compatibility retirement or Mesh. Earlier Finance/company/dependency journeys retain their original evidence bindings; this closure did not rerun them.\n\n[Exact proposal](../../" +
  prefix +
  ".proposal.dev.json) · [Actor-specific comparison assessment](../../" +
  comparisonPath +
  ")\n\n| Disposition ID | Operation | Proposed disposition | Final evidence |\n| --- | --- | --- | --- |\n" +
  rows
    .map(
      (r) =>
        "| `" +
        r.id +
        "` | `" +
        r.operation +
        "` | `" +
        r.proposedDisposition +
        "` | " +
        (r.observations.length
          ? r.observations.length +
            " observations" +
            (r.newStates.length
              ? "; new states explicitly described above"
              : "")
          : "Deferred; two actor form409 checks") +
        " |",
    )
    .join("\n") +
  "\n";
fs.writeFileSync(
  "docs/reviews/business-partner-final-binding-66-dispositions-20260912.md",
  doc,
  { flag: "wx" },
);
console.log({
  proposalRevision: p.proposalRevision,
  total: 66,
  comparisons: p.comparisonCount,
  pendingAcceptance: 66,
});
