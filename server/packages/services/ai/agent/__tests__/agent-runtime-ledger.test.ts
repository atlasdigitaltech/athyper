import {
  AgentRunRequestSchema,
  type AgentStreamEnvelope,
} from "@athyper/atlas-agent-runtime";
import { describe, expect, it, vi } from "vitest";
import type { AgentLedgerCredential } from "../../agent-run-ledger-writer.js";
import { FakeModelProvider } from "../../providers/fake-model.provider.js";
import type {
  AtlasModelBinding,
  IModelProvider,
} from "../../providers/i-model-provider.js";
import { ProviderRegistry } from "../../providers/provider-registry.js";
import {
  AgentRuntime,
  type AgentProviderCredentialLease,
  type AgentRunContext,
} from "../agent-runtime.js";
import type {
  AgentExecutionTerminalMetadata,
} from "../agent-ledger-recorder.js";
import { createEffectiveModelCatalogResolver } from "../model-catalog.js";

const TEST_POLICY_REVISION = "test-policy-ledger-v1";
const TEST_CREDENTIAL: AgentLedgerCredential = {
  owner: "platform",
  source: "environment",
  referenceFingerprint: "ref:hmac-sha256:v1:test-ledger-reference",
  fingerprint: "credential:hmac-sha256:v1:test-ledger-credential",
};

function binding(input: {
  publicModelId?: string;
  providerId?: string;
  upstreamModelId?: string;
  adapterId?: string;
} = {}): AtlasModelBinding {
  const publicModelId = input.publicModelId ?? "atlas-fast";
  const providerId = input.providerId ?? "fake";
  const upstreamModelId = input.upstreamModelId ?? "fake-fast-v1";
  const adapterId = input.adapterId ?? "fake-text";
  return {
    bindingId: `${publicModelId}-${providerId}-v1`,
    publicModelId,
    providerId,
    upstreamModelId,
    adapterId,
    adapterVersion: "1",
    displayName: publicModelId,
    displayTier: publicModelId === "atlas-fast" ? "fast" : "best",
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
    dataHandlingProfileId: "test-stateless-v1",
    routingPolicyId: "test-no-fallback-v1",
    allowedDataClasses: ["test"],
    allowedRegions: ["test"],
    providerRegion: "test",
    providerAccountClass: "test",
    priceVersion: "test-price-v1",
    inputPricePerMtokUsd: 1,
    cacheReadPricePerMtokUsd: null,
    cacheWritePricePerMtokUsd: null,
    outputPricePerMtokUsd: 5,
    reasoningPricePerMtokUsd: null,
  };
}

function request(input: {
  modelId?: string;
  policyRevision?: string;
  idSuffix?: string;
} = {}) {
  return AgentRunRequestSchema.parse({
    client_request_id:
      `00000000-0000-4000-8000-${(input.idSuffix ?? "1").padStart(12, "0")}`,
    plane: "neon",
    model_id: input.modelId ?? "atlas-fast",
    message: "Explain this record.",
    ...(input.policyRevision
      ? { policy_revision: input.policyRevision }
      : {}),
  });
}

function context(): AgentRunContext {
  return {
    tenantId: "tenant-ledger",
    principalId: "principal-ledger",
    plane: "neon",
  };
}

