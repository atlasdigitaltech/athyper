import { it, expect } from "vitest";
import { resolveAtlasIntent } from "../structured-intent.js";
import type { AtlasBusinessContextV1 } from "@athyper/server-contract-ai";
const page: AtlasBusinessContextV1 = {
  schemaVersion: 1,
  kind: "record",
  entityCode: "business_partner",
  recordId: "10000000-0000-4000-8000-000000000001",
  generationId: "10000000-0000-4000-8000-000000000002",
  locale: "en",
  dirty: false,
};
const tools = [
  "bp_read_brief",
  "bp_explain_readiness",
  "bp_check_eligibility",
].map((name) => ({ name, description: name, inputSchema: { type: "object" } }));
it.each([
  "What is missing for this supplier?",
  "Can we purchase from this supplier?",
  "Give me a brief",
])("clarifies missing applied scope for %s", (question) => {
  expect(resolveAtlasIntent(tools, question, page)).toMatchObject({
    kind: "clarify",
    reason: "missing_scope",
    strategy: "owner_scope",
  });
});
it("does not infer a capability that admission withheld", () => {
  expect(
    resolveAtlasIntent([], "Can we purchase from this supplier?", page).kind,
  ).toBe("delegate");
});
it("does not require transaction scope for unrelated questions or case validation", () => {
  for (const question of [
    "What changed in this draft?",
    "What is missing from this case?",
    "Show contacts",
  ])
    expect(resolveAtlasIntent(tools, question, page).kind).toBe("delegate");
});
it("preserves fully applied and historical context handling", () => {
  const scoped = {
    ...page,
    roleLens: "supplier",
    workContext: {
      operatingOrganizationId: page.recordId,
      companyCodeId: page.recordId,
    },
  };
  expect(
    resolveAtlasIntent(tools, "Can we purchase from this supplier?", scoped)
      .kind,
  ).toBe("delegate");
  expect(
    resolveAtlasIntent(tools, "Can we purchase from this supplier?", {
      ...page,
      asOf: "2026-01-01",
    }).kind,
  ).toBe("delegate");
});
