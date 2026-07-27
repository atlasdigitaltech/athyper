import { describe, expect, it } from "vitest";

import {
  areAnthropicProductionApprovalsComplete,
  loadAnthropicProductionApproval,
  loadAnthropicProductionBaseline,
} from "../evals/validate-anthropic-production-baseline.js";

describe("Anthropic immutable production baseline", () => {
  it("locks 200 synthetic cases and all public modes to exact no-fallback bindings", () => {
    const result = loadAnthropicProductionBaseline();

    expect(result.caseCount).toBe(200);
    expect(result.fixtureSha256).toBe(
      "2b7c8677e69cad690aaa1f1550f656da57e36c014502baa9e3648678ed02bf05",
    );
    expect(result.baseline.bindings).toEqual([
      expect.objectContaining({
        public_model_id: "atlas-fast",
        upstream_model_id: "claude-haiku-4-5-20251001",
        routing_policy_id: "no-fallback-v1",
      }),
      expect.objectContaining({
        public_model_id: "atlas-balanced",
        upstream_model_id: "claude-sonnet-4-6",
        routing_policy_id: "no-fallback-v1",
      }),
      expect.objectContaining({
        public_model_id: "atlas-best",
        upstream_model_id: "claude-opus-4-8",
        routing_policy_id: "no-fallback-v1",
      }),
    ]);
    expect(result.baseline.evaluation_status).toBe("not_run");
    expect(result.baseline.outputs_embedded).toBe(false);
  });

  it("keeps the checked-in approval template fail-closed", () => {
    const approval = loadAnthropicProductionApproval(
      new URL(
        "../evals/anthropic-production-approval.example.json",
        import.meta.url,
      ),
    );

    expect(areAnthropicProductionApprovalsComplete(approval)).toBe(false);
  });
});