function logger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function setup(input: {
  bindings?: AtlasModelBinding[];
  providers?: Array<{ providerId: string; provider: IModelProvider }>;
  record?: (
    terminal: AgentExecutionTerminalMetadata,
  ) => Promise<{ runId: string; callId: string | null }>;
  resolveCredential?: (
    binding: AtlasModelBinding,
    context: AgentRunContext,
  ) => Promise<AgentProviderCredentialLease | null>;
  timeline?: string[];
} = {}) {
  const selectedBindings = input.bindings ?? [binding()];
  const defaultProvider = new FakeModelProvider();
  const providers = input.providers ?? [{
    providerId: "fake",
    provider: defaultProvider,
  }];
  const registry = new ProviderRegistry();
  for (const entry of providers) {
    registry.register(entry.providerId, entry.provider);
  }
  const catalogResolver = createEffectiveModelCatalogResolver({
    registry,
    bindings: selectedBindings,
    defaultPublicModelId: selectedBindings[0]?.publicModelId ?? "",
    resolvePolicy: () => ({
      revision: TEST_POLICY_REVISION,
      evaluatePolicy: () => ({ allowed: true }),
    }),
  });
  const terminals: AgentExecutionTerminalMetadata[] = [];
  const record = vi.fn(input.record ?? (async (
    terminal: AgentExecutionTerminalMetadata,
  ) => {
    terminals.push(terminal);
    input.timeline?.push(
      `ledger:${terminal.outcome}:${terminal.failure?.code ?? "none"}`,
    );
    return {
      runId: terminal.runId,
      callId: terminal.providerCall?.callId ?? null,
    };
  }));
  const credentialForBinding = vi.fn(
    input.resolveCredential
    ?? (async (_binding: AtlasModelBinding) => ({
        secret: "test-provider-secret",
        metadata: TEST_CREDENTIAL,
      })),
  );
  const runtime = new AgentRuntime({
    registry,
    catalogResolver,
    logger: logger(),
    maxOutputTokens: 1_000,
    credentials: {
      resolveForBinding: credentialForBinding,
    },
    ledger: {
      recorder: { record },
    },
  });
  return {
    runtime,
    terminals,
    record,
    credentialForBinding,
    defaultProvider,
  };
}

async function collect(
  runtime: AgentRuntime,
  runRequest = request(),
  signal?: AbortSignal,
  timeline?: string[],
): Promise<AgentStreamEnvelope[]> {
  const envelopes: AgentStreamEnvelope[] = [];
  for await (const envelope of runtime.run(runRequest, context(), signal)) {
    envelopes.push(envelope);
    timeline?.push(`event:${envelope.event.type}`);
  }
  return envelopes;
}

