import { describe, expect, it } from "vitest";
import {
  evaluateAnthropicPromotion,
  type AnthropicPromotionObservation,
} from "../evals/anthropic-promotion-gates.js";

function observation(
  overrides: Partial<AnthropicPromotionObservation> = {},
): AnthropicPromotionObservation {
  return {
    requestedPublicModelId: "atlas-fast",
    configuredUpstreamModelId: "claude-haiku-4-5-20251001",
    actualUpstreamModelId: "claude-haiku-4-5-20251001",
    outcome: "completed",
    httpStatus: 200,
    firstTokenMs: 700,
    providerUsage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
    callLedgerUsage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
    runLedgerUsage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
    retryCountAfterFirstVisibleDelta: 0,
    telemetryContentViolationCount: 0,
    ...overrides,
  };
}

describe("Anthropic production promotion gates", () => {
  it("passes a fully reconciled exact-model pilot and keeps latency advisory", () => {
    const report = evaluateAnthropicPromotion({
      observations: Array.from({ length: 200 }, () => observation()),
      approvalsComplete: true,
      providerConformancePassed: true,
      cancellationTestPassed: true,
      truncatedStreamTestPassed: true,
      credentialRotationTestPassed: true,
    });

    expect(report.promotionReady).toBe(true);
    expect(report.metrics).toMatchObject({
      attempted: 200,
      completedStreamPct: 100,
      exactModelIdentityPct: 100,
      provider429Or5xxPct: 0,
      usageReconciliationDifferencePct: 0,
      p95FirstTokenMs: 700,
    });
    expect(report.gates.find((gate) =>
      gate.id === "p95_first_token_objective"
    )?.hardGate).toBe(false);
  });

  it.each([
    {
      name: "configured model is not the public-mode lock",
      override: {
        configuredUpstreamModelId: "claude-other-model",
        actualUpstreamModelId: "claude-other-model",
      },
      gate: "exact_model_identity",
    },
    {
      name: "actual model mismatch",
      override: { actualUpstreamModelId: "unexpected-model" },
      gate: "exact_model_identity",
    },
    {
      name: "post-delta retry",
      override: { retryCountAfterFirstVisibleDelta: 1 },
      gate: "retry_after_visible_delta",
    },
    {
      name: "telemetry content",
      override: { telemetryContentViolationCount: 1 },
      gate: "telemetry_content_violations",
    },
    {
      name: "ledger drift",
      override: {
        callLedgerUsage: {
          inputTokens: 105,
          outputTokens: 50,
          costUsd: 0.001,
        },
      },
      gate: "usage_cost_reconciliation",
    },
    {
      name: "run ledger drift",
      override: {
        runLedgerUsage: {
          inputTokens: 100,
          outputTokens: 55,
          costUsd: 0.001,
        },
      },
      gate: "usage_cost_reconciliation",
    },
  ])("fails closed for $name", ({ override, gate }) => {
    const report = evaluateAnthropicPromotion({
      observations: [observation(
        override as Partial<AnthropicPromotionObservation>,
      )],
      approvalsComplete: true,
      providerConformancePassed: true,
      cancellationTestPassed: true,
      truncatedStreamTestPassed: true,
      credentialRotationTestPassed: true,
    });

    expect(report.promotionReady).toBe(false);
    expect(report.gates.find((item) => item.id === gate)?.passed).toBe(false);
  });

  it("cannot promote without complete approval and conformance evidence", () => {
    const report = evaluateAnthropicPromotion({
      observations: [observation()],
      approvalsComplete: false,
      providerConformancePassed: false,
      cancellationTestPassed: true,
      truncatedStreamTestPassed: true,
      credentialRotationTestPassed: true,
    });

    expect(report.promotionReady).toBe(false);
    expect(report.gates.filter((gate) => !gate.passed).map((gate) => gate.id))
      .toEqual(expect.arrayContaining([
        "approvals_complete",
        "provider_conformance",
      ]));
  });
});
