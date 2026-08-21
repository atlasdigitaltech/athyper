export interface AnthropicPromotionObservation {
  requestedPublicModelId:
    | "atlas-fast"
    | "atlas-balanced"
    | "atlas-best";
  configuredUpstreamModelId: string;
  actualUpstreamModelId: string | null;
  outcome: "completed" | "failed" | "cancelled" | "incomplete";
  httpStatus: number | null;
  firstTokenMs: number | null;
  providerUsage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | null;
  callLedgerUsage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | null;
  runLedgerUsage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | null;
  retryCountAfterFirstVisibleDelta: number;
  telemetryContentViolationCount: number;
}

export interface AnthropicPromotionEvidence {
  observations: readonly AnthropicPromotionObservation[];
  cancellationTestPassed: boolean;
  truncatedStreamTestPassed: boolean;
  credentialRotationTestPassed: boolean;
  providerConformancePassed: boolean;
  approvalsComplete: boolean;
}

export interface AnthropicPromotionGate {
  id: string;
  passed: boolean;
  hardGate: boolean;
  observed: number | boolean | null;
  target: number | boolean | string;
}

export interface AnthropicPromotionReport {
  metrics: {
    attempted: number;
    completedStreamPct: number;
    exactModelIdentityPct: number;
    provider429Or5xxPct: number;
    usageReconciliationDifferencePct: number | null;
    p95FirstTokenMs: number | null;
    postDeltaRetryCount: number;
    telemetryContentViolationCount: number;
  };
  gates: readonly AnthropicPromotionGate[];
  promotionReady: boolean;
}

const COMPLETION_TARGET_PCT = 99.5;
const MODEL_IDENTITY_TARGET_PCT = 100;
const PROVIDER_ERROR_MAX_PCT = 1;
const RECONCILIATION_MAX_PCT = 1;
const INITIAL_P95_FIRST_TOKEN_OBJECTIVE_MS = 1_500;
const EXPECTED_UPSTREAM_MODEL_BY_PUBLIC_MODE = {
  "atlas-fast": "claude-haiku-4-5-20251001",
  "atlas-balanced": "claude-sonnet-4-6",
  "atlas-best": "claude-opus-4-8",
} as const;

export function evaluateAnthropicPromotion(
  evidence: AnthropicPromotionEvidence,
): AnthropicPromotionReport {
  const attempted = evidence.observations.length;
  const completed = evidence.observations.filter(
    (item) => item.outcome === "completed",
  ).length;
  const exactIdentity = evidence.observations.filter(
    (item) =>
      item.configuredUpstreamModelId
        === EXPECTED_UPSTREAM_MODEL_BY_PUBLIC_MODE[item.requestedPublicModelId]
      &&
      item.actualUpstreamModelId !== null
      && item.actualUpstreamModelId === item.configuredUpstreamModelId,
  ).length;
  const providerErrors = evidence.observations.filter(
    (item) =>
      item.httpStatus === 429
      || (item.httpStatus !== null && item.httpStatus >= 500),
  ).length;
  const completedStreamPct = percentage(completed, attempted);
  const exactModelIdentityPct = percentage(exactIdentity, attempted);
  const provider429Or5xxPct = percentage(providerErrors, attempted);
  const usageReconciliationDifferencePct = aggregateReconciliationDifference(
    evidence.observations,
  );
  const p95FirstTokenMs = percentile95(
    evidence.observations.flatMap((item) =>
      item.firstTokenMs === null ? [] : [item.firstTokenMs]
    ),
  );
  const postDeltaRetryCount = sum(
    evidence.observations.map((item) => item.retryCountAfterFirstVisibleDelta),
  );
  const telemetryContentViolationCount = sum(
    evidence.observations.map((item) => item.telemetryContentViolationCount),
  );

  const gates: AnthropicPromotionGate[] = [
    gate("approvals_complete", evidence.approvalsComplete, true, true),
    gate(
      "provider_conformance",
      evidence.providerConformancePassed,
      true,
      true,
    ),
    numericGate(
      "exact_model_identity",
      exactModelIdentityPct,
      MODEL_IDENTITY_TARGET_PCT,
      (value) => value === MODEL_IDENTITY_TARGET_PCT,
    ),
    numericGate(
      "successful_completed_streams",
      completedStreamPct,
      COMPLETION_TARGET_PCT,
      (value) => value >= COMPLETION_TARGET_PCT,
    ),
    numericGate(
      "provider_429_or_5xx",
      provider429Or5xxPct,
      PROVIDER_ERROR_MAX_PCT,
      (value) => value < PROVIDER_ERROR_MAX_PCT,
    ),
    {
      id: "usage_cost_reconciliation",
      passed:
        usageReconciliationDifferencePct !== null
        && usageReconciliationDifferencePct <= RECONCILIATION_MAX_PCT,
      hardGate: true,
      observed: usageReconciliationDifferencePct,
      target: `<=${RECONCILIATION_MAX_PCT}%`,
    },
    numericGate(
      "telemetry_content_violations",
      telemetryContentViolationCount,
      0,
      (value) => value === 0,
    ),
    numericGate(
      "retry_after_visible_delta",
      postDeltaRetryCount,
      0,
      (value) => value === 0,
    ),
    gate(
      "cancellation",
      evidence.cancellationTestPassed,
      true,
      true,
    ),
    gate(
      "truncated_stream",
      evidence.truncatedStreamTestPassed,
      true,
      true,
    ),
    gate(
      "credential_rotation",
      evidence.credentialRotationTestPassed,
      true,
      true,
    ),
    {
      id: "p95_first_token_objective",
      passed:
        p95FirstTokenMs !== null
        && p95FirstTokenMs < INITIAL_P95_FIRST_TOKEN_OBJECTIVE_MS,
      hardGate: false,
      observed: p95FirstTokenMs,
      target: `<${INITIAL_P95_FIRST_TOKEN_OBJECTIVE_MS}ms objective`,
    },
  ];

  return {
    metrics: {
      attempted,
      completedStreamPct,
      exactModelIdentityPct,
      provider429Or5xxPct,
      usageReconciliationDifferencePct,
      p95FirstTokenMs,
      postDeltaRetryCount,
      telemetryContentViolationCount,
    },
    gates,
    promotionReady: gates.every((item) => !item.hardGate || item.passed),
  };
}

