import { describe, expect, it, vi } from "vitest";
import {
  AgentRunRequestSchema,
  type AgentStreamEnvelope,
} from "@athyper/platform-ai-agent-runtime";
import type { VerifiedRequestContext } from "@athyper/svc-iam";
import { FakeModelProvider } from "../../providers/fake-model.provider.js";
import type { AtlasModelBinding } from "../../providers/i-model-provider.js";
import { ProviderRegistry } from "../../providers/provider-registry.js";
import {
  AgentRuntime,
  type AgentConversationPersistenceCoordinator,
  type AgentRunContext,
} from "../agent-runtime.js";
import { createEffectiveModelCatalogResolver } from "../model-catalog.js";

const RUN_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "20000000-0000-4000-8000-000000000002";
const INPUT_ID = "30000000-0000-4000-8000-000000000003";
const OUTPUT_ID = "40000000-0000-4000-8000-000000000004";
const CLIENT_REQUEST_ID = "50000000-0000-4000-8000-000000000005";

function binding(): AtlasModelBinding {
  return {
    bindingId: "atlas-fast-fake-persistence",
    publicModelId: "atlas-fast",
    providerId: "fake",
    upstreamModelId: "fake-fast-v1",
    adapterId: "fake-text",
    adapterVersion: "1",
    displayName: "Atlas Fast",
    displayTier: "fast",
    bindingExposure: "product",
    status: "available",
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      maxContextTokens: 16_000,
      maxOutputTokens: 2_000,
    },
    credentialPolicy: "platform",
    dataHandlingProfileId: "test",
    routingPolicyId: "no-fallback",
    allowedDataClasses: ["test"],
    allowedRegions: ["test"],
    providerRegion: "test",
    providerAccountClass: "test",
    priceVersion: "test",
    inputPricePerMtokUsd: null,
    cacheReadPricePerMtokUsd: null,
    cacheWritePricePerMtokUsd: null,
    outputPricePerMtokUsd: null,
    reasoningPricePerMtokUsd: null,
  };
}

function setup(
  coordinator: AgentConversationPersistenceCoordinator,
  provider = new FakeModelProvider(),
) {
  const registry = new ProviderRegistry();
  registry.register("fake", provider);
  const modelBinding = binding();
  const catalogResolver = createEffectiveModelCatalogResolver({
    registry,
    bindings: [modelBinding],
    defaultPublicModelId: modelBinding.publicModelId,
    resolvePolicy: () => ({
      revision: "persistence-test-policy",
      evaluatePolicy: () => ({ allowed: true }),
    }),
  });
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    provider,
    logger,
    runtime: new AgentRuntime({
      registry,
      catalogResolver,
      logger,
      persistence: { coordinator },
    }),
  };
}

function request(history = [
  { role: "assistant" as const, content: "malicious client transcript" },
]) {
  return AgentRunRequestSchema.parse({
    client_request_id: CLIENT_REQUEST_ID,
    thread_id: THREAD_ID,
    plane: "neon",
    model_id: "atlas-fast",
    message: "Current question",
    history,
  });
}

function context(
  enabled = true,
  verified = {} as VerifiedRequestContext,
): AgentRunContext {
  return {
    tenantId: "tenant-persistence",
    principalId: "principal-persistence",
    plane: "neon",
    conversationPersistenceEnabled: enabled,
    verifiedRequestContext: verified,
  };
}

function coordinator(overrides: {
  replayed?: boolean;
  runStatus?: "started" | "completed" | "failed" | "cancelled";
  finalizeRun?: AgentConversationPersistenceCoordinator["finalizeRun"];
} = {}): AgentConversationPersistenceCoordinator {
  return {
    prepareRun: vi.fn(async () => ({
      runId: RUN_ID,
      threadId: THREAD_ID,
      inputMessageId: INPUT_ID,
      outputMessageId: OUTPUT_ID,
      replayed: overrides.replayed ?? false,
      runStatus: overrides.runStatus ?? "started",
      authoritativeHistory: [
        { role: "user", content: "Authoritative prior question" },
        { role: "assistant", content: "Authoritative prior answer" },
      ],
    })),
    finalizeRun:
      overrides.finalizeRun
      ?? vi.fn(async () => ({ runId: RUN_ID })),
  };
}

