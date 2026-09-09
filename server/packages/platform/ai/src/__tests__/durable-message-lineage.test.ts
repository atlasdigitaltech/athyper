import { expect, it, vi } from "vitest";
import {
  AtlasDurableMessageAuthorizer,
  atlasEvidenceHash,
  createAtlasMessageLineage,
  type AtlasLineageMessage,
} from "../message-lineage.js";
import { AtlasThreadService } from "../thread-service.js";
import { AtlasToolRegistry, AtlasToolService } from "../tool-service.js";
import { createBusinessPartnerAtlasTools } from "../business-partner-tools.js";
import { context as base } from "./review-fixture.js";
import type {
  AtlasContentBlock,
  AtlasMessage,
  AtlasReadReplayEvidence,
  AtlasThreadRepository,
} from "@athyper/server-contract-ai";
const context = {
  ...base,
  permissions: {
    ...base.permissions,
    allowed: ["neon.ai.agent.use", "neon.relationship.business_partner.read"],
  },
};
const text = (value: string): readonly AtlasContentBlock[] => [
  { type: "text", text: value },
];
const evidence: AtlasReadReplayEvidence = {
  toolCode: "bp_read_summary",
  toolVersion: "1",
  arguments: { recordId: "10000000-0000-4000-8000-000000000001" },
  policyRevision: "p1",
  resultHash: "hash",
};
function fixture() {
  const rows = new Map<string, AtlasLineageMessage>();
  for (let i = 1; i <= 4; i++) {
    const content = text(
      i === 4 ? "Follow-up mixed with SECRET-SENTINEL" : `message ${i}`,
    );
    rows.set(`m${i}`, {
      messageId: `m${i}`,
      threadId: "thread",
      sequence: i,
      content,
      lineage: createAtlasMessageLineage(
        context,
        content,
        i === 1 ? null : `m${i - 1}`,
        { schemaVersion: 1 },
        i === 2 ? [evidence] : [],
      ),
    });
  }
  const revalidate = vi.fn(async () => true);
  const reader = {
    read: vi.fn(async (_c, id: string) => rows.get(id) ?? null),
  };
  const authorizer = new AtlasDurableMessageAuthorizer({
    reader,
    reads: { revalidate },
  });
  return { rows, revalidate, reader, authorizer };
}
it("authorizes durable ancestry after constructing a new service, and rechecks each use", async () => {
  const f = fixture();
  expect(await f.authorizer.authorize({ context, messageId: "m4" })).toBe(true);
  expect(
    await new AtlasDurableMessageAuthorizer({
      reader: f.reader,
      reads: { revalidate: f.revalidate },
    }).authorize({ context, messageId: "m4" }),
  ).toBe(true);
  f.revalidate.mockResolvedValue(false);
  expect(await f.authorizer.authorize({ context, messageId: "m4" })).toBe(
    false,
  );
  expect(f.revalidate).toHaveBeenCalledTimes(3);
});
it("withholds affected mixed prose on every history/export/model/retry surface after record revocation", async () => {
  const f = fixture();
  const items: AtlasMessage[] = [...f.rows.values()].map((r) => ({
    ...r,
    role: r.sequence % 2 ? "user" : "assistant",
    status: "completed",
    runId: "run",
    parentMessageId: null,
    createdAt: "2026-09-09T00:00:00Z",
    terminalAt: "2026-09-09T00:00:00Z",
  }));
  const threads = new AtlasThreadService({
    repository: {
      get: async () => ({
        threadId: "thread",
        tenantId: context.tenantId,
        planeKey: context.planeKey,
        status: "active",
        title: null,
      }),
      listMessages: async () => ({ items, nextCursor: null }),
    } as unknown as AtlasThreadRepository,
    authorizer: { authorize: async () => true },
    disclosure: f.authorizer,
    retention: {
      resolve: async () => ({
        policyId: "p",
        retentionDays: 30,
        displayText: "30",
      }),
    },
    maxHistoryMessages: 10,
    maxHistoryBytes: 10000,
    maxExportMessages: 100,
  });
  expect(JSON.stringify(await threads.messages(context, "thread"))).toContain(
    "SECRET-SENTINEL",
  );
  f.revalidate.mockResolvedValue(false);
  for (const result of [
    await threads.messages(context, "thread"),
    await threads.export(context, "thread"),
    await threads.boundedHistory(context, "thread"),
  ])
    expect(JSON.stringify(result)).not.toContain("SECRET-SENTINEL");
  expect(await threads.canDiscloseMessage(context, "m4")).toBe(false);
});
it("denies changed authority, missing/legacy/tampered lineage, invalid ancestry and provider failures", async () => {
  for (const change of [
    { authEpoch: 2 },
    { profileHash: "changed" },
    { tenantId: "other" },
    { principalId: "other" },
    { planeKey: "mesh" as const },
  ]) {
    expect(
      await fixture().authorizer.authorize({
        context: { ...context, ...change },
        messageId: "m4",
      }),
    ).toBe(false);
  }
  for (const change of [
    { lineage: null },
    { content: text("tampered") },
    { threadId: "other" },
    { sequence: 5 },
  ]) {
    const f = fixture();
    f.rows.set("m2", { ...f.rows.get("m2")!, ...change });
    expect(await f.authorizer.authorize({ context, messageId: "m4" })).toBe(
      false,
    );
  }
  for (const change of [
    { complete: false },
    { parentMessageId: "m4" },
    { parentMessageId: null },
  ]) {
    const f = fixture(),
      row = f.rows.get("m2")!;
    f.rows.set("m2", { ...row, lineage: { ...row.lineage!, ...change } });
    expect(await f.authorizer.authorize({ context, messageId: "m4" })).toBe(
      false,
    );
  }
  const f = fixture();
  f.revalidate.mockRejectedValue(Error("offline"));
  expect(await f.authorizer.authorize({ context, messageId: "m4" })).toBe(
    false,
  );
});
it("reauthorizes attachment extraction and resolved business scope, including revision changes", async () => {
  const content = text("attachment answer"),
    attachment = {
      attachmentId: "a",
      fileName: "a.txt",
      contentType: "text/plain",
      sha256: "x",
      text: "private",
    };
  const page = { schemaVersion: 1 } as never;
  const resolved = { page, descriptorHash: "d1", scopeFingerprint: "s1" };
  const lineage = createAtlasMessageLineage(context, content, null, {
    schemaVersion: 1,
    businessContext: page,
    businessContextHash: atlasEvidenceHash(resolved),
    attachments: {
      attachmentContextId: "prompt",
      attachmentIds: ["a"],
      dataClass: "internal",
      resultHash: atlasEvidenceHash([attachment]),
    },
  });
  const resolve = vi.fn(async () => [attachment]),
    resolveContext = vi.fn(async () => resolved);
  const authorizer = new AtlasDurableMessageAuthorizer({
    reader: {
      read: async () => ({
        messageId: "m",
        threadId: "t",
        sequence: 1,
        content,
        lineage,
      }),
    },
    attachments: { resolve },
    businessContexts: { resolve: resolveContext },
  });
  expect(await authorizer.authorize({ context, messageId: "m" })).toBe(true);
  resolveContext.mockResolvedValue({ ...resolved, descriptorHash: "d2" });
  expect(await authorizer.authorize({ context, messageId: "m" })).toBe(false);
  resolveContext.mockResolvedValue(resolved);
  resolve.mockResolvedValue([{ ...attachment, text: "changed" }]);
  expect(await authorizer.authorize({ context, messageId: "m" })).toBe(false);
});
it("re-executes only authorized reads and compares full projected output and source revisions", async () => {
  const source = {
    entityCode: "business_partner",
    recordId: evidence.arguments.recordId as string,
    revision: "content-sha256:1",
    descriptorHash: "d1",
  };
  const query = vi.fn(async () => ({
    rows: [{ code: "BP1", display_name: "Acme" }],
    sources: [source],
    responseBytes: 30,
    authorizationProfileHash: context.profileHash,
  }));
  const authority = {
    authorize: vi.fn(async () => ({ allowed: true, policyRevision: "p1" })),
  };
  const command = vi.fn();
  const service = new AtlasToolService({
    registry: new AtlasToolRegistry(createBusinessPartnerAtlasTools()),
    authority,
    records: { query },
    proposals: {} as never,
    confirmations: {} as never,
    commands: { execute: command },
  });
  const receipt = {
    ...evidence,
    resultHash: atlasEvidenceHash({
      data: {
        records: [{ code: "BP1", display_name: "Acme" }],
        readiness: "not_evaluated",
      },
      sources: [{ coordinate: source }],
    }),
  };
  expect(await service.revalidate(context, receipt)).toBe(true);
  query.mockResolvedValue({
    rows: [{ code: "BP1", display_name: "changed" }],
    sources: [source],
    responseBytes: 30,
    authorizationProfileHash: context.profileHash,
  });
  expect(await service.revalidate(context, receipt)).toBe(false);
  authority.authorize.mockResolvedValue({
    allowed: false,
    policyRevision: "p1",
  });
  expect(await service.revalidate(context, receipt)).toBe(false);
  expect(
    await service.revalidate(context, {
      ...receipt,
      toolCode: "bp_submit_case",
    }),
  ).toBe(false);
  expect(command).not.toHaveBeenCalled();
});

