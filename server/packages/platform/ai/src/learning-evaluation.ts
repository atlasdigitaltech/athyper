import { createHash } from "node:crypto";
import type { AtlasIntentV1 } from "@athyper/server-contract-ai";
import type { EntityAiDescriptorV1 } from "@athyper/server-contract-metadata";
import { resolveAtlasIntent } from "./structured-intent.js";

export const ATLAS_LEARNING_RESOLVER_VERSION = "atlas-exact-terms/4.0";
export const ATLAS_LEARNING_SCORING_VERSION = "atlas-learning-scoring/2.0";

export interface AtlasLearningResolutionFixture {
  readonly question: string;
  readonly expected: "read" | "clarify" | "delegate" | "denied";
  readonly purpose?: "correction" | "preservation" | "safety";
  /** Exact set, order independent. Legacy read fixtures target record summary. */
  readonly capabilityIds?: readonly string[];
}

/** Score externally authored expectations; baseline failure never excuses candidate failure. */
export function scoreAtlasLearningResolution(
  fixture: AtlasLearningResolutionFixture,
  actual: AtlasIntentV1,
  baseline?: AtlasIntentV1,
) {
  const purpose =
    fixture.purpose ?? (fixture.expected === "read" ? "correction" : "safety");
  const expectedIds =
    fixture.capabilityIds ??
    (fixture.expected === "read" ? ["entity_read_record"] : []);
  if (new Set(expectedIds).size !== expectedIds.length)
    throw new TypeError("Expected capability IDs must be unique");
  const matches = (intent: AtlasIntentV1) =>
    intent.kind === fixture.expected &&
    intent.capabilityIds.length === expectedIds.length &&
    expectedIds.every((id) => intent.capabilityIds.includes(id));
  const candidateMatches = matches(actual);
  const baselineMatches = baseline ? matches(baseline) : undefined;
  // Legacy candidate-only calls retain outcome checking. Explicit comparative fixtures require a baseline.
  const comparisonAvailable =
    Boolean(baseline) || fixture.purpose === undefined || purpose === "safety";
  const comparisonPassed =
    !baseline ||
    purpose === "safety" ||
    (purpose === "correction" ? !baselineMatches : baselineMatches);
  const passed =
    candidateMatches && comparisonAvailable && Boolean(comparisonPassed);
  return {
    purpose,
    expected: fixture.expected,
    actual: actual.kind,
    expectedCapabilityIds: [...expectedIds],
    actualCapabilityIds: [...actual.capabilityIds],
    ...(baseline
      ? {
          before: baseline.kind,
          beforeCapabilityIds: [...baseline.capabilityIds],
        }
      : {}),
    passed,
    reason: !candidateMatches
      ? "candidate_mismatch"
      : !comparisonAvailable
        ? "baseline_required"
        : !comparisonPassed
          ? purpose === "correction"
            ? "baseline_already_correct"
            : "baseline_mismatch"
          : "passed",
  };
}

/** Report improvement and regression protection separately; every failure remains a hard gate. */
export function summarizeAtlasLearningResults(
  results: readonly Pick<
    ReturnType<typeof scoreAtlasLearningResolution>,
    "purpose" | "passed"
  >[],
) {
  const groups = Object.fromEntries(
    (["correction", "preservation", "safety"] as const).map((purpose) => {
      const selected = results.filter((result) => result.purpose === purpose);
      return [
        purpose,
        {
          total: selected.length,
          passed: selected.filter((result) => result.passed).length,
        },
      ];
    }),
  );
  return {
    passed: results.length > 0 && results.every((result) => result.passed),
    groups,
  };
}

/** Narrow record-summary qualification. Production discovery qualification is a separate adapter.
 * Fixtures never become aliases. Omitted purposes preserve historical fixture semantics. */
export function evaluateAtlasLearningVocabulary(
  entityCode: string,
  ai: EntityAiDescriptorV1,
  fixtures: readonly AtlasLearningResolutionFixture[],
  baseline?: EntityAiDescriptorV1,
) {
  const toolsFor = (descriptor: EntityAiDescriptorV1) => {
    const terms =
      descriptor.vocabulary?.terms
        .filter((term) => term.capabilityId === "entity_read_record")
        .map((term) => term.phrase) ?? [];
    return descriptor.enabled &&
      descriptor.insightProviders.some((ref) => ref.id === "entity_read_record")
      ? [
          {
            name: "entity_read_record",
            description: "Read current record",
            inputSchema: {},
            entitySection: {
              entityCode,
              sectionKey: "record_summary",
              aliases: ["summary", ...descriptor.aliases],
              semanticAliases: terms,
              resultKey: "items",
              label: "Record summary",
            },
          },
        ]
      : [];
  };
  const page = {
    schemaVersion: 1,
    kind: "record",
    entityCode,
    recordId: "00000000-0000-4000-8000-000000000001",
    section: "overview",
    dirty: false,
    generationId: "evaluation",
    locale: "en",
  } as const;
  const tools = toolsFor(ai),
    beforeTools = baseline ? toolsFor(baseline) : undefined;
  const results = fixtures.map((fixture) =>
    scoreAtlasLearningResolution(
      fixture,
      resolveAtlasIntent(tools, fixture.question, page),
      beforeTools
        ? resolveAtlasIntent(beforeTools, fixture.question, page)
        : undefined,
    ),
  );
  return {
    ...summarizeAtlasLearningResults(results),
    fixtureHash: createHash("sha256")
      .update(JSON.stringify(fixtures))
      .digest("hex"),
    resolverVersion: ATLAS_LEARNING_RESOLVER_VERSION,
    scoringVersion: ATLAS_LEARNING_SCORING_VERSION,
    results,
  };
}
