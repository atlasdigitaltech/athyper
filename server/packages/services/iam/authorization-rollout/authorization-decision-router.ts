import type {
  AuthorizationRolloutSelection,
} from "./authorization-rollout.types.js";

export interface AuthorizationDecisionEvaluators<TDecision> {
  readonly evaluateLegacy: () => Promise<TDecision>;
  readonly evaluateV2: () => Promise<TDecision>;
}

export type AuthorizationShadowComparisonStatus =
  | "match"
  | "mismatch"
  | "v2_error";

export interface AuthorizationShadowComparison<TDecision> {
  readonly selection: AuthorizationRolloutSelection;
  readonly status: AuthorizationShadowComparisonStatus;
  readonly legacyDecision: TDecision;
  readonly v2Decision?: TDecision;
  readonly v2Error?: unknown;
}

export interface AuthorizationDecisionRouterDeps<TDecision> {
  readonly areEquivalent: (
    legacyDecision: TDecision,
    v2Decision: TDecision,
  ) => boolean;
  readonly onShadowComparison?: (
    comparison: AuthorizationShadowComparison<TDecision>,
  ) => void | Promise<void>;
}

/**
 * Chooses exactly one authoritative decision. It never unions permissions,
 * scopes, evidence, or allow results from the legacy and v2 evaluators.
 */
export class AuthorizationDecisionRouter<TDecision> {
  private readonly areEquivalent:
    AuthorizationDecisionRouterDeps<TDecision>["areEquivalent"];
  private readonly onShadowComparison:
    AuthorizationDecisionRouterDeps<TDecision>["onShadowComparison"];

  constructor(deps: AuthorizationDecisionRouterDeps<TDecision>) {
    this.areEquivalent = deps.areEquivalent;
    this.onShadowComparison = deps.onShadowComparison;
  }

  async decide(
    selection: AuthorizationRolloutSelection,
    evaluators: AuthorizationDecisionEvaluators<TDecision>,
  ): Promise<TDecision> {
    switch (selection.mode) {
      case "legacy":
        return evaluators.evaluateLegacy();

      case "shadow":
        return this.decideInShadow(selection, evaluators);

      case "enforce":
        try {
          return await evaluators.evaluateV2();
        } catch (error) {
          throw new AuthorizationV2EnforcementError(selection, error);
        }

      default:
        // Defensive runtime fallback for untyped callers/configuration. The
        // policy parser cannot produce this state.
        return evaluators.evaluateLegacy();
    }
  }

  private async decideInShadow(
    selection: AuthorizationRolloutSelection,
    evaluators: AuthorizationDecisionEvaluators<TDecision>,
  ): Promise<TDecision> {
    const [legacyResult, v2Result] = await Promise.allSettled([
      evaluators.evaluateLegacy(),
      evaluators.evaluateV2(),
    ]);

    if (legacyResult.status === "rejected") {
      throw legacyResult.reason;
    }

    if (v2Result.status === "rejected") {
      await this.emitComparison({
        selection,
        status: "v2_error",
        legacyDecision: legacyResult.value,
        v2Error: v2Result.reason,
      });
      return legacyResult.value;
    }

    await this.emitComparison({
      selection,
      status: this.areEquivalent(legacyResult.value, v2Result.value)
        ? "match"
        : "mismatch",
      legacyDecision: legacyResult.value,
      v2Decision: v2Result.value,
    });
    return legacyResult.value;
  }

  private async emitComparison(
    comparison: AuthorizationShadowComparison<TDecision>,
  ): Promise<void> {
    try {
      await this.onShadowComparison?.(comparison);
    } catch {
      // Shadow telemetry must never change the authoritative legacy decision.
      // Runtime integration should separately meter/report sink failures.
    }
  }
}

export class AuthorizationV2EnforcementError extends Error {
  readonly code = "AUTHORIZATION_V2_EVALUATION_FAILED";
  readonly selection: AuthorizationRolloutSelection;
  readonly originalError: unknown;

  constructor(
    selection: AuthorizationRolloutSelection,
    originalError: unknown,
  ) {
    super(
      `Authorization v2 evaluation failed for ${selection.planeKey} `
      + `${selection.permissionCode}; legacy fallback is disabled in enforce mode.`,
    );
    this.name = "AuthorizationV2EnforcementError";
    this.selection = selection;
    this.originalError = originalError;
  }
}