it("compacts authorized prose without turning prior tool data into assistant speech", async () => {
  const { compactAtlasReplayContent } = await import("../message-lineage.js");
  const blocks: AtlasContentBlock[] = [
    { type: "tool_use", toolName: "bp_read_summary", callId: "old-call", input: { recordId: "bp" } },
    { type: "tool_result", toolName: "bp_read_summary", callId: "old-call", result: { name: "Acme", readiness: "not_evaluated" } },
    ...Array.from("Acme is not assessed.").map(text => ({ type: "text" as const, text })),
  ];
  const compact = compactAtlasReplayContent(blocks);
  expect(compact).toHaveLength(1);
  expect(JSON.stringify(compact)).not.toMatch(/not_evaluated|Prior tool data|bp_read_summary/);
  expect(JSON.stringify(compact)).toContain('Acme is not assessed.');
  expect(JSON.stringify(compact)).not.toContain('old-call');
  expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(blocks).length);
});

it.each([{ factCharacters: 200, unsolicitedTool: false }, { factCharacters: 800, unsolicitedTool: false }, { factCharacters: 800, unsolicitedTool: true }])("retains authorized history and enforces the budgeted tool catalogue: %j", async ({ factCharacters, unsolicitedTool }) => {
  const { AtlasAgentRuntime } = await import("../agent-runtime.js");
  const { localPromptTokenBound } = await import("@athyper/server-contract-ai");
  const binding = { providerId: "ollama", upstreamModelId: "qwen", bindingId: "b", bindingRevision: "1", publicModelId: "atlas-fast", allowedDataClasses: ["internal"], capabilities: { tools: true, maxContextTokens: 4096, maxOutputTokens: 1024 } };
  let invoked = false, toolHandled = false;
  const provider = { async *invoke({ prompt }: any) {
    invoked = true;
    expect(JSON.stringify(prompt.messages)).toContain("Grounded Acme fact");
    expect(localPromptTokenBound(prompt) + prompt.maxOutputTokens).toBeLessThanOrEqual(4096);
    expect(prompt.maxOutputTokens).toBeLessThan(1024);
    if (factCharacters === 800) expect(prompt.tools).toBeUndefined();
    yield { kind: "response_started", providerRequestId: "p", actualModelId: "qwen" };
    if (unsolicitedTool) yield { kind: "tool_call_complete", callId: "unoffered", toolName: "read", input: {} };
    else yield { kind: "text_delta", text: "Acme" };
    yield { kind: "usage", mode: "snapshot", final: true, usage: { inputTokens: 100, outputTokens: 10 } };
    yield { kind: "completed", reason: "stop" };
  } };
  const runtime = new AtlasAgentRuntime({
    admission: { resolve: async () => ({ chatAllowed: true, persistenceAllowed: true, readToolsAllowed: true, allowedPublicModelIds: ["atlas-fast"], allowedDataClasses: ["internal"], policyRevision: "1" }) },
    modelPolicy: { evaluate: async () => ({ allowed: true, policyRevision: "1", promptRevision: "1" }) },
    bindings: { resolve: () => binding, resolveChain: () => [binding] }, providers: { resolve: () => provider }, credentials: { resolve: async () => ({ secret: "test" }) },
    threads: { get: async () => ({ threadId: "t", status: "active", lastMessageSequence: 2 }), boundedHistory: async () => [{ role: "user", content: text("Earlier question " + "q".repeat(100)) }, { role: "assistant", content: text("Grounded Acme fact " + "f".repeat(factCharacters)) }] },
    runs: { get: async () => ({ status: "completed" }), begin: async () => ({ replayed: false, run: { runId: "r", outputMessageId: "m" } }), complete: async () => ({ status: "completed" }), fail: async () => null },
    ledger: { append: async () => {} }, prompts: { resolve: async () => ({ revision: "1", systemText: "s".repeat(1200) }) },
    tools: { definitions: async () => [{ name: "read", description: "d".repeat(800), inputSchema: {} }], handle: async () => { toolHandled = true; throw Error("Unexpected tool call"); } }, maxInputCharacters: 100, maxToolRounds: 1,
  } as never);
  const events = [];
  for await (const event of runtime.run({ context, threadId: "t", clientRequestId: "c", publicModelId: "atlas-fast", dataClass: "internal", userText: "What was the name?", catalogPolicyRevision: "1" })) events.push(event);
  expect(events.at(-1)?.event.type).toBe(unsolicitedTool ? "run.failed" : "run.completed");
  expect(toolHandled).toBe(false);
  expect(invoked).toBe(true);
});
