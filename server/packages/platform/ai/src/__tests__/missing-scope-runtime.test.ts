import { AtlasScopeSelectionRequiredError } from "../errors.js";
import { expect, it } from "vitest";
import { localPromptTokenBound } from "@athyper/server-contract-ai";
import { AtlasAgentRuntime } from "../agent-runtime.js";

it("completes missing-scope guidance without a second model call", async () => {
  const binding = { providerId: "ollama", upstreamModelId: "qwen", bindingId: "b", bindingRevision: "1", publicModelId: "atlas-fast", allowedDataClasses: ["internal"], capabilities: { tools: true, maxContextTokens: 4096, maxOutputTokens: 1024 } };
  const evidence = {insight: {schemaVersion: 1, scope: {entityCode: "business_partner", fingerprint: "scope"}, coverage: {target: "record", state: "partial"}, evaluatedAt: "2026-09-09T00:00:00Z", freshness: "current", evidence: [], actions: [], findings: [{id: "scope", code: "scope_required", state: "not_evaluated", severity: "info", facts: {missingCompany: true}, ruleVersion: "1", evidenceIds: [], actionIds: []}]}};
  let calls = 0;
  const provider = { async *invoke({ prompt }: any) {
    calls++;
    expect(localPromptTokenBound(prompt) + prompt.maxOutputTokens).toBeLessThanOrEqual(4096);
    yield { kind: "response_started", providerRequestId: "p", actualModelId: "qwen" };
    if (calls === 1) {
      expect(prompt.tools).toHaveLength(1);
      yield { kind: "tool_call_complete", callId: "c", toolName: "bp_read_brief", input: {} };
    } else { throw new Error("Unexpected second model call"); }
    yield { kind: "usage", mode: "snapshot", final: true, usage: { inputTokens: 100, outputTokens: 10 } };
    yield { kind: "completed", reason: calls === 1 ? "tool_call" : "stop" };
  } };
  const runtime = new AtlasAgentRuntime({
    admission: { resolve: async () => ({ chatAllowed: true, persistenceAllowed: true, readToolsAllowed: true, allowedPublicModelIds: ["atlas-fast"], allowedDataClasses: ["internal"], policyRevision: "1" }) },
    modelPolicy: { evaluate: async () => ({ allowed: true, policyRevision: "1", promptRevision: "1" }) },
    bindings: { resolve: () => binding, resolveChain: () => [binding] }, providers: { resolve: () => provider },
    credentials: { resolve: async () => ({ secret: "test" }) },
    threads: { get: async () => ({ threadId: "t", status: "active", lastMessageSequence: 0 }), boundedHistory: async () => [] },
    runs: { get: async () => ({ status: "completed" }), begin: async () => ({ replayed: false, run: { runId: "r", outputMessageId: "m" } }), complete: async () => ({ status: "completed" }), fail: async () => null },
    ledger: { append: async () => {} }, prompts: { resolve: async () => ({ revision: "1", systemText: "Preserve this instruction" }) },
    tools: { definitions: async () => [{ name: "bp_read_brief", description: "Read brief", inputSchema: {} }], handle: async () => ({ preview: { proposalId: "p", summary: "Read", access: "read", risk: "low", confirmationRequired: false }, result: { outcome: "completed", data: evidence, sources: [] } }) },
    maxInputCharacters: 100, maxToolRounds: 1,
  } as never);
  const events = [];
  for await (const event of runtime.run({ context: { tenantId: "t", principalId: "p", planeKey: "neon", realmKey: "neon", requestId: "r", profileHash: "h", authEpoch: 1, permissions: { tenantId: "t", principalId: "p", planeKey: "neon", profileHash: "h" } }, threadId: "t", clientRequestId: "c", publicModelId: "atlas-fast", dataClass: "internal", userText: "Give me a brief", catalogPolicyRevision: "1" } as never)) events.push(event);
  expect(events.at(-1)?.event.type, JSON.stringify(events)).toBe("run.completed");
  expect(calls).toBe(1);
  expect(events.filter(e => e.event.type === "message.delta").map(e => (e.event as {text: string}).text).join("")).toContain("Readiness and eligibility have not been evaluated");
});

