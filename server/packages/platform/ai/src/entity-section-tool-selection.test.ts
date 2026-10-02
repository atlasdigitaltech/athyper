import { expect, it } from "vitest";
import type { AtlasBusinessContextV1, AtlasProviderToolDefinition } from "@athyper/server-contract-ai";
import { currentEntitySectionTools } from "./entity-section-tool-selection.js";

const page: AtlasBusinessContextV1 = {
  schemaVersion: 1, kind: "record", entityCode: "reference",
  recordId: "10000000-0000-4000-8000-000000000003", section: "overview",
  generationId: "10000000-0000-4000-8000-000000000004", dirty: false, locale: "en",
};
const tools: AtlasProviderToolDefinition[] = [
  { name: "entity_lookup", description: "Lookup", inputSchema: {} },
  ...[
    ["fields", ["field", "fields", "required flags"]],
    ["comments", ["comments"]],
    ["snapshots", ["snapshots"]],
  ].map(([name, aliases]) => ({
    name: String(name), description: String(name), inputSchema: {},
    entitySection: { entityCode: "reference", sectionKey: String(name), aliases: aliases as string[] },
  })),
];

it("offers admitted current-record sections without generic discovery or lookup", () => {
  for (const [text, expected] of [
    ["Use the published field reader to tell me the field types and required flags for this record.", "fields"],
    ["Read the saved comments on this record. Do not infer that an author has no comments from a partial page.", "comments"],
    ["List the saved snapshots for this record and explain the coverage limits.", "snapshots"],
  ]) expect(currentEntitySectionTools(tools, text!, page)?.map(t => t.name)).toEqual([expected]);
});

it("preserves competing sections for model selection", () => {
  expect(currentEntitySectionTools(tools, "Explain fields and comments for this record", page)?.map(t => t.name))
    .toEqual(["fields", "comments"]);
});

it("does not turn a named, relationship, historical, or absent scope into a page read", () => {
  for (const text of ["Explain fields for Example", "Explain fields for this record and Example", "Explain fields for Example and this record", "Compare this record with another record's fields", "Find other records with these fields", "What is this record's country?"])
    expect(currentEntitySectionTools(tools, text, page)).toBeUndefined();
  expect(currentEntitySectionTools(tools, "Explain fields for this record", undefined)).toBeUndefined();
  expect(currentEntitySectionTools(tools, "Explain fields for this record", { ...page, asOf: "2026-01-01T00:00:00Z" })).toBeUndefined();
  expect(currentEntitySectionTools(tools.filter(t => t.name === "entity_lookup"), "Explain fields for this record", page)).toBeUndefined();
});