describe("AgentRuntime ledger finalization", () => {
  it.each([
    {
      name: "a stale policy revision",
      runRequest: request({
        policyRevision: "stale-policy-revision",
        idSuffix: "11",
      }),
      expectedCode: "stale_model_catalog",
    },
    {
      name: "an unavailable public model",
      runRequest: request({
        modelId: "atlas-not-in-catalog",
        idSuffix: "12",
      }),
      expectedCode: "model_unavailable",
    },
  ])(
    "records a run-only rejection before emitting the failure for $name",
    async ({ runRequest, expectedCode }) => {
      const timeline: string[] = [];
      const target = setup({ timeline });

      const envelopes = await collect(
        target.runtime,
        runRequest,
        undefined,
        timeline,
      );

      expect(timeline).toEqual([
        `ledger:rejected:${expectedCode}`,
        "event:run.failed",
      ]);
      expect(target.record).toHaveBeenCalledOnce();
      expect(target.terminals[0]).toMatchObject({
        runId: envelopes[0]?.run_id,
        clientRequestId: runRequest.client_request_id,
        requestedPublicModelId: runRequest.model_id,
        outcome: "rejected",
        finishReason: expectedCode,
        failure: {
          code: expectedCode,
          category: "policy",
          retryable: false,
        },
        usage: { completeness: "unavailable" },
      });
      expect(target.terminals[0]?.providerCall).toBeUndefined();
      expect(target.credentialForBinding).not.toHaveBeenCalled();
      expect(target.defaultProvider.invocations).toHaveLength(0);
      expect(envelopes).toHaveLength(1);
      expect(envelopes[0]?.event).toMatchObject({
        type: "run.failed",
        code: expectedCode,
      });
    },
  );

  it("fails closed and records no provider call when a credential lease is unavailable", async () => {
    const target = setup({
      resolveCredential: async () => null,
    });

    const events = await collect(
      target.runtime,
      request({ idSuffix: "19" }),
    );

    expect(events.map((envelope) => envelope.event)).toEqual([{
      type: "run.failed",
      code: "provider_unavailable",
      message: "Atlas is not currently available. Please try again later.",
      retryable: true,
    }]);
    expect(target.defaultProvider.invocations).toHaveLength(0);
    expect(target.terminals).toHaveLength(1);
    expect(target.terminals[0]).toMatchObject({
      outcome: "rejected",
      failure: {
        code: "credential_unavailable",
        category: "configuration",
      },
    });
    expect(target.terminals[0]?.providerCall).toBeUndefined();
  });

  it("records exact run/call routing facts, final usage, and first-token timing", async () => {
    const provider = new FakeModelProvider({
      providerRequestId: "provider-request-ledger-1",
      steps: [
        { kind: "text_delta", text: "first" },
        { kind: "text_delta", text: " second" },
        {
          kind: "usage",
          mode: "snapshot",
          final: true,
          usage: {
            input_tokens: 13,
            output_tokens: 7,
            cache_read_tokens: 3,
          },
        },
        { kind: "completed", reason: "stop" },
      ],
    });
    const selectedBinding = binding();
    const target = setup({
      bindings: [selectedBinding],
      providers: [{ providerId: "fake", provider }],
    });

    const envelopes = await collect(target.runtime);

    expect(envelopes.map(({ event }) => event.type)).toEqual([
      "run.started",
      "message.delta",
      "message.delta",
      "run.completed",
    ]);
    expect(target.record).toHaveBeenCalledOnce();
    const terminal = target.terminals[0];
    const invocation = provider.invocations[0];
    expect(terminal).toBeDefined();
    expect(invocation).toBeDefined();
    expect(terminal).toMatchObject({
      runId: envelopes[0]?.run_id,
      clientRequestId: envelopes[0]?.client_request_id,
      requestedPublicModelId: "atlas-fast",
      resolvedBindingId: selectedBinding.bindingId,
      resolvedProviderId: "fake",
      actualModelId: "fake-fast-v1",
      adapterVersion: "1",
      providerRegion: "test",
      providerAccountClass: "test",
      policyRevision: expect.stringMatching(/^atlas-base-[a-f0-9]{16}$/),
      outcome: "completed",
      finishReason: "stop",
      usage: {
        completeness: "final",
        inputTokens: 13,
        outputTokens: 7,
        cacheReadTokens: 3,
      },
      providerCall: {
        invoked: true,
        callId: invocation?.trace.callId,
        bindingId: selectedBinding.bindingId,
        providerId: "fake",
        actualModelId: "fake-fast-v1",
        providerRequestId: "provider-request-ledger-1",
        providerRegion: "test",
        providerAccountClass: "test",
        credential: TEST_CREDENTIAL,
        outcome: "completed",
        usage: {
          completeness: "final",
          inputTokens: 13,
          outputTokens: 7,
          cacheReadTokens: 3,
        },
        billable: {
          units: "23.000000",
          unitType: "provider_tokens",
        },
      },
    });
    expect(invocation?.trace.runId).toBe(envelopes[0]?.run_id);
    expect(terminal?.providerCall?.callId).toBe(invocation?.trace.callId);
    expect(terminal?.timing.firstTokenAt).toBeInstanceOf(Date);
    expect(terminal?.providerCall?.timing.firstTokenAt).toBe(
      terminal?.timing.firstTokenAt,
    );
    expect(terminal!.timing.firstTokenAt!.getTime()).toBeGreaterThanOrEqual(
      terminal!.timing.startedAt.getTime(),
    );
    expect(terminal!.timing.firstTokenAt!.getTime()).toBeLessThanOrEqual(
      terminal!.timing.completedAt.getTime(),
    );
  });

  it("records client cancellation even when no terminal envelope is emitted", async () => {
    const provider = new FakeModelProvider({
      steps: [{ kind: "wait_for_abort" }],
    });
    const target = setup({
      providers: [{ providerId: "fake", provider }],
    });
    const controller = new AbortController();
    const iterator = target.runtime.run(
      request({ idSuffix: "21" }),
      context(),
      controller.signal,
    )[Symbol.asyncIterator]();

    const started = await iterator.next();
    controller.abort();
    const terminalResult = await iterator.next();

    expect(started.done).toBe(false);
    expect(started.value?.event.type).toBe("run.started");
    expect(terminalResult).toEqual({ done: true, value: undefined });
    expect(target.terminals).toHaveLength(1);
    expect(target.terminals[0]).toMatchObject({
      runId: started.value?.run_id,
      outcome: "cancelled",
      finishReason: "client",
      failure: {
        code: "client",
        category: "cancelled",
        retryable: false,
      },
      providerCall: {
        outcome: "cancelled",
        finishReason: "client",
      },
    });
    expect(provider.cancellationObserved).toBe(true);
  });

  it("records exactly one cancellation when the consumer returns after partial output", async () => {
    const provider = new FakeModelProvider({
      steps: [
        { kind: "text_delta", text: "partial answer" },
        { kind: "wait_for_abort" },
      ],
    });
    const target = setup({
      providers: [{ providerId: "fake", provider }],
    });
    const iterator = target.runtime.run(
      request({ idSuffix: "22" }),
      context(),
    )[Symbol.asyncIterator]();

    const started = await iterator.next();
    const partial = await iterator.next();
    const closed = await iterator.return?.();

    expect(started.done).toBe(false);
    expect(started.value?.event.type).toBe("run.started");
    expect(partial.done).toBe(false);
    expect(partial.value?.event).toMatchObject({
      type: "message.delta",
      delta: "partial answer",
    });
    expect(closed).toEqual({ done: true, value: undefined });
    expect(provider.invocations[0]?.signal?.aborted).toBe(true);
    expect(target.record).toHaveBeenCalledOnce();
    expect(target.terminals).toHaveLength(1);
    expect(target.terminals[0]).toMatchObject({
      runId: started.value?.run_id,
      outcome: "cancelled",
      finishReason: "client",
      failure: {
        code: "client",
        category: "cancelled",
        retryable: false,
      },
      usage: { completeness: "unavailable" },
      providerCall: {
        outcome: "cancelled",
        finishReason: "client",
        usage: { completeness: "unavailable" },
      },
    });
  });

  it("records a truncated stream as incomplete with partial observed usage", async () => {
    const provider = new FakeModelProvider({
      emitIncompleteOnScriptEnd: false,
      steps: [
        { kind: "text_delta", text: "partial answer" },
        {
          kind: "usage",
          mode: "snapshot",
          final: false,
          usage: { input_tokens: 8, output_tokens: 2 },
        },
      ],
    });
    const target = setup({
      providers: [{ providerId: "fake", provider }],
    });

    const envelopes = await collect(
      target.runtime,
      request({ idSuffix: "31" }),
    );

    expect(envelopes.map(({ event }) => event.type)).toEqual([
      "run.started",
      "message.delta",
      "run.failed",
    ]);
    expect(envelopes.at(-1)?.event).toMatchObject({
      type: "run.failed",
      code: "stream_incomplete",
    });
    expect(provider.invocations).toHaveLength(1);
    expect(target.terminals).toHaveLength(1);
    expect(target.terminals[0]).toMatchObject({
      outcome: "incomplete",
      finishReason: "stream_incomplete",
      failure: {
        code: "stream_incomplete",
        category: "stream_incomplete",
        retryable: true,
      },
      usage: {
        completeness: "partial",
        inputTokens: 8,
        outputTokens: 2,
      },
      providerCall: {
        outcome: "incomplete",
        usage: {
          completeness: "partial",
          inputTokens: 8,
          outputTokens: 2,
        },
      },
    });
  });

  it.each([
    {
      name: "provider",
      providerId: "unexpected-provider",
      actualModelId: "fake-fast-v1",
    },
    {
      name: "model",
      providerId: "fake",
      actualModelId: "unexpected-upstream-model",
    },
  ])(
    "records the actual response metadata when the $name conflicts with the binding",
    async ({ providerId, actualModelId }) => {
      const provider = new FakeModelProvider({
        providerId,
        actualModelId,
        providerRequestId: "provider-request-mismatch",
      });
      const target = setup({
        providers: [{ providerId: "fake", provider }],
      });

      const envelopes = await collect(
        target.runtime,
        request({ idSuffix: providerId === "fake" ? "42" : "41" }),
      );

      expect(envelopes).toHaveLength(1);
      expect(envelopes[0]?.event).toMatchObject({
        type: "run.failed",
        code: "model_binding_mismatch",
      });
      expect(target.terminals[0]).toMatchObject({
        runId: envelopes[0]?.run_id,
        actualModelId,
        outcome: "failed",
        finishReason: "binding_mismatch",
        failure: {
          code: "provider_binding_mismatch",
          category: "binding_mismatch",
          retryable: false,
        },
        providerCall: {
          providerId: "fake",
          actualModelId,
          providerRequestId: "provider-request-mismatch",
          outcome: "failed",
        },
      });
    },
  );

  it("replaces an apparent completion with one metering failure after deltas", async () => {
    const recordFailure = new Error("ledger unavailable");
    const record = vi.fn(async (
      _terminal: AgentExecutionTerminalMetadata,
    ): Promise<{ runId: string; callId: string | null }> => {
      throw recordFailure;
    });
    const target = setup({ record });

    const envelopes = await collect(
      target.runtime,
      request({ idSuffix: "51" }),
    );

    expect(envelopes.map(({ event }) => event.type)).toEqual([
      "run.started",
      "message.delta",
      "run.failed",
    ]);
    expect(envelopes[1]?.event).toMatchObject({
      type: "message.delta",
      delta: "Fake response",
    });
    const terminalEvents = envelopes.filter(
      ({ event }) =>
        event.type === "run.completed" || event.type === "run.failed",
    );
    expect(terminalEvents).toHaveLength(1);
    expect(terminalEvents[0]?.event).toEqual({
      type: "run.failed",
      code: "metering_unavailable",
      message: "Atlas could not finalize this response safely. Please try again.",
      retryable: true,
    });
    expect(envelopes.some(({ event }) => event.type === "run.completed")).toBe(
      false,
    );
    expect(record).toHaveBeenCalledOnce();
  });

  it("resolves credential metadata only for the selected provider binding", async () => {
    const fastBinding = binding();
    const bestBinding = binding({
      publicModelId: "atlas-best",
      providerId: "fake-best",
      upstreamModelId: "fake-best-v1",
      adapterId: "fake-best-text",
    });
    const fastProvider = new FakeModelProvider();
    const bestProvider = new FakeModelProvider({
      providerId: "fake-best",
      adapterId: "fake-best-text",
      actualModelId: "fake-best-v1",
    });
    const target = setup({
      bindings: [fastBinding, bestBinding],
      providers: [
        { providerId: "fake", provider: fastProvider },
        { providerId: "fake-best", provider: bestProvider },
      ],
    });

    await collect(
      target.runtime,
      request({ modelId: "atlas-best", idSuffix: "61" }),
    );

    expect(target.credentialForBinding).toHaveBeenCalledOnce();
    expect(target.credentialForBinding).toHaveBeenCalledWith(
      bestBinding,
      context(),
    );
    expect(fastProvider.invocations).toHaveLength(0);
    expect(bestProvider.invocations).toHaveLength(1);
    expect(bestProvider.invocations[0]?.credential).toEqual({
      secret: "test-provider-secret",
    });
  });
});
