import { parseLearningFixtures } from "./learning-fixtures.js";

/** Authoring-only declaration. Compilation validates shape, not model performance.
 * The tests branch never becomes runtime vocabulary or retrieval examples. */
export function parsePublishedLearningFixtureSet(value: unknown, entityCode: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid learning fixture declaration");
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(key => !["schema", "entityCode", "originPlane", "fixtures"].includes(key)) ||
      item.schema !== "atlas-learning-fixtures/1" || item.entityCode !== entityCode ||
      !["studio", "neon", "mesh"].includes(String(item.originPlane)))
    throw new TypeError("Learning fixtures must bind their published entity and origin plane");
  return { schema: "atlas-learning-fixtures/1" as const, entityCode,
    originPlane: item.originPlane as "studio" | "neon" | "mesh", fixtures: parseLearningFixtures(item.fixtures) };
}
