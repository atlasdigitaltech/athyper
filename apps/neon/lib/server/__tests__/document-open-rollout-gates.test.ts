import { describe, expect, it } from "vitest";
import { 
  DOCUMENT_OPEN_PROGRESS_METRIC_NAMES,
  DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS,
  isRolloutGateKey,
  parseDocumentOpenRolloutStage,
  resolveNextDocumentOpenRolloutStage,
} from "../document-open-rollout-gates";

describe("document-open-rollout-gates", () => {
  it("exports explicit metric names used by CI gates", () => {
    expect(DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openRulesProjectionCount).toBe("open_rules_projection_count");
    expect(DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openCompatibilityFallbackCount).toBe("open_compatibility_fallback_count");
    expect(DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openSectionTimeoutRate).toBe("open_section_timeout_rate");
    expect(Object.keys(DOCUMENT_OPEN_PROGRESS_METRIC_NAMES)).toContain("warmInitiateP95Ms");
  });

  it("defines numeric gate targets for required rollout metrics", () => {
    expect(DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.openWarmP50Ms).toBe(700);
    expect(DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.warmOpenP95Ms).toBe(1500);
    expect(DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.openCompatibilityFallbackCount).toBe(0);
  });

  it("advances the rollout stage only when thresholds are clean", () => {
    const decision = resolveNextDocumentOpenRolloutStage("rules_internal", {
      minimumSamples: 1_000,
      metrics: {
        [DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.warmOpenP95Ms]: 1100,
        [DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openRulesProjectionCount]: 0,
        [DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openCompatibilityFallbackCount]: 0,
      },
    });
    expect(decision.action).toBe("advance");
    expect(decision.nextStage).toBe("child_internal");
  });

  it("holds when fallback count is non-zero and does not force rollback", () => {
    const decision = resolveNextDocumentOpenRolloutStage("descriptor_5", {
      minimumSamples: 10_000,
      metrics: {
        [DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openCompatibilityFallbackCount]: 1,
      },
    });
    expect(decision.action).toBe("hold");
    expect(decision.nextStage).toBe("descriptor_5");
    expect(decision.reasons).toContain("compatibility_fallback");
  });

  it("rolls back when thresholds are violated", () => {
    const decision = resolveNextDocumentOpenRolloutStage("rules_internal", {
      minimumSamples: 2_000,
      metrics: {
        [DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.warmOpenP95Ms]: 1_900,
        [DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.sessionP95Ms]: 350,
      },
    });
    expect(decision.action).toBe("rollback");
    expect(decision.nextStage).toBe("rules_internal");
    expect(decision.reasons).toContain("target_breach:warmOpenP95Ms:1900");
  });

  it("requires enough samples before automatic advancement", () => {
    const decision = resolveNextDocumentOpenRolloutStage("rules_internal", {
      minimumSamples: 2,
      metrics: {
        [DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.warmOpenP95Ms]: 500,
      },
    });
    expect(decision.action).toBe("hold");
    expect(decision.reasons[0]).toMatch(/insufficient_samples:2\/500/);
  });

  it("recognizes documented stage names", () => {
    expect(parseDocumentOpenRolloutStage("descriptor_25")).toBe("descriptor_25");
    expect(parseDocumentOpenRolloutStage("bad-stage")).toBeNull();
  });

  it("contains the explicit gate names in CI checks", () => {
    expect(isRolloutGateKey("open_stale_rules_count")).toBe(true);
    expect(isRolloutGateKey("open_unknown_metric")).toBe(false);
  });
});
