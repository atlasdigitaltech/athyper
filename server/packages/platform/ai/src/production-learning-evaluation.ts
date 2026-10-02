import { createHash } from "node:crypto";
import type { AtlasIntentV1 } from "@athyper/server-contract-ai";
import {
  ATLAS_LEARNING_SCORING_VERSION,
  scoreAtlasLearningResolution,
  summarizeAtlasLearningResults,
} from "./learning-evaluation.js";
import {
  applicableAtlasRuntimeTools,
  discoverAtlasRuntimeTools,
} from "./runtime-tool-discovery.js";
import { resolveAtlasIntent } from "./structured-intent.js";
import type { AtlasRuntimeToolCoordinator } from "./runtime-tool-coordinator.js";

export interface AtlasProductionLearningFixture {
  readonly id: string;
  readonly expectation: Parameters<typeof scoreAtlasLearningResolution>[0];
  /** Independently prepared, authorized runtime context; never synthesized from expectations. */
  readonly runtime: Omit<
    Parameters<typeof discoverAtlasRuntimeTools>[0],
    "coordinator"
  >;
  /** Same subject and scenario, resolved against the baseline publication coordinates. */
  readonly baselineRuntime?: Omit<
    Parameters<typeof discoverAtlasRuntimeTools>[0],
    "coordinator"
  >;
  readonly expectedAdmittedCapabilityIds: readonly string[];
}

/** Exercises real discovery and intent selection, not model completion or owner execution.
 * Baseline and candidate coordinators must resolve their respective pinned publications.
 * Discovery errors propagate: an unavailable test environment must not score as denial.
 */
export async function evaluateAtlasProductionLearning(input: {
  candidate: AtlasRuntimeToolCoordinator;
  baseline?: AtlasRuntimeToolCoordinator;
  fixtures: readonly AtlasProductionLearningFixture[];
}) {
  if (
    !input.fixtures.length ||
    new Set(input.fixtures.map((f) => f.id)).size !== input.fixtures.length ||
    input.fixtures.some((f) => !f.id.trim())
  )
    throw new TypeError(
      "Evaluation requires nonempty, uniquely identified fixtures.",
    );
  if (
    input.fixtures.some(
      (f) =>
        new Set(f.expectedAdmittedCapabilityIds).size !==
        f.expectedAdmittedCapabilityIds.length,
    )
  )
    throw new TypeError("Expected admitted capability IDs must be unique.");
  const results = [];
  for (const fixture of input.fixtures) {
    const resolve = async (
      coordinator: AtlasRuntimeToolCoordinator,
      runtime = fixture.runtime,
    ) => {
      const tools = applicableAtlasRuntimeTools(
        await discoverAtlasRuntimeTools({ ...runtime, coordinator }),
        runtime.businessContext,
      );
      const intent: AtlasIntentV1 = coordinator.resolveIntent
        ? coordinator.resolveIntent(
            runtime.context,
            fixture.expectation.question,
            runtime.businessContext,
            tools,
          )
        : resolveAtlasIntent(
            tools,
            fixture.expectation.question,
            runtime.businessContext?.page,
          );
      return { intent, admittedCapabilityIds: tools.map((t) => t.name).sort() };
    };
    const candidate = await resolve(input.candidate);
    const baseline = input.baseline
      ? await resolve(
          input.baseline,
          fixture.baselineRuntime ?? fixture.runtime,
        )
      : undefined;
    const score = scoreAtlasLearningResolution(
      fixture.expectation,
      candidate.intent,
      baseline?.intent,
    );
    const discoveryPassed =
      JSON.stringify(candidate.admittedCapabilityIds) ===
      JSON.stringify([...fixture.expectedAdmittedCapabilityIds].sort());
    results.push({
      id: fixture.id,
      ...score,
      passed: score.passed && discoveryPassed,
      discoveryPassed,
      admittedCapabilityIds: candidate.admittedCapabilityIds,
      ...(baseline
        ? { baselineAdmittedCapabilityIds: baseline.admittedCapabilityIds }
        : {}),
    });
  }
  return {
    ...summarizeAtlasLearningResults(results),
    // Includes context/admission changes; only the digest is returned, never permissions or credentials.
    fixtureHash: createHash("sha256")
      .update(JSON.stringify(input.fixtures))
      .digest("hex"),
    evaluationVersion: "atlas-production-discovery/1.0",
    scoringVersion: ATLAS_LEARNING_SCORING_VERSION,
    coordinatorVersion: input.candidate.version ?? "unversioned",
    ...(input.baseline
      ? { baselineCoordinatorVersion: input.baseline.version ?? "unversioned" }
      : {}),
    results,
  };
}
