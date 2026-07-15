import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCUMENT_OPEN_CI_GATE_DEFINITIONS } from "../document-open-rollout-ci-definitions";
import {
  readDocumentOpenRolloutSnapshotFromEnv,
  resolveDocumentOpenRolloutDecisionFromSnapshot,
  resolveNextRolloutStageFromEnv,
  resolveDocumentOpenRolloutStageFromSnapshot,
} from "../document-open-rollout-automation";
import { DOCUMENT_OPEN_PROGRESS_METRIC_NAMES } from "../document-open-rollout-gates";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("document-open-rollout-automation", () => {
  it("resolves snapshot from JSON env", () => {
    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_PROGRESS_SNAPSHOT", JSON.stringify({
      minimumSamples: 10,
      metrics: {
        open_warm_p95_ms: 900,
        first_editable_form_p95_ms: 2200,
      },
    }));

    const snapshot = readDocumentOpenRolloutSnapshotFromEnv();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.minimumSamples).toBe(10);
    expect(snapshot?.metrics).toMatchObject({
      open_warm_p95_ms: 900,
      first_editable_form_p95_ms: 2200,
    });
  });

  it("advances rollout from snapshot when thresholds are healthy", () => {
    const decision = resolveDocumentOpenRolloutStageFromSnapshot("rules_internal", {
      minimumSamples: 1000,
      metrics: {
        [DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.warmOpenP95Ms]: 800,
      },
    });

    expect(decision).not.toBeNull();
    expect(decision?.decision.nextStage).toBe("child_internal");
  });

  it("advances stage from env only while auto mode is enabled", () => {
    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_AUTO", "true");
    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_PROGRESS_SNAPSHOT", JSON.stringify({
      minimumSamples: 1000,
      metrics: { open_warm_p95_ms: 800 },
    }));
    expect(resolveNextRolloutStageFromEnv("rules_internal")).toBe("child_internal");

    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_AUTO", "false");
    expect(resolveNextRolloutStageFromEnv("rules_internal")).toBe(null);
  });

  it("classifies non-breaking signals as hold", () => {
    const decision = resolveDocumentOpenRolloutDecisionFromSnapshot("descriptor_5", {
      minimumSamples: 1_000,
      metrics: {
        open_warm_p95_ms: 1_000,
        open_compatibility_fallback_count: 1,
      },
    });

    expect(decision?.decision.action).toBe("hold");
    expect(decision?.nextStage).toBe("descriptor_5");
  });

  it("rolls back on hard gate breaches in auto mode", () => {
    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_AUTO", "true");
    vi.stubEnv("DOCUMENT_OPEN_ROLLOUT_PROGRESS_SNAPSHOT", JSON.stringify({
      minimumSamples: 10_000,
      metrics: {
        open_warm_p95_ms: 2_100,
        open_compatibility_fallback_count: 0,
      },
    }));
    expect(resolveNextRolloutStageFromEnv("descriptor_25")).toBe("child_internal");
  });
});

describe("document-open CI gate definitions", () => {
  it("contains explicit progress-gate definitions used by rollout automation", () => {
    const names = DOCUMENT_OPEN_CI_GATE_DEFINITIONS.map((item) => item.metricName);
    expect(names).toContain(DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.warmOpenP95Ms);
    expect(names).toContain(DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openCompatibilityFallbackCount);
    expect(names).toContain(DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openPermissionMismatchCount);
    expect(names.length).toBeGreaterThanOrEqual(5);
    expect(new Set(names).size).toBe(names.length);
  });
});
