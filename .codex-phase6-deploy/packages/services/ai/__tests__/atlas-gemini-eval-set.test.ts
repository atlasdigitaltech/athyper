import { describe, expect, it } from "vitest";

import {
  REQUIRED_GEMINI_CATEGORY_MINIMUMS,
  loadAtlasGeminiEvaluationSuite,
  validateAtlasGeminiEvaluationSuite,
} from "../evals/validate-atlas-gemini-eval";

describe("Atlas Gemini evaluation suite", () => {
  it("layers 30 Gemini-specific cases over the byte-pinned 200-case suite", () => {
    const validated = loadAtlasGeminiEvaluationSuite();

    expect(validated.addon).toMatchObject({
      dataset_id: "atlas-gemini-eval-addon",
      version: "1.0.0",
      base_suite: {
        dataset_id: "atlas-openai-eval",
        version: "1.0.0",
        required_case_count: 200,
        sha256:
          "2B7C8677E69CAD690AAA1F1550F656DA57E36C014502BAA9E3648678ED02BF05",
      },
      data_policy: {
        source: "synthetic_only",
        contains_customer_data: false,
        tenant_data_allowed: false,
      },
      model_profile: {
        provider: "gemini",
        public_binding: "atlas-gemini-eval",
        upstream_model_id: "gemini-3.6-flash",
        exact_model_source: "AtlasModelBinding",
        api_surface: "interactions",
        endpoint_version: "v1beta",
        sdk_package: "@google/genai",
        sdk_version: "2.13.0",
        audience: "internal_only",
        evaluation_status: "not_run",
        scores_recorded: false,
      },
      run_policy_contract: {
        free_tier_scope: "local_development_synthetic_only",
        tenant_data_requires: "approved_paid",
        silent_account_fallback_allowed: false,
        routing_enabled: false,
        safety_gate_status: "blocked_pending_paid_sandbox_native_fixture",
      },
    });
    expect(validated.commonCases).toHaveLength(200);
    expect(validated.geminiCases).toHaveLength(30);
    expect(validated.allCaseCount).toBe(230);
    expect(validated.categoryCounts).toEqual(
      REQUIRED_GEMINI_CATEGORY_MINIMUMS,
    );

    const ids = [
      ...validated.commonCases.map((item) => item.id),
      ...validated.geminiCases.map((item) => item.id),
    ];
    expect(new Set(ids).size).toBe(230);
  });

  it("keeps future tool calls fixture-only and JSON claims prompt-only", () => {
    const validated = loadAtlasGeminiEvaluationSuite();
    const toolCases = validated.geminiCases.filter(
      (item) => item.category === "multi_function_call_ordering",
    );
    const jsonCases = validated.geminiCases.filter(
      (item) => item.category === "structured_output_adherence",
    );

    expect(toolCases).toHaveLength(5);
    expect(
      toolCases.every(
        (item) =>
          item.execution.harness === "provider_recorded_fixture"
          && item.execution.capability_gate === "future_tool_calls"
          && item.setup.kind === "recorded_fixture",
      ),
    ).toBe(true);

    expect(jsonCases).toHaveLength(5);
    expect(
      jsonCases.every(
        (item) =>
          item.execution.harness === "atlas_live_text"
          && item.execution.capability_gate === "phase3_text"
          && item.execution.claim_scope === "prompt_json_only"
          && item.setup.kind === "live_text",
      ),
    ).toBe(true);
  });

  it("fails closed on base drift, live tool activation, and fabricated results", () => {
    const { addon } = loadAtlasGeminiEvaluationSuite();

    const changedHash = structuredClone(addon);
    changedHash.base_suite.sha256 = "A".repeat(64);
    expect(() => validateAtlasGeminiEvaluationSuite(changedHash)).toThrow(
      /common evaluation fixture hash mismatch/,
    );

    const liveTools = structuredClone(addon);
    const toolFamily = liveTools.families.find(
      (family) => family.category === "multi_function_call_ordering",
    );
    if (!toolFamily) throw new Error("Gemini tool fixture family is missing");
    toolFamily.execution.harness = "atlas_live_text";
    expect(() => validateAtlasGeminiEvaluationSuite(liveTools)).toThrow(
      /future tool calls only with recorded provider fixtures/,
    );

    const fabricatedResult = {
      ...structuredClone(addon),
      winner: "gemini",
    };
    expect(() => validateAtlasGeminiEvaluationSuite(fabricatedResult)).toThrow();
  });
});
