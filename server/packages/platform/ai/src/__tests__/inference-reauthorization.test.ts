import { expect, it } from "vitest";
import { AtlasAgentRuntime } from "../agent-runtime.js";
import type {
  AtlasProviderInvocation,
  AtlasUsageLedgerEntry,
} from "@athyper/server-contract-ai";

it.each([
  "admission",
  "admission-revision",
  "model-policy",
  "model-revision",
  "thread",
  "lineage",
])(
  "denies queued inference after %s changes and retains content-free failure diagnostics",
  async (change) => {
    let revoked = false,
      calls = 0,
      disclosures = 0;
    const ledger: AtlasUsageLedgerEntry[] = [];
    const digest = "sha256:" + "a".repeat(64);
    const binding = {
      providerId: "ollama",
      credentialOwnerId: "local",
      upstreamModelId: "qwen3:8b",
      bindingId: "b",
      bindingRevision: digest,
      publicModelId: "atlas-re-1.0-local",
      allowedDataClasses: ["internal"],
      capabilities: {
        tools: false,
        maxContextTokens: 4096,
        maxOutputTokens: 128,
      },
    };
    const runtime = new AtlasAgentRuntime({
      admission: {
        resolve: async () => ({
          chatAllowed: !(revoked && change === "admission"),
          persistenceAllowed: true,
          allowedPublicModelIds: ["atlas-re-1.0-local"],
          allowedDataClasses: ["internal"],
          policyRevision:
            revoked && change === "admission-revision"
              ? "changed"
              : "admission-v1",
        }),
      },
      modelPolicy: {
        evaluate: async () => ({
          allowed: !(revoked && change === "model-policy"),
          policyRevision:
            revoked && change === "model-revision" ? "changed" : "model-v1",
          promptRevision: "p1",
        }),
      },
      bindings: { resolve: () => binding, resolveChain: () => [binding] },
      providers: {
        resolve: () => ({
          async *invoke(input: AtlasProviderInvocation) {
            calls++;
            expect(await input.reauthorize?.()).toBe(true);
            revoked = true;
            expect(await input.reauthorize?.()).toBe(false);
            yield {
              kind: "failed",
              error: {
                errorClass: "permission",
                code: "authorization_changed",
                safeMessage: "Unavailable",
                retryable: false,
                diagnostics: {
                  modelDigest: digest,
                  queueWaitMs: 42,
                  loadDurationMs: 12,
                  readinessChecks: 2,
                },
              },
            };
          },
        }),
      },
      credentials: {
        resolve: async () => ({
          ownerId: "local",
          authMode: "local_transport",
        }),
      },
      threads: {
        get: async () => ({
          threadId: "t",
          status: revoked && change === "thread" ? "archived" : "active",
          lastMessageSequence: 0,
        }),
        boundedHistory: async () => [],
        canDiscloseMessage: async (_context: unknown, id: string) => {
          disclosures++;
          expect(id).toBe("input");
          return !(revoked && change === "lineage");
        },
      },
      runs: {
        get: async () => ({ status: "failed" }),
        begin: async () => ({
          replayed: false,
          run: {
            runId: "r",
            inputMessageId: "input",
            outputMessageId: "output",
          },
        }),
        fail: async () => null,
      },
      ledger: {
        append: async (entry: AtlasUsageLedgerEntry) => {
          ledger.push(entry);
        },
      },
      prompts: {
        resolve: async () => ({ revision: "p1", systemText: "Synthetic" }),
      },
      maxInputCharacters: 100,
      maxToolRounds: 0,
    } as never);
    const events = [];
    for await (const event of runtime.run({
      context: {
        tenantId: "t",
        principalId: "p",
        planeKey: "neon",
        realmKey: "neon",
        requestId: "r",
        profileHash: "h",
        authEpoch: 1,
        permissions: {
          tenantId: "t",
          principalId: "p",
          planeKey: "neon",
          profileHash: "h",
        },
      },
      threadId: "t",
      clientRequestId: "c",
      publicModelId: "atlas-re-1.0-local",
      dataClass: "internal",
      userText: "Synthetic question",
      catalogPolicyRevision: "admission-v1",
    } as never))
      events.push(event);
    expect(events.at(-1)?.event).toMatchObject({
      type: "run.failed",
      code: "authorization_changed",
      retryable: false,
    });
    expect(events.some((e) => e.event.type === "message.delta")).toBe(false);
    expect(calls).toBe(1);
    expect(disclosures).toBeGreaterThan(0);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      errorClass: "permission",
      errorCode: "authorization_changed",
      readinessDiagnostics: {
        modelDigest: digest,
        queueWaitMs: 42,
        loadDurationMs: 12,
        readinessChecks: 2,
      },
    });
    expect(JSON.stringify(ledger)).not.toContain("Synthetic question");
  },
);
