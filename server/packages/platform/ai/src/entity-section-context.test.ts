import { expect, it } from "vitest";
import { entitySectionAnswer } from "./entity-section-answer.js";
const definitions = [
  {
    name: "entity_read_record",
    description: "Read",
    inputSchema: {},
    entitySection: {
      entityCode: "example",
      sectionKey: "record_summary",
      aliases: ["summary", "overview"],
      resultKey: "items",
      label: "Record summary",
      searchFields: ["name"],
    },
  },
];
const results = [
  {
    type: "tool_result" as const,
    toolName: "entity_read_record",
    callId: "read",
    result: {
      section: "record_summary",
      status: "ready",
      items: [{ name: "Malaysia" }],
      hasMore: false,
    },
  },
];
it.each([
  "Explain the saved information in overview.",
  "Show details from the Overview section.",
])("renders authorized values for section context: %s", (question) => {
  expect(entitySectionAnswer(results, definitions, question)).toContain(
    "Name: Malaysia",
  );
});
it("retains unsupported filters even with a trailing section reference", () => {
  expect(
    entitySectionAnswer(
      results,
      definitions,
      "Show records with population over 5 in overview.",
    ),
  ).toContain("cannot evaluate that filter");
  expect(
    entitySectionAnswer(results, definitions, "Show records in Asia."),
  ).toContain("cannot evaluate that filter");
});
it("does not rewrite a name query containing the section name", () => {
  expect(
    entitySectionAnswer(
      results,
      definitions,
      "Show records named in overview.",
    ),
  ).toContain("No authorized name matches for “in overview”");
});
