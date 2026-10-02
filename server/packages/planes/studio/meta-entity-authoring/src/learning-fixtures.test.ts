import { expect, it } from "vitest";
import { parseLearningFixtures } from "./learning-inbox.js";

const fixtures = [
  { question: "Show this nation snapshot", expected: "read", purpose: "correction", capabilityIds: ["entity_read_record"] },
  { question: "Show this country", expected: "read", purpose: "preservation", capabilityIds: ["entity_read_record"] },
  { question: "Delete this country", expected: "delegate", purpose: "safety", capabilityIds: [] },
];
it("preserves explicit purpose and exact expectations through the authoring boundary", () => {
  expect(parseLearningFixtures(fixtures)).toEqual(fixtures);
});
it("does not permit a learning release justified only by preservation", () => {
  expect(() => parseLearningFixtures(fixtures.map(f => f.purpose === "correction" ? { ...f, purpose: "preservation" } : f))).toThrow();
});
it.each([
  { purpose: "unknown" }, { capabilityIds: ["entity_read_record", "entity_read_record"] },
  { capabilityIds: [] }, { capabilityIds: ["invalid id"] }, { capabilityIds: "entity_read_record" },
])("rejects malformed fixture declarations: %j", patch => {
  expect(() => parseLearningFixtures([{ ...fixtures[0], ...patch }, ...fixtures.slice(1)])).toThrow();
});
it("requires explicit competitors for an ambiguity expectation", () => {
  const question = "Show this overview";
  expect(() => parseLearningFixtures([...fixtures, { question, expected: "clarify", purpose: "safety" }])).toThrow();
  expect(parseLearningFixtures([...fixtures, { question, expected: "clarify", purpose: "safety", capabilityIds: ["entity_read_record", "entity_read_comments"] }])).toHaveLength(4);
});
