import { expect, it } from "vitest";
import { fitLocalPrompt, localPromptTokenBound, type AtlasBusinessContextV1 } from "@athyper/server-contract-ai";
import { businessPartnerAssistanceInstruction, businessPartnerMissingScopeMessage } from "../business-partner-assistance.js";
import { createBusinessPartnerInsightTools } from "../business-partner-insight-tools.js";
const id = "10000000-0000-4000-8000-000000000001";
const page = {kind: "record", entityCode: "business_partner", recordId: id, roleLens: "supplier", workContext: {operatingOrganizationId: id}} as AtlasBusinessContextV1;
const tools = createBusinessPartnerInsightTools({read: async () => {throw Error("unused");}}).map(t => ({name: t.manifest.toolCode, description: t.manifest.description, inputSchema: t.manifest.inputSchema}));
it("uses verified page scope to request only missing coordinates", () => {
  const instruction = businessPartnerAssistanceInstruction(tools, page);
  expect(instruction).toContain("Assessment scope missing: company.");
  expect(instruction).toContain("without asking permission");
  expect(instruction).toContain("Mutations still require confirmation");
  expect(instruction).not.toContain("scope missing: operating organization");
});
it("distinguishes absent capability from missing scope without guessing denial reasons", () => {
  const instruction = businessPartnerAssistanceInstruction([], page);
  expect(instruction).toContain("assessment is unavailable here");
  expect(instruction).not.toContain("Assessment scope missing:");
  expect(instruction).toContain("Do not guess why");
});
it("keeps historical assessments separate from current scope selection", () => {
  const instruction = businessPartnerAssistanceInstruction([], {...page, asOf: "2026-01-01"} as AtlasBusinessContextV1);
  expect(instruction).toContain("historical view");
  expect(instruction).not.toContain("Assessment scope missing:");
});
it("separates transaction eligibility from product availability", () => {
  expect(businessPartnerAssistanceInstruction(tools, page)).toContain("product availability is not established");
  expect(businessPartnerAssistanceInstruction([], undefined)).toBe("");
});
it.each(tools)("fits scope/fallback guidance with $name in the local page prompt", tool => {
  const text = "You are Atlas, a business assistant. Use owner evidence. ".repeat(14) + JSON.stringify(page) + businessPartnerAssistanceInstruction([tool], page);
  const prompt = fitLocalPrompt({messages: [{role: "system", content: [{type: "text", text}]}, {role: "user", content: [{type: "text", text: "Can we purchase an iPhone from this supplier?"}]}], tools: [tool], maxOutputTokens: 128});
  expect(localPromptTokenBound(prompt) + prompt.maxOutputTokens).toBeLessThanOrEqual(4096);
});

it("renders missing scope directly without invented requirements or another model turn", () => {
 const result = {type: "tool_result", toolName: "bp_read_brief", callId: "c", result: {insight: {findings: [{code: "scope_required", state: "not_evaluated", facts: {missingCompany: true, missingRole: false}}]}}} as const;
 expect(businessPartnerMissingScopeMessage([result])).toContain("Readiness and eligibility have not been evaluated");
 expect(businessPartnerMissingScopeMessage([result])).not.toContain("supplier or customer role");
 expect(businessPartnerMissingScopeMessage([{...result, isError: true}])).toBeUndefined();
 expect(businessPartnerMissingScopeMessage([{...result, toolName: "bp_read_summary"}])).toBeUndefined();
});

it.each(["scope_required", "scoped_assessment_unavailable"])("preserves authorized identity for %s without protected fields", code => {
  const result = {type: "tool_result", toolName: "bp_read_brief", callId: "c", result: {records: [{code: "BP-1", display_name: "Northwind Supplies", status: "active", bank: "SECRET"}], insight: {findings: [{code, state: "not_evaluated", facts: {missingCompany: true}}]}}} as const;
  const text = businessPartnerMissingScopeMessage([result]);
  expect(text).toContain("Partner: Northwind Supplies");
  expect(text).toContain("Code: BP-1");
  expect(text).toContain("have not been evaluated");
  expect(text).not.toMatch(/SECRET|proceed with|additional tools/);
});
