import { afterEach, describe, expect, it, vi } from "vitest";

describe("document-open rollback guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not disable rollout when guard is turned off", async () => {
    vi.stubEnv("DOCUMENT_OPEN_ROLLBACK_ENABLED", "false");
    const guard = await import("../document-open-rollout-guard");
    guard.resetOpenRolloutGuardState();
    for (let index = 0; index < 50; index += 1) {
      guard.recordDocumentEditOpenMetric({
        event: "workspace_projection_validation",
        outcome: "failure",
        reason: "missing_field_mask",
      });
    }

    expect(guard.getOpenRolloutGuardDecision().disabled).toBe(false);
  });

  it("disables OPEN rollouts when guarded failures cross configured threshold", async () => {
    vi.stubEnv("DOCUMENT_OPEN_ROLLBACK_ENABLED", "true");
    vi.stubEnv("DOCUMENT_OPEN_ROLLBACK_MIN_SAMPLES", "5");
    vi.stubEnv("DOCUMENT_OPEN_ROLLBACK_FAILURE_RATE", "0.5");
    const guard = await import("../document-open-rollout-guard");
    guard.resetOpenRolloutGuardState();
    for (let index = 0; index < 3; index += 1) {
      guard.recordDocumentEditOpenMetric({
        event: "workspace_projection_validation",
        outcome: "failure",
        reason: "missing_field_mask",
      });
    }
    for (let index = 0; index < 2; index += 1) {
      guard.recordDocumentEditOpenMetric({
        event: "workspace_open",
        outcome: "success",
      });
    }

    expect(guard.getOpenRolloutGuardDecision().disabled).toBe(true);
    expect(guard.getOpenRolloutGuardDecision().reason).toContain("missing_field_mask");
  });
});
