export type AuthorizationCutoverTransition =
  | "start_shadow"
  | "enforce_reads"
  | "switch_writer"
  | "complete_observation";

export type AuthorizationRollbackProjectionStatus =
  | "none"
  | "reviewed"
  | "tested"
  | "active";

export interface AuthorizationCutoverGateInput {
  readonly transition: AuthorizationCutoverTransition;
  readonly sourceWatermark: bigint;
  readonly appliedWatermark: bigint;
  readonly maximumAllowedLag: bigint;
  readonly partialSourceTransactions: number;
  readonly unreconciledConservationRows: number;
  readonly unexplainedHighRiskMismatches: number;
  readonly unownedMismatches: number;
  readonly approvedActiveUserParity: boolean;
  readonly legacyWriterSole: boolean;
  readonly authorizationWriteFreezeActive: boolean;
  readonly cacheInvalidationVerifiedUnderLoad: boolean;
  readonly decisionEvidenceVerifiedUnderLoad: boolean;
  readonly instantRollbackPromised: boolean;
  readonly rollbackProjectionStatus: AuthorizationRollbackProjectionStatus;
  readonly observationWindowComplete: boolean;
}

export interface AuthorizationCutoverGateResult {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
  readonly lag: bigint;
}

/**
 * Pure Wave 7 transition gate mirrored by the plane-local database function.
 * A resolver transition cannot authorize a writer transition.
 */
export function evaluateAuthorizationCutoverGate(
  input: AuthorizationCutoverGateInput,
): AuthorizationCutoverGateResult {
  const reasons: string[] = [];
  const lag = input.sourceWatermark - input.appliedWatermark;
  if (lag < 0n) reasons.push("applied_watermark_ahead_of_source");
  if (lag > input.maximumAllowedLag) reasons.push("projection_lag_above_threshold");
  if (input.partialSourceTransactions !== 0) {
    reasons.push("partial_source_transaction");
  }
  if (input.unreconciledConservationRows !== 0) {
    reasons.push("conservation_reconciliation_incomplete");
  }
  if (!input.legacyWriterSole && input.transition !== "complete_observation") {
    reasons.push("legacy_writer_not_sole");
  }

  if (input.transition !== "start_shadow") {
    if (input.unexplainedHighRiskMismatches !== 0) {
      reasons.push("unexplained_high_risk_mismatch");
    }
    if (input.unownedMismatches !== 0) reasons.push("unowned_mismatch");
    if (!input.approvedActiveUserParity) {
      reasons.push("approved_active_user_parity_incomplete");
    }
    if (!input.cacheInvalidationVerifiedUnderLoad) {
      reasons.push("cache_invalidation_load_evidence_missing");
    }
    if (!input.decisionEvidenceVerifiedUnderLoad) {
      reasons.push("decision_evidence_load_evidence_missing");
    }
  }

  if (input.transition === "switch_writer") {
    if (!input.authorizationWriteFreezeActive) {
      reasons.push("authorization_write_freeze_not_active");
    }
    if (lag !== 0n) reasons.push("writer_switch_requires_zero_lag");
    if (
      input.instantRollbackPromised
      && !["tested", "active"].includes(input.rollbackProjectionStatus)
    ) {
      reasons.push("rollback_projection_not_tested");
    }
  }

  if (
    input.transition === "complete_observation"
    && !input.observationWindowComplete
  ) {
    reasons.push("observation_window_incomplete");
  }

  return Object.freeze({
    allowed: reasons.length === 0,
    reasons: Object.freeze(reasons),
    lag,
  });
}