it("explains rejected chat scope names without executing a tool or failing the run", async () => {
  const binding = { providerId: "ollama", upstreamModelId: "qwen", bindingId: "b", bindingRevision: "1", publicModelId: "atlas-fast", allowedDataClasses: ["internal"], capabilities: { tools: true, maxContextTokens: 4096, maxOutputTokens: 1024 } };
  const evidence = {insight: {schemaVersion: 1, scope: {entityCode: "business_partner", fingerprint: "scope"}, coverage: {target: "record", state: "partial"}, evaluatedAt: "2026-09-09T00:00:00Z", freshness: "current", evidence: [], actions: [], findings: [{id: "scope", code: "scope_required", state: "not_evaluated", severity: "info", facts: {missingCompany: true}, ruleVersion: "1", evidenceIds: [], actionIds: []}]}};
  let calls = 0;
  const provider = { async *invoke({ prompt }: any) {
    calls++;
    expect(localPromptTokenBound(prompt) + prompt.maxOutputTokens).toBeLessThanOrEqual(4096);
    yield { kind: "response_started", providerRequestId: "p", actualModelId: "qwen" };
    if (calls === 1) {
      expect(prompt.tools).toHaveLength(1);
      yield { kind: "tool_call_complete", callId: "c", toolName: "bp_read_brief", input: {} };
    } else { throw new Error("Unexpected second model call"); }
    yield { kind: "usage", mode: "snapshot", final: true, usage: { inputTokens: 100, outputTokens: 10 } };
    yield { kind: "completed", reason: calls === 1 ? "tool_call" : "stop" };
  } };
  const runtime = new AtlasAgentRuntime({
    admission: { resolve: async () => ({ chatAllowed: true, persistenceAllowed: true, readToolsAllowed: true, allowedPublicModelIds: ["atlas-fast"], allowedDataClasses: ["internal"], policyRevision: "1" }) },
    modelPolicy: { evaluate: async () => ({ allowed: true, policyRevision: "1", promptRevision: "1" }) },
    bindings: { resolve: () => binding, resolveChain: () => [binding] }, providers: { resolve: () => provider },
    credentials: { resolve: async () => ({ secret: "test" }) },
    threads: { get: async () => ({ threadId: "t", status: "active", lastMessageSequence: 0 }), boundedHistory: async () => [] },
    runs: { get: async () => ({ status: "completed" }), begin: async () => ({ replayed: false, run: { runId: "r", outputMessageId: "m" } }), complete: async () => ({ status: "completed" }), fail: async () => null },
    ledger: { append: async () => {} }, prompts: { resolve: async () => ({ revision: "1", systemText: "Preserve this instruction" }) },
    tools: { definitions: async () => [{ name: "bp_read_brief", description: "Read brief", inputSchema: {} }], handle: async () => { throw new AtlasScopeSelectionRequiredError(); } },
    maxInputCharacters: 100, maxToolRounds: 1,
  } as never);
  const events = [];
  for await (const event of runtime.run({ context: { tenantId: "t", principalId: "p", planeKey: "neon", realmKey: "neon", requestId: "r", profileHash: "h", authEpoch: 1, permissions: { tenantId: "t", principalId: "p", planeKey: "neon", profileHash: "h" } }, threadId: "t", clientRequestId: "c", publicModelId: "atlas-fast", dataClass: "internal", userText: "Give me a brief", catalogPolicyRevision: "1" } as never)) events.push(event);
  expect(events.at(-1)?.event.type, JSON.stringify(events)).toBe("run.completed");
  expect(calls).toBe(1);
  expect(events.filter(e => e.event.type === "message.delta").map(e => (e.event as {text: string}).text).join("")).toContain("Typing organization or company names in chat does not apply");
});

