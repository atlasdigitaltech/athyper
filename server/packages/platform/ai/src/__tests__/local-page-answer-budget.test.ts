import { expect, it } from "vitest";
import { localPromptTokenBound } from "@athyper/server-contract-ai";
import { AtlasAgentRuntime } from "../agent-runtime.js";

it("finishes a page read with intact evidence when another tool round cannot fit", async () => {
  const binding = { providerId: "ollama", upstreamModelId: "qwen", bindingId: "b", bindingRevision: "1", publicModelId: "atlas-fast", allowedDataClasses: ["internal"], capabilities: { tools: true, maxContextTokens: 4096, maxOutputTokens: 1024 } };
  const evidence = { verified: "e".repeat(1800) };
  let calls = 0;
  const provider = { async *invoke({ prompt }: any) {
    calls++;
    expect(localPromptTokenBound(prompt) + prompt.maxOutputTokens).toBeLessThanOrEqual(4096);
    yield { kind: "response_started", providerRequestId: "p", actualModelId: "qwen" };
    if (calls === 1) {
      expect(prompt.tools).toHaveLength(1);
      yield { kind: "tool_call_complete", callId: "c", toolName: "read", input: {} };
    } else {
      expect(prompt.tools).toBeUndefined();
      expect(prompt.messages.at(-1).content[0].result).toEqual(evidence);
      expect(JSON.stringify(prompt.messages)).toContain("Preserve this instruction");
      yield { kind: "text_delta", text: "Grounded answer" };
    }
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
    tools: { definitions: async () => [{ name: "read", description: "d".repeat(1700), inputSchema: {} }], handle: async () => ({ preview: { proposalId: "p", summary: "Read", access: "read", risk: "low", confirmationRequired: false }, result: { outcome: "completed", data: evidence, sources: [] } }) },
    maxInputCharacters: 100, maxToolRounds: 1,
  } as never);
  const events = [];
  for await (const event of runtime.run({ context: { tenantId: "t", principalId: "p", planeKey: "neon", realmKey: "neon", requestId: "r", profileHash: "h", authEpoch: 1, permissions: { tenantId: "t", principalId: "p", planeKey: "neon", profileHash: "h" } }, threadId: "t", clientRequestId: "c", publicModelId: "atlas-fast", dataClass: "internal", userText: "Read", catalogPolicyRevision: "1" } as never)) events.push(event);
  expect(events.at(-1)?.event.type).toBe("run.completed");
  expect(calls).toBe(2);
});