function aggregateReconciliationDifference(
  observations: readonly AnthropicPromotionObservation[],
): number | null {
  const comparable = observations.filter(
    (item) =>
      item.providerUsage !== null
      && item.callLedgerUsage !== null
      && item.runLedgerUsage !== null,
  );
  if (comparable.length !== observations.length || comparable.length === 0) {
    return null;
  }
  const providerInput = sum(
    comparable.map((item) => item.providerUsage!.inputTokens),
  );
  const callLedgerInput = sum(
    comparable.map((item) => item.callLedgerUsage!.inputTokens),
  );
  const runLedgerInput = sum(
    comparable.map((item) => item.runLedgerUsage!.inputTokens),
  );
  const providerOutput = sum(
    comparable.map((item) => item.providerUsage!.outputTokens),
  );
  const callLedgerOutput = sum(
    comparable.map((item) => item.callLedgerUsage!.outputTokens),
  );
  const runLedgerOutput = sum(
    comparable.map((item) => item.runLedgerUsage!.outputTokens),
  );
  const providerCost = sum(comparable.map((item) => item.providerUsage!.costUsd));
  const callLedgerCost = sum(
    comparable.map((item) => item.callLedgerUsage!.costUsd),
  );
  const runLedgerCost = sum(
    comparable.map((item) => item.runLedgerUsage!.costUsd),
  );
  return Math.max(
    differencePct(providerInput, callLedgerInput),
    differencePct(providerInput, runLedgerInput),
    differencePct(providerOutput, callLedgerOutput),
    differencePct(providerOutput, runLedgerOutput),
    differencePct(providerCost, callLedgerCost),
    differencePct(providerCost, runLedgerCost),
  );
}

function differencePct(expected: number, observed: number): number {
  if (expected === 0) return observed === 0 ? 0 : 100;
  return Math.abs(observed - expected) / expected * 100;
}

function percentile95(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null;
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator * 100;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function gate(
  id: string,
  observed: boolean,
  target: boolean,
  hardGate: boolean,
): AnthropicPromotionGate {
  return { id, passed: observed === target, hardGate, observed, target };
}

function numericGate(
  id: string,
  observed: number,
  target: number,
  predicate: (value: number) => boolean,
): AnthropicPromotionGate {
  return {
    id,
    passed: predicate(observed),
    hardGate: true,
    observed,
    target,
  };
}