it("completes registered section reads without a second provider call", async () => {
  const binding = { providerId: "ollama", upstreamModelId: "qwen", bindingId: "b", bindingRevision: "1", publicModelId: "atlas-fast", allowedDataClasses: ["internal"], capabilities: { tools: true, maxContextTokens: 4096, maxOutputTokens: 1024 } };
  const evidence = {section: "addresses", status: "ready", addresses: Array.from({length: 3}, (_, i) => ({address: `Saved address ${i + 1}`, locality: "London", countryCode: "GB"})), hasMore: false};
  let calls = 0;
  const provider = { async *invoke({ prompt }: any) {
    calls++;
    expect(localPromptTokenBound(prompt) + prompt.maxOutputTokens).toBeLessThanOrEqual(4096);
    yield { kind: "response_started", providerRequestId: "p", actualModelId: "qwen" };
    if (calls === 1) {
      expect(prompt.tools).toHaveLength(1);
      yield { kind: "tool_call_complete", callId: "c", toolName: "bp_read_addresses", input: {} };
    } else { throw new Error("Unexpected second model call"); }
    yield { kind: "usage", mode: "snapshot", final: true, usage: { inputTokens: 100, outputTokens: 10 } };
    yield { kind: "completed", reason: calls === 1 ? "tool_call" : "stop" };
  } };
  const runtime = new AtlasAgentRuntime({
    admission: { resolve: async () => ({ chatAllowed: true, persistenceAllowed: true, readToolsAllowed: true, allowedPublicModelIds: ["atlas-fast"], allowedDataClasses: ["internal"], policyRevision: "1" }) },
    modelPolicy: { evaluate: async () => ({ allowed: true, policyRevision: "1", promptRevision: "1" }) },
    bindings: { resolve: () => binding, resolveChain: () => [binding] }, providers: { resolve: () => provider },
    credentials: { resolve: async () => ({ secret: "test" }) },
    threads: { get: async () => ({ threadId: "t", status: "active", lastMessageSequence: 0 }), boundedHistory: async () => [] },
    runs: { get: async () => ({ status: "completed" }), begin: async () => ({ replayed: false, run: { runId: "r", outputMessageId: "m" } }), complete: async () => ({ status: "completed" }), fail: async () => null },
    ledger: { append: async () => {} }, prompts: { resolve: async () => ({ revision: "1", systemText: "Preserve this instruction" }) },
    tools: { definitions: async () => [{ name: "bp_read_addresses", description: "Read addresses", inputSchema: {}, entitySection: {entityCode: "business_partner", sectionKey: "addresses", aliases: ["address", "addresses"], resultKey: "addresses", label: "Business Partner addresses"} }], handle: async () => ({ preview: { proposalId: "p", summary: "Read", access: "read", risk: "low", confirmationRequired: false }, result: { outcome: "completed", data: evidence, sources: [] } }) },
    maxInputCharacters: 100, maxToolRounds: 1,
  } as never);
  const events = [];
  for await (const event of runtime.run({ context: { tenantId: "t", principalId: "p", planeKey: "neon", realmKey: "neon", requestId: "r", profileHash: "h", authEpoch: 1, permissions: { tenantId: "t", principalId: "p", planeKey: "neon", profileHash: "h" } }, threadId: "t", clientRequestId: "c", publicModelId: "atlas-fast", dataClass: "internal", userText: "summarize address for this business partner", catalogPolicyRevision: "1" } as never)) events.push(event);
  expect(events.at(-1)?.event.type, JSON.stringify(events)).toBe("run.completed");
  expect(calls).toBe(1);
  expect(events.filter(e => e.event.type === "message.delta").map(e => (e.event as {text: string}).text).join("")).toContain("Saved address 3");
});

