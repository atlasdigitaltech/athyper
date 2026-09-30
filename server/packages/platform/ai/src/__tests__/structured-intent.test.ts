import { expect, it, vi } from "vitest";
import { resolveAtlasIntent } from "../structured-intent.js";
import { parseAtlasIntent, atlasGuidance } from "@athyper/server-contract-ai";
import { AtlasAgentRuntime } from "../agent-runtime.js";
import {
  AtlasServiceError,
  AtlasScopeSelectionRequiredError,
} from "../errors.js";
import { context as actor } from "./review-fixture.js";
const page = {
  schemaVersion: 1,
  kind: "record",
  entityCode: "business_partner",
  recordId: actor.tenantId,
  section: "overview",
  dirty: false,
  generationId: actor.tenantId,
  locale: "en",
} as const;
const tools = ["contacts", "addresses"].map((section) => ({
  name: `bp_read_${section}`,
  description: section,
  inputSchema: {},
  entitySection: {
    entityCode: page.entityCode,
    sectionKey: section,
    aliases: [section, section === "contacts" ? "contact" : "address"],
    resultKey: section,
    label: section,
  },
}));
it.each([
  "Please display this supplier's contacts",
  "Give me the contacts for this partner",
  "Tell me about this partner's contacts",
  "An overview of this partner's contacts please",
  "Could you list the contacts for this record?",
  "SHOW the CONTACTS for this partner",
  "Read the current contact",
  "Summarise this partner's contacts",
])("resolves admitted exact terms with varied wording: %s", (question) => {
  expect(resolveAtlasIntent(tools, question, page)).toMatchObject({
    kind: "read",
    capabilityIds: ["bp_read_contacts"],
  });
});
it.each([
  "Show Acme's contacts",
  "Delete this partner's contacts",
  "Don't show this partner's contacts",
  "Never read this partner's contacts",
  "Show this partner's contacts without emails",
  "Find contacts in France for this partner",
  "Can I purchase from this partner?",
  "What does this unknown term mean?",
])("does not turn unsupported wording into a direct read: %s", (question) => {
  const intent = resolveAtlasIntent(tools, question, page);
  // Unsupported owner-side filtering may be answered explicitly by the section renderer.
  if (question.includes("in France"))
    expect(intent.capabilityIds).toEqual(["bp_read_contacts"]);
  else expect(intent.kind).toBe("delegate");
});
it("clarifies ambiguity and never routes to an unadmitted tool or historical record", () => {
  expect(
    resolveAtlasIntent(
      tools,
      "Show this partner's contacts and addresses",
      page,
    ),
  ).toMatchObject({ kind: "clarify", reason: "ambiguous" });
  expect(
    resolveAtlasIntent([], "Show this partner's contacts", page).kind,
  ).toBe("delegate");
  expect(
    resolveAtlasIntent(tools, "Show this partner's contacts", {
      ...page,
      asOf: "2020-01-01",
    }).kind,
  ).toBe("delegate");
  expect(() =>
    parseAtlasIntent({
      schemaVersion: 1,
      kind: "read",
      strategy: "model",
      reason: "matched",
      capabilityIds: ["sql_query"],
    }),
  ).toThrow();
});
it.each([
  "ambiguous",
  "missing_scope",
  "assessment_scope",
  "access_denied",
  "execution_denied",
] as const)(
  "persists %s guidance with no provider, quota, fabricated citations or tool results",
  async (code) => {
    const complete = vi.fn(async () => ({ status: "completed" }));
    const begin = vi.fn(async () => ({
      replayed: false,
      run: { runId: actor.tenantId, outputMessageId: actor.principalId },
    }));
    const invoke = vi.fn(async function* () {
      throw Error("No provider expected");
    });
    const reserve = vi.fn(async () => {
      throw Error("No quota expected");
    });
    const handle = vi.fn(async () => {
      throw new AtlasServiceError("TOOL_DENIED", "PRIVATE_REASON");
    });
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
    const runtime = new AtlasAgentRuntime({
      businessContexts: {
        resolve: async () => {
          if (code === "missing_scope")
            throw new AtlasScopeSelectionRequiredError();
          if (code === "access_denied")
            throw new AtlasServiceError("PERMISSION_DENIED", "PRIVATE_REASON");
          return { page, descriptorHash: "d", scopeFingerprint: "s" };
        },
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
      providers: { resolve: () => ({ invoke }) },
      credentials: { resolve: async () => ({ secret: "unused" }) },
      threads: {
        get: async () => ({
          threadId: actor.tenantId,
          status: "active",
          lastMessageSequence: 0,
        }),
        boundedHistory: async () => [],
      },
      runs: {
        get: async () => ({ status: "completed" }),
        begin,
        complete,
        fail: async () => null,
      },
      ledger: { append: async () => {} },
      prompts: {
        resolve: async () => ({ revision: "1", systemText: "policy" }),
      },
      quota: { reserve },
      tools: {
        definitions: async () =>
          code === "assessment_scope"
            ? [
                {
                  name: "bp_check_eligibility",
                  description: "eligibility",
                  inputSchema: { type: "object" },
                },
              ]
            : tools,
        handle,
      },
      maxInputCharacters: 1000,
      maxToolRounds: 1,
    } as never);
    const events = [];
    for await (const event of runtime.run({
      context: actor,
      threadId: actor.tenantId,
      clientRequestId: "c",
      publicModelId: "atlas-fast",
      dataClass: "internal",
      userText:
        code === "assessment_scope"
          ? "Can we purchase from this supplier?"
          : code === "ambiguous"
            ? "Show this partner's contacts and addresses"
            : "Show this partner's contacts",
      catalogPolicyRevision: "1",
      businessContext: page,
    }))
      events.push(event);
    expect(events.at(-1)?.event.type, JSON.stringify(events)).toBe(
      "run.completed",
    );
    expect(JSON.stringify(events)).toContain(
      atlasGuidance[
        code === "execution_denied"
          ? "access_denied"
          : code === "assessment_scope"
            ? "missing_scope"
            : code
      ],
    );
    expect(JSON.stringify(events)).not.toContain("PRIVATE_REASON");
    expect(
      events.every((e) => e.contextGenerationId === page.generationId),
    ).toBe(true);
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        replayCompletion: {
          complete: true,
          reads: [],
          guidance:
            code === "execution_denied"
              ? "access_denied"
              : code === "assessment_scope"
                ? "missing_scope"
                : code,
        },
      }),
    );
    expect(begin).toHaveBeenCalledWith(
      expect.objectContaining({
        replayInput: expect.objectContaining({
          intent: expect.objectContaining({ schemaVersion: 1 }),
        }),
      }),
    );
    expect(invoke).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    if (code !== "execution_denied") expect(handle).not.toHaveBeenCalled();
  },
);