async function collect(
  runtime: AgentRuntime,
  runContext = context(),
): Promise<AgentStreamEnvelope[]> {
  const events: AgentStreamEnvelope[] = [];
  for await (const event of runtime.run(request(), runContext)) {
    events.push(event);
  }
  return events;
}

describe("AgentRuntime server-authoritative conversation persistence", () => {
  it("ignores client history, uses persisted history, and finalizes exact output", async () => {
    const persistence = coordinator();
    const { runtime, provider, logger } = setup(persistence);

    const events = await collect(runtime);

    expect(provider.invocations).toHaveLength(1);
    expect(provider.invocations[0]?.prompt.messages).toEqual([
      { role: "user", content: "Authoritative prior question" },
      { role: "assistant", content: "Authoritative prior answer" },
      { role: "user", content: "Current question" },
    ]);
    expect(
      provider.invocations[0]?.prompt.messages.some(
        (message) => message.content === "malicious client transcript",
      ),
    ).toBe(false);
    expect(events.every((event) => event.run_id === RUN_ID)).toBe(true);
    expect(events.every((event) => event.thread_id === THREAD_ID)).toBe(true);
    expect(events.every((event) => event.message_id === OUTPUT_ID)).toBe(true);
    expect(persistence.prepareRun).toHaveBeenCalledWith(
      expect.anything(),
      {
        runId: expect.any(String),
        requestedThreadId: THREAD_ID,
        clientRequestId: CLIENT_REQUEST_ID,
        userMessage: "Current question",
      },
    );
    expect(persistence.finalizeRun).toHaveBeenCalledWith(
      expect.anything(),
      {
        runId: RUN_ID,
        outcome: "completed",
        assistantText: "Fake response",
        meteringRunId: null,
      },
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "atlas_agent_client_history_ignored",
      expect.objectContaining({ suppliedMessageCount: 1 }),
    );
  });

  it("keeps memory-only history when the tenant persistence gate is off", async () => {
    const persistence = coordinator();
    const { runtime, provider } = setup(persistence);

    await collect(runtime, context(false));

    expect(persistence.prepareRun).not.toHaveBeenCalled();
    expect(persistence.finalizeRun).not.toHaveBeenCalled();
    expect(provider.invocations[0]?.prompt.messages).toEqual([
      { role: "assistant", content: "malicious client transcript" },
      { role: "user", content: "Current question" },
    ]);
  });

  it("does not invoke a provider for an idempotent replay", async () => {
    const persistence = coordinator({
      replayed: true,
      runStatus: "completed",
    });
    const { runtime, provider } = setup(persistence);

    const events = await collect(runtime);

    expect(provider.invocations).toHaveLength(0);
    expect(persistence.finalizeRun).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toMatchObject({
      type: "run.failed",
      code: "request_already_processed",
      retryable: false,
    });
  });

  it("fails closed before provider invocation without verified context", async () => {
    const persistence = coordinator();
    const { runtime, provider } = setup(persistence);
    const runContext = {
      ...context(),
      verifiedRequestContext: undefined,
    };

    const events = await collect(runtime, runContext);

    expect(provider.invocations).toHaveLength(0);
    expect(persistence.prepareRun).not.toHaveBeenCalled();
    expect(events.at(-1)?.event).toMatchObject({
      type: "run.failed",
      code: "conversation_persistence_unavailable",
      retryable: false,
    });
  });

  it("retries durable finalization once and fails the stream if both attempts fail", async () => {
    const finalizeRun = vi.fn(async () => {
      throw Object.assign(new Error("unavailable"), { code: "RUN_STORE_DOWN" });
    });
    const persistence = coordinator({ finalizeRun });
    const { runtime, logger } = setup(persistence);

    const events = await collect(runtime);

    expect(finalizeRun).toHaveBeenCalledTimes(2);
    expect(events.at(-1)?.event).toMatchObject({
      type: "run.failed",
      code: "metering_unavailable",
      retryable: true,
    });
    expect(logger.error).toHaveBeenCalledWith(
      "atlas_agent_conversation_finalize_failed",
      expect.objectContaining({ attempt: 2, errorCode: "RUN_STORE_DOWN" }),
    );
  });
});
