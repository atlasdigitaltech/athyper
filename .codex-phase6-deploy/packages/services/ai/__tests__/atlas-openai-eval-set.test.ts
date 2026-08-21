import { describe, expect, it } from "vitest";

import {
  REQUIRED_CATEGORY_MINIMUMS,
  loadAtlasOpenAiEvaluationSet,
  validateAtlasOpenAiEvaluationSet,
} from "../evals/validate-atlas-openai-eval";

describe("Atlas OpenAI evaluation set", () => {
  it("normalizes 200 unique, versioned cases with every required category", () => {
    const validated = loadAtlasOpenAiEvaluationSet();

    expect(validated.dataset).toMatchObject({
      dataset_id: "atlas-openai-eval",
      version: "1.0.0",
      data_policy: {
        source: "synthetic_only",
        contains_customer_data: false,
        contains_copyrighted_passages: false,
      },
      model_profile: {
        provider: "openai",
        model_id: "gpt-5.6-sol",
        audience: "internal_only",
        evaluation_status: "not_run",
        scores_recorded: false,
      },
    });
    expect(validated.cases).toHaveLength(200);
    expect(new Set(validated.cases.map((item) => item.id)).size).toBe(200);
    expect(validated.categoryCounts).toEqual(REQUIRED_CATEGORY_MINIMUMS);

    for (const evaluationCase of validated.cases) {
      expect(evaluationCase.version).toBe(validated.dataset.version);
      expect(evaluationCase.category).toBeTruthy();
      expect(["low", "medium", "high"]).toContain(evaluationCase.risk);
      expect(evaluationCase.messages.length).toBeGreaterThan(0);
      expect(evaluationCase.assertions.length).toBeGreaterThan(0);
      expect(evaluationCase.rubric.criteria.length).toBeGreaterThan(0);
      expect(
        evaluationCase.messages.some((message) =>
          message.content.includes("{{")
        ),
      ).toBe(false);
    }
  });

  it("keeps future JSON and cancellation fixtures machine-actionable", () => {
    const validated = loadAtlasOpenAiEvaluationSet();
    const jsonCases = validated.cases.filter(
      (item) => item.category === "future_structured_json",
    );
    const cancellationCases = validated.cases.filter(
      (item) => item.category === "cancellation_long_response",
    );

    expect(jsonCases).toHaveLength(25);
    expect(
      jsonCases.every((item) =>
        item.assertions.some(
          (assertion) => assertion.operator === "matches_json_schema",
        )
      ),
    ).toBe(true);

    expect(cancellationCases).toHaveLength(25);
    expect(
      cancellationCases.every((item) =>
        item.execution?.stream === true
        && item.execution.cancel.trigger === "after_first_text_delta"
        && item.assertions.some(
          (assertion) =>
            assertion.operator === "max_client_visible_post_cancel_deltas",
        )
      ),
    ).toBe(true);
  });

  it("rejects missing category coverage, duplicate IDs, and fabricated scores", () => {
    const { dataset } = loadAtlasOpenAiEvaluationSet();

    const missingCase = structuredClone(dataset);
    missingCase.families[0]?.cases.pop();
    expect(() => validateAtlasOpenAiEvaluationSet(missingCase)).toThrow(
      /at least 200 cases|requires at least 25 cases/,
    );

    const duplicateId = structuredClone(dataset);
    const firstId = duplicateId.families[0]?.cases[0]?.id;
    if (!firstId || !duplicateId.families[1]?.cases[0]) {
      throw new Error("evaluation fixture unexpectedly missing seed cases");
    }
    duplicateId.families[1].cases[0].id = firstId;
    expect(() => validateAtlasOpenAiEvaluationSet(duplicateId)).toThrow(
      /duplicate evaluation case id/,
    );

    const fabricatedResult = {
      ...structuredClone(dataset),
      score: 0.99,
    };
    expect(() => validateAtlasOpenAiEvaluationSet(fabricatedResult)).toThrow();
  });
});