it("recognizes an unavailable registered section without revealing capability names or invoking it", async () => {
  const { AtlasRegisteredToolCoordinator } =
    await import("../runtime-tool-coordinator.js");
  const { AtlasToolRegistry } = await import("../tool-service.js");
  const { createAtlasEntitySectionTool } =
    await import("../entity-section-tool.js");
  const tool = createAtlasEntitySectionTool({
    entityCode: page.entityCode,
    planeKey: "neon",
    sectionKey: "contacts",
    toolCode: "bp_read_contacts",
    aliases: ["contacts"],
    label: "Contacts",
    admissionField: "code",
    readPermission: "private.contacts",
    resultKey: "items",
    maxRows: 1,
    fields: { name: { type: "string" } },
  });
  const coordinator = new AtlasRegisteredToolCoordinator(
    new AtlasToolRegistry([tool]),
    {} as never,
  );
  const admitted = await coordinator.definitions(actor, {
    readToolsAllowed: true,
    mutationToolsAllowed: false,
  });
  expect(admitted).toEqual([]);
  expect(
    coordinator.resolveIntent(
      actor,
      "Show this partner's contacts",
      { page, descriptorHash: "d", scopeFingerprint: "s" },
      admitted,
    ),
  ).toEqual({
    schemaVersion: 1,
    kind: "denied",
    strategy: "authorization",
    reason: "access_denied",
    capabilityIds: [],
  });
});
