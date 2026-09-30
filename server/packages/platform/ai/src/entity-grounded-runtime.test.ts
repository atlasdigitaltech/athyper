import { expect, it } from "vitest";
import { AtlasAgentRuntime } from "./agent-runtime.js";
import { context } from "./__tests__/review-fixture.js";
it.each([
  { read: false, lookup: true },
  { read: true, lookup: true },
  { read: false, lookup: false },
])(
  "requires Entity evidence before releasing business facts (tool read: %s)",
  async ({ read, lookup }) => {
    const page = {
      schemaVersion: 1,
      kind: "record",
      entityCode: "example",
      recordId: context.tenantId,
      generationId: context.tenantId,
      section: "overview",
      dirty: false,
      locale: "en",
    } as const;
    const binding = {
      providerId: "ollama",
      upstreamModelId: "qwen",
      bindingId: "b",
      bindingRevision: "1",
      publicModelId: "atlas-fast",
      allowedDataClasses: ["internal"],
      capabilities: {
        tools: true,
        maxContextTokens: 4096,
        maxOutputTokens: 1024,
      },
    };
    const seen: string[] = [];
    let persisted: any[] = [];
    const runtime = new AtlasAgentRuntime({
      businessContexts: {
        resolve: async () => ({
          page,
          descriptorHash: "published",
          scopeFingerprint: "scope",
        }),
      },
      admission: {
        resolve: async () => ({
          chatAllowed: true,
          persistenceAllowed: true,
          readToolsAllowed: true,
          allowedPublicModelIds: ["atlas-fast"],
          allowedDataClasses: ["internal"],
          policyRevision: "1",
        }),
      },
      modelPolicy: {
        evaluate: async () => ({
          allowed: true,
          policyRevision: "1",
          promptRevision: "1",
        }),
      },
      bindings: { resolve: () => binding, resolveChain: () => [binding] },
      providers: {
        resolve: () => ({
          async *invoke({ prompt }: any) {
            if (lookup) {
              expect(JSON.stringify(prompt.messages)).toContain(
                "entity_catalogue",
              );
              expect(
                prompt.tools.some(
                  (tool: any) => tool.name === "entity_read_record",
                ),
              ).toBe(true);
            } else expect(prompt.tools).toBeUndefined();
            yield {
              kind: "response_started",
              providerRequestId: "p",
              actualModelId: "qwen",
            };
            yield { kind: "text_delta", text: "UNVERIFIED_MODEL_FACT" };
            if (read)
              yield {
                kind: "tool_call_complete",
                callId: "read",
                toolName: "entity_lookup",
                input: {},
              };
            yield {
              kind: "usage",
              mode: "snapshot",
              final: true,
              usage: { inputTokens: 100, outputTokens: 10 },
            };
            yield { kind: "completed", reason: read ? "tool_call" : "stop" };
          },
        }),
      },
      credentials: { resolve: async () => ({ secret: "test" }) },
      threads: {
        get: async () => ({
          threadId: "t",
          status: "active",
          lastMessageSequence: 0,
        }),
        boundedHistory: async () => [],
        canDiscloseMessage: async () => true,
      },
      runs: {
        get: async () => ({ status: "completed" }),
        begin: async () => ({
          replayed: false,
          run: { runId: "r", inputMessageId: "i", outputMessageId: "m" },
        }),
        complete: async (input: any) => {
          persisted = input.assistantContent;
          return { status: "completed" };
        },
        fail: async () => null,
      },
      ledger: { append: async () => {} },
      prompts: {
        resolve: async () => ({
          revision: "1",
          systemText: "Use authorized evidence",
        }),
      },
      tools: {
        definitions: async () =>
          !lookup
            ? []
            : [
                ...["entity_discover", "entity_lookup"].map((name) => ({
                  name,
                  description: name,
                  inputSchema: {},
                })),
                {
                  name: "entity_read_record",
                  description: "Read current record",
                  inputSchema: {},
                  entitySection: {
                    entityCode: "example",
                    sectionKey: "record_summary",
                    aliases: ["overview"],
                    resultKey: "items",
                    label: "Record summary",
                  },
                },
              ],
        handle: async ({ toolCode }: any) => {
          seen.push(toolCode);
          return {
            preview: {
              proposalId: "p",
              summary: "Read",
              access: "read",
              risk: "low",
              confirmationRequired: false,
            },
            result: {
              outcome: "completed",
              data:
                toolCode === "entity_discover"
                  ? {
                      kind: "entity_catalogue",
                      items: [{ entityCode: "example" }],
                    }
                  : {
                      kind: "entity_lookup",
                      entityCode: "example",
                      match: "one",
                      items: [
                        {
                          recordId: "id",
                          fields: [
                            {
                              key: "dial",
                              label: "Calling code",
                              value: "999",
                            },
                          ],
                        },
                      ],
                    },
              sources: [],
            },
          };
        },
      },
      maxInputCharacters: 100,
      maxToolRounds: 3,
    } as never);
    const events = [];
    for await (const e of runtime.run({
      context,
      threadId: "t",
      clientRequestId: "c",
      publicModelId: "atlas-fast",
      dataClass: "internal",
      userText: "Explain overview",
      catalogPolicyRevision: "1",
      ...(!lookup ? { businessContext: page } : {}),
    }))
      events.push(e.event);
    if (lookup) expect(seen[0]).toBe("entity_discover");
    else expect(seen).toEqual([]);
    expect(JSON.stringify(events)).not.toContain("UNVERIFIED_MODEL_FACT");
    expect(JSON.stringify(persisted)).not.toContain("UNVERIFIED_MODEL_FACT");
    expect(events.at(-1)?.type).toBe("run.completed");
    if (read) {
      expect(seen).toEqual(["entity_discover", "entity_lookup"]);
      expect(JSON.stringify(events)).toContain("Calling code: 999");
    } else
      expect(JSON.stringify(events)).toContain(
        "cannot answer this from general knowledge",
      );
  },
);
