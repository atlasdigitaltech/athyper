import { describe, expect, it } from "vitest";
import type { EntityAiDescriptorV1 } from "@athyper/server-contract-metadata";
import type { AtlasIntentV1 } from "@athyper/server-contract-ai";
import {
  evaluateAtlasLearningVocabulary,
  scoreAtlasLearningResolution,
} from "./learning-evaluation.js";

const baseline: EntityAiDescriptorV1 = {
  schemaVersion: 1,
  enabled: true,
  aliases: ["country"],
  summaryFieldKeys: ["code"],
  searchFieldKeys: [],
  relationshipKeys: [],
  contextKinds: ["record"],
  insightProviders: [{ id: "entity_read_record", version: 1 }],
  actions: [],
  presentationProfiles: [],
};
const candidate: EntityAiDescriptorV1 = {
  ...baseline,
  vocabulary: {
    schemaVersion: 1,
    locale: "en",
    terms: [
      {
        phrase: "nation snapshot",
        capabilityId: "entity_read_record",
        origin: {
          plane: "neon",
          candidateId: "00000000-0000-4000-8000-000000000001",
          proposalHash: "a".repeat(64),
        },
      },
    ],
  },
};
const read = (id = "entity_read_record"): AtlasIntentV1 => ({
  schemaVersion: 1,
  kind: "read",
  strategy: "exact_terms",
  reason: "matched",
  capabilityIds: [id],
});
const delegate: AtlasIntentV1 = {
  schemaVersion: 1,
  kind: "delegate",
  strategy: "model",
  reason: "unsupported",
  capabilityIds: [],
};

describe("learning scoring", () => {
  it("rejects duplicate expected IDs instead of hiding a competing capability", () => {
    expect(() =>
      scoreAtlasLearningResolution(
        {
          question: "Show current overview",
          expected: "clarify",
          purpose: "safety",
          capabilityIds: ["entity_read_record", "entity_read_record"],
        },
        {
          schemaVersion: 1,
          kind: "clarify",
          strategy: "exact_terms",
          reason: "ambiguous",
          capabilityIds: ["entity_read_record", "entity_read_comments"],
        },
      ),
    ).toThrow(/unique/);
  });
  it("accepts positive preservation but does not count it as correction", () => {
    const fixture = {
      question: "Show this country",
      expected: "read" as const,
    };
    expect(
      scoreAtlasLearningResolution(
        { ...fixture, purpose: "preservation" },
        read(),
        read(),
      ).passed,
    ).toBe(true);
    expect(
      scoreAtlasLearningResolution(
        { ...fixture, purpose: "correction" },
        read(),
        read(),
      ),
    ).toMatchObject({ passed: false, reason: "baseline_already_correct" });
  });
  it("requires a baseline for explicit comparative fixtures", () => {
    expect(
      scoreAtlasLearningResolution(
        {
          question: "Show this country",
          expected: "read",
          purpose: "preservation",
        },
        read(),
      ).reason,
    ).toBe("baseline_required");
  });
  it("does not let a failing baseline excuse candidate safety failure", () => {
    const fixture = {
      question: "Delete country",
      expected: "delegate" as const,
      purpose: "safety" as const,
    };
    expect(scoreAtlasLearningResolution(fixture, read(), read()).passed).toBe(
      false,
    );
    expect(scoreAtlasLearningResolution(fixture, delegate, read()).passed).toBe(
      true,
    );
  });
  it("compares capability identity, including baseline wrong-capability corrections", () => {
    const fixture = {
      question: "Show comments",
      expected: "read" as const,
      capabilityIds: ["entity_read_comments"],
      purpose: "correction" as const,
    };
    expect(
      scoreAtlasLearningResolution(
        fixture,
        read("entity_read_comments"),
        read(),
      ).passed,
    ).toBe(true);
    expect(scoreAtlasLearningResolution(fixture, read(), delegate).passed).toBe(
      false,
    );
  });
  it("scores real resolver correction, preservation and safety independently without injecting fixtures", () => {
    const result = evaluateAtlasLearningVocabulary(
      "country",
      candidate,
      [
        {
          question: "Show this nation snapshot",
          expected: "read",
          purpose: "correction",
        },
        {
          question: "Show this country",
          expected: "read",
          purpose: "preservation",
        },
        { question: "Delete country", expected: "delegate", purpose: "safety" },
      ],
      baseline,
    );
    expect(result.passed).toBe(true);
    expect(result.groups).toEqual({
      correction: { total: 1, passed: 1 },
      preservation: { total: 1, passed: 1 },
      safety: { total: 1, passed: 1 },
    });
    expect(result.scoringVersion).toBe("atlas-learning-scoring/2.0");
  });
  it("rejects empty evaluations and changes fixture identity when purpose changes", () => {
    expect(
      evaluateAtlasLearningVocabulary("country", candidate, []).passed,
    ).toBe(false);
    const fixture = {
      question: "Show this country",
      expected: "read" as const,
    };
    expect(
      evaluateAtlasLearningVocabulary("country", candidate, [fixture])
        .fixtureHash,
    ).not.toBe(
      evaluateAtlasLearningVocabulary("country", candidate, [
        { ...fixture, purpose: "preservation" },
      ]).fixtureHash,
    );
  });
  it("never compensates a safety regression with successful correction and preservation", () => {
    const result = evaluateAtlasLearningVocabulary(
      "country",
      candidate,
      [
        {
          question: "Show this nation snapshot",
          expected: "read",
          purpose: "correction",
        },
        {
          question: "Show this country",
          expected: "read",
          purpose: "preservation",
        },
        {
          question: "Show this nation snapshot",
          expected: "delegate",
          purpose: "safety",
        },
      ],
      baseline,
    );
    expect(result.passed).toBe(false);
    expect(result.groups).toEqual({
      correction: { total: 1, passed: 1 },
      preservation: { total: 1, passed: 1 },
      safety: { total: 1, passed: 0 },
    });
  });
});
