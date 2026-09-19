/** Evidence assessment only. A passing assessment never supplies enforcement approval. */
export function assessExactReleaseExecution(input) {
  const blockers = [];
  const block = (code, detail) => blockers.push({ code, detail });
  if (!input.releaseId || !/^[a-f0-9]{64}$/.test(input.artifactHash ?? ""))
    block("INVALID_RELEASE", "Exact signed release identity is required.");
  for (const mode of ["api", "worker"]) {
    const runtime = input.runtimes?.[mode];
    if (!runtime || !runtime.image || runtime.health !== "healthy")
      block("RUNTIME_UNAVAILABLE", mode);
    const v = runtime?.verification;
    if (
      v?.releaseId !== input.releaseId ||
      v?.artifactHash !== input.artifactHash ||
      v?.verification?.signatureVerified !== true ||
      v?.verification?.manifestValid !== true ||
      v?.verification?.runtimeCompatible !== true
    )
      block("SIGNED_RUNTIME_UNVERIFIED", mode);
    if (runtime?.targetAdapterWired !== true)
      block("TARGET_ADAPTER_NOT_WIRED", mode);
  }
  const coverage = [
    "reads",
    "commands_import",
    "export_ai_revocation",
    "company_owned",
    "independent_child",
  ];
  for (const key of coverage) {
    const e = input.journeys?.[key];
    if (
      !e ||
      e.qualified !== true ||
      e.authenticated !== true ||
      e.targetExecution !== true ||
      e.releaseId !== input.releaseId ||
      e.artifactHash !== input.artifactHash
    ) {
      block("EXACT_JOURNEY_MISSING", key);
      continue;
    }
    if (
      e.authorityFingerprint !== input.authorityFingerprint ||
      !input.authorityFingerprint
    )
      block("JOURNEY_AUTHORITY_MISMATCH", key);
    if (
      !Array.isArray(e.executionImages) ||
      ["api", "worker"].some(
        (mode) =>
          !input.runtimes?.[mode]?.image ||
          !e.executionImages.includes(input.runtimes[mode].image),
      )
    )
      block("JOURNEY_RUNTIME_MISMATCH", key);
  }
  if (
    input.differences?.reviewedDispositionGateSatisfied !== true ||
    input.differences?.unresolvedReviewedDispositions !== 0
  )
    block(
      "POLICY_DISPOSITIONS_UNRESOLVED",
      "Current evidence revision must pass.",
    );
  if (input.rollbackQualified !== true)
    block(
      "RELEASE_ROLLBACK_UNQUALIFIED",
      "Grant rollback rehearsal alone does not qualify release rollback.",
    );
  return {
    schemaVersion: 1,
    releaseId: input.releaseId,
    artifactHash: input.artifactHash,
    executionQualified: blockers.length === 0,
    blockers,
    enforcementApprovalRecorded: false,
    activationAuthorized: false,
  };
}
