import { expect, it } from "vitest";
import { compileGraph, runContractTests, sha256 } from "./deterministic.js";
import { authoringGraph } from "./testing/authoring-graph.js";
import { resolvePublishedLearningFixtureSource } from "./published-learning-fixtures.js";

const fixtures = [
  { question: "Show this nation snapshot", expected: "read", purpose: "correction" },
  { question: "Show this country", expected: "read", purpose: "preservation" },
  { question: "Delete this country", expected: "delegate", purpose: "safety" },
];
function source() {
  const graph = authoringGraph();
  graph.tests = [{ key: "summary-v1", assertion: "learning_fixture_set", path: "entity", expected: {
    schema: "atlas-learning-fixtures/1", entityCode: "sample", originPlane: "neon", fixtures,
  } }];
  return { contract_json: graph, contract_hash: sha256(graph), single_author_history: true,
    author_id: "00000000-0000-4000-8000-000000000001", approved_by: "00000000-0000-4000-8000-000000000002",
    approved_at: "2026-09-30T00:00:00Z", published_at: "2026-10-01T00:00:00Z" };
}
it("resolves immutable published fixture content and provenance without exposing questions in runtime metadata", () => {
  const row = source();
  expect(resolvePublishedLearningFixtureSource("release/summary-v1", "summary-v1", row)).toMatchObject({
    fixtures, contentHash: sha256(fixtures), authorId: row.author_id, approvedBy: row.approved_by,
    entityCode: "sample", originPlane: "neon", lockedAt: "2026-10-01T00:00:00.000Z",
  });
  expect(runContractTests(row.contract_json).passed).toBe(true);
  expect(JSON.stringify(compileGraph(row.contract_json).descriptor)).not.toContain("nation snapshot");
});
it.each(["same-reviewer", "bad-author", "hash", "publication-date", "approval-date", "late-approval", "missing-key", "duplicate-key"])("rejects invalid provenance: %s", kind => {
  const row = source();
  if (kind === "same-reviewer") row.approved_by = row.author_id;
  if (kind === "bad-author") row.author_id = "claimed author";
  if (kind === "hash") row.contract_hash = "0".repeat(64);
  if (kind === "publication-date") row.published_at = "invalid";
  if (kind === "approval-date") row.approved_at = "invalid";
  if (kind === "late-approval") row.approved_at = "2026-10-02T00:00:00Z";
  if (kind === "missing-key") row.contract_json.tests = [];
  if (kind === "duplicate-key") row.contract_json.tests = [...row.contract_json.tests!, ...row.contract_json.tests!];
  if (["missing-key", "duplicate-key"].includes(kind)) row.contract_hash = sha256(row.contract_json);
  expect(() => resolvePublishedLearningFixtureSource("release/summary-v1", "summary-v1", row)).toThrow();
});
it.each([
  { entityCode: "other" }, { originPlane: "unknown" }, { fixtures: [] }, { authorId: "caller" }, { schema: "unknown" },
])("fails contract qualification for malformed fixture declarations: %j", patch => {
  const row = source();
  const test = row.contract_json.tests![0]!;
  test.expected = { ...(test.expected as Record<string, unknown>), ...patch };
  expect(runContractTests(row.contract_json).passed).toBe(false);
});

it("accepts a database-recomputed legacy JSONB hash, never an unverified stored hash", () => {
  const row = { ...source(), contract_hash: "a".repeat(64), legacy_hash_matches: true };
  expect(resolvePublishedLearningFixtureSource("release/summary-v1", "summary-v1", row).fixtures).toEqual(fixtures);
  expect(() => resolvePublishedLearningFixtureSource("release/summary-v1", "summary-v1", { ...row, legacy_hash_matches: false })).toThrow();
});

it("requires recorded single-author history, not just the original change-set creator", () => {
  expect(() => resolvePublishedLearningFixtureSource("release/summary-v1", "summary-v1", { ...source(), single_author_history: false })).toThrow();
});
