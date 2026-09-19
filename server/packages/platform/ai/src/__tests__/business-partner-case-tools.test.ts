import { expect, it, vi } from "vitest";
import type { AtlasCaseExplanationOwner, AtlasReadToolHandlerContext } from "@athyper/server-contract-ai";
import { createBusinessPartnerCaseTools } from "../business-partner-case-tools.js";
const id = "10000000-0000-4000-8000-000000000001";
const context = {context: {profileHash: "profile"}, records: {query: vi.fn()}, signal: new AbortController().signal} as unknown as AtlasReadToolHandlerContext;
const saved = {caseId: id, rowVersion: 7, snapshotId: id, descriptorHash: "d".repeat(64), status: "draft", validation: "passed" as const, findings: [], coverage: "partial" as const, diff: {state: "unavailable" as const, baseline: "previous_saved_snapshot" as const, changes: []}};
it("cites the exact saved case and forwards the expected owner version", async () => {
  const read = vi.fn(async () => saved);
  const tool = createBusinessPartnerCaseTools({read})[0]!;
  const result = await tool.readHandler!.execute({context, arguments: {caseId: id, expectedRowVersion: 7}});
  expect(read).toHaveBeenCalledWith({context: context.context, requestId: id, expectedVersion: 7});
  expect(result.sources).toEqual([{coordinate: {entityCode: "entity_case", recordId: id, revision: "7", descriptorHash: saved.descriptorHash}}]);
});
it.each([{caseId: "bad"}, {caseId: id, expectedRowVersion: 0}, {caseId: id, patch: {status: "approved"}}])("rejects malformed or mutating read arguments %j", args => {
  const read = vi.fn<AtlasCaseExplanationOwner["read"]>();
  expect(() => createBusinessPartnerCaseTools({read})[0]!.validateArguments!(args, {})).toThrow();
  expect(read).not.toHaveBeenCalled();
});
it.each([{caseId: "another"}, {rowVersion: 8}])("rejects mismatched owner coordinates %j", async change => {
  const tool = createBusinessPartnerCaseTools({read: async () => ({...saved, ...change})})[1]!;
  await expect(tool.readHandler!.execute({context, arguments: {caseId: id, expectedRowVersion: 7}})).rejects.toMatchObject({code: "TOOL_DENIED"});
});
