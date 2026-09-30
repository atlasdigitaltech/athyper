import { createHash } from "node:crypto";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Explicit evidence replacement is not retrospective proof or release activation. */
export function assessSuccessorDifferenceReview({
  proposal,
  acceptance,
  readEvidence,
}) {
  const { proposalRevision, ...body } = proposal;
  const errors = [];
  if (digest(JSON.stringify(body)) !== proposalRevision)
    errors.push("proposal_revision_changed");
  if (
    proposal.schemaVersion !== 1 ||
    proposal.kind !== "bp_release_19_policy_difference_review_proposal" ||
    proposal.grantsChanged !== false ||
    proposal.activationAuthorized !== false ||
    proposal.fullExactReleaseQualification !== false
  )
    errors.push("invalid_proposal_boundary");
  const rows = [...proposal.rows, ...proposal.currentDifferenceProposals];
  const ids = rows.map((r) => r.id);
  if (!rows.length || new Set(ids).size !== ids.length)
    errors.push("duplicate_or_empty_rows");
  const evidence = [
    proposal.historicalLedger,
    ...proposal.sources,
    proposal.signedVerification,
    ...proposal.rows.flatMap((r) => r.regressions),
  ];
  const loaded = new Map();
  for (const e of evidence) {
    try {
      const bytes = readEvidence(e.path);
      if (digest(bytes) !== e.sha256) errors.push("evidence_changed:" + e.path);
      loaded.set(e.path, bytes);
    } catch {
      errors.push("evidence_missing:" + e.path);
    }
  }
  try {
    const history = JSON.parse(loaded.get(proposal.historicalLedger.path));
    if (
      !equal(
        history.dispositions.map((r) => r.id).sort(),
        proposal.rows.map((r) => r.id).sort(),
      )
    )
      errors.push("historical_coverage_changed");
    const signed = JSON.parse(loaded.get(proposal.signedVerification.path));
    if (
      signed.releaseId !== proposal.releaseId ||
      signed.artifactHash !== proposal.artifactHash ||
      !signed.verification.signatureVerified ||
      !signed.verification.runtimeCompatible
    )
      errors.push("signed_release_mismatch");
    for (const source of proposal.sources) {
      const live = JSON.parse(loaded.get(source.path));
      if (
        !live.diagnosticComplete ||
        live.grantChanges.length ||
        live.mode !== "shadow" ||
        live.effectiveAuthority !== "legacy"
      )
        errors.push("invalid_live_evidence");
    }
  } catch {
    errors.push("invalid_evidence_document");
  }
  const acceptanceValid =
    acceptance?.schemaVersion === 1 &&
    acceptance.kind === "explicit_user_policy_difference_acceptance" &&
    acceptance.proposalRevision === proposalRevision &&
    acceptance.releaseId === proposal.releaseId &&
    acceptance.artifactHash === proposal.artifactHash &&
    acceptance.actor?.type === "conversation_user" &&
    acceptance.actor.namedAccountImpersonated === false &&
    acceptance.source?.channel === "user" &&
    (acceptance.source.exactMessage === "accepted" ||
      (acceptance.source.exactMessage === "go ahead" &&
        acceptance.source.respondingTo ===
          "Do you approve these three proposals?" &&
        Array.isArray(acceptance.source.approvedProposalRevisions) &&
        acceptance.source.approvedProposalRevisions.includes(
          proposalRevision,
        ))) &&
    typeof acceptance.reference === "string" &&
    acceptance.reference.length > 0 &&
    Number.isFinite(Date.parse(acceptance.acceptedAt)) &&
    acceptance.grantsChanged === false &&
    acceptance.activationAuthorized === false &&
    acceptance.executionParityApproved === false;
  if (!acceptanceValid) errors.push("acceptance_missing_or_revision_changed");
  const decisions = acceptance?.decisions ?? [];
  if (
    new Set(decisions.map((d) => d.id)).size !== decisions.length ||
    !equal([...ids].sort(), decisions.map((d) => d.id).sort())
  )
    errors.push("acceptance_coverage_changed");
  const assessed = rows.map((row) => {
    const decision = decisions.find((d) => d.id === row.id);
    const resolved =
      errors.length === 0 &&
      decision?.decision === "accept" &&
      decision.disposition === row.proposedDisposition;
    return {
      id: row.id,
      disposition: row.proposedDisposition,
      resolved,
      executionParity: false,
      historicalCauseProven:
        row.proposedDisposition ===
        "supersede_noncausal_historical_aggregate_with_traced_evidence"
          ? false
          : undefined,
    };
  });
  const unresolved = assessed.filter((r) => !r.resolved).length;
  return {
    schemaVersion: 1,
    kind: "accepted_successor_policy_difference_review",
    proposalRevision,
    releaseId: proposal.releaseId,
    artifactHash: proposal.artifactHash,
    scope:
      "Release-19 shadow discovery/read differences and explicit historical evidence replacement",
    historicalRows: proposal.rows.length,
    currentDifferenceGroups: proposal.currentDifferenceProposals.length,
    unresolvedReviewedDispositions: unresolved,
    reviewedDispositionGateSatisfied: errors.length === 0 && unresolved === 0,
    errors: [...new Set(errors)],
    decisions: assessed,
    acceptanceReference: acceptance?.reference ?? null,
    historicalCausesRetrospectivelyProven: false,
    fullExactReleaseQualification: false,
    activationEligible: false,
    grantsChanged: false,
    activationAuthorized: false,
  };
}