it.each([false, true])("dispatches an explicit current-record read through authorization (denied=%s)", async (denied) => {
  const binding = { providerId: "ollama", upstreamModelId: "qwen", bindingId: "b", bindingRevision: "1", publicModelId: "atlas-fast", allowedDataClasses: ["internal"], capabilities: { tools: true, maxContextTokens: 4096, maxOutputTokens: 1024 } };
  const evidence = {section: "addresses", status: "ready", addresses: Array.from({length: 3}, (_, i) => ({address: `Saved address ${i + 1}`, locality: "London", countryCode: "GB"})), hasMore: false};
  let calls = 0;
  const provider = { async *invoke() { calls++; throw new Error("Provider must not run"); } };
  const page = {schemaVersion: 1, generationId: "11111111-1111-4111-8111-111111111111", locale: "en", kind: "record", entityCode: "business_partner", recordId: "22222222-2222-4222-8222-222222222222", dirty: false, section: "contacts"};
  const coordinate = {entityCode: "business_partner", recordId: page.recordId};
  const replayEvidence = {toolCode: "bp_read_addresses", arguments: {recordId: page.recordId}};
  let completion: any;
  let invocation: any;
  const runtime = new AtlasAgentRuntime({
    businessContexts: {resolve: async () => ({page, descriptorHash: "d", scopeFingerprint: "s"})},
    quota: {reserve: async () => { throw new Error("No model quota needed"); }},
    admission: { resolve: async () => ({ chatAllowed: true, persistenceAllowed: true, readToolsAllowed: true, allowedPublicModelIds: ["atlas-fast"], allowedDataClasses: ["internal"], policyRevision: "1" }) },
    modelPolicy: { evaluate: async () => ({ allowed: true, policyRevision: "1", promptRevision: "1" }) },
    bindings: { resolve: () => binding, resolveChain: () => [binding] }, providers: { resolve: () => provider },
    credentials: { resolve: async () => ({ secret: "test" }) },
    threads: { get: async () => ({ threadId: "t", status: "active", lastMessageSequence: 0 }), boundedHistory: async () => [] },
    runs: { get: async () => ({ status: "completed" }), begin: async () => ({ replayed: false, run: { runId: "r", outputMessageId: "m" } }), complete: async (value: any) => { completion = value; return {status: "completed"}; }, fail: async () => null },
    ledger: { append: async () => {} }, prompts: { resolve: async () => ({ revision: "1", systemText: "Preserve this instruction" }) },
    tools: { definitions: async () => [{ name: "bp_read_addresses", description: "Read addresses", inputSchema: {}, entitySection: {entityCode: "business_partner", sectionKey: "addresses", aliases: ["address", "addresses"], resultKey: "addresses", label: "Business Partner addresses"} }], handle: async (value: any) => { invocation = value; if (denied) throw new Error("Denied by owner"); return ({ replayEvidence, preview: { proposalId: "p", summary: "Read", access: "read", risk: "low", confirmationRequired: false }, result: { outcome: "completed", data: evidence, sources: [{coordinate}] } }); } },
    maxInputCharacters: 100, maxToolRounds: 1,
  } as never);
  const events = [];
  for await (const event of runtime.run({ context: { tenantId: "t", principalId: "p", planeKey: "neon", realmKey: "neon", requestId: "r", profileHash: "h", authEpoch: 1, permissions: { tenantId: "t", principalId: "p", planeKey: "neon", profileHash: "h" } }, threadId: "t", clientRequestId: "c", publicModelId: "atlas-fast", dataClass: "internal", userText: "summarize address for this business partner", catalogPolicyRevision: "1", businessContext: page } as never)) events.push(event);
  expect(invocation.arguments).toEqual({recordId: page.recordId});
  expect(invocation.mutationToolsAllowed).toBe(false);
  expect(invocation.allowedToolCodes).toEqual(["bp_read_addresses"]);
  expect(events.at(-1)?.event.type, JSON.stringify(events)).toBe(denied ? "run.failed" : "run.completed");
  expect(calls).toBe(0);
  if (denied) {
    expect(completion).toBeUndefined();
    expect(events.some(e => e.event.type === "message.delta")).toBe(false);
    return;
  }
  expect(completion.replayCompletion).toEqual({complete: true, reads: [replayEvidence]});
  expect(events.some(e => e.event.type === "source.cited")).toBe(true);
  expect(events.filter(e => e.event.type === "message.delta").map(e => (e.event as {text: string}).text).join("")).toContain("Saved address 3");
});
