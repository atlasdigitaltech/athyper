import { describe, expect, it, vi } from "vitest";
import type { AiLogger, AnyDb } from "../../ai-runtime.types.js";
import type {
  AgentCallLedgerWriteArgs,
  AgentRunLedgerWriteArgs,
} from "../../agent-run-ledger-writer.js";
import {
  AgentExecutionLedgerRecorder,
  TransactionalAgentExecutionLedgerRecorder,
  type AgentExecutionTerminalMetadata,
} from "../agent-ledger-recorder.js";

const IDS = {
  run: "00000000-0000-4000-8000-000000000001",
  call: "00000000-0000-4000-8000-000000000002",
  tenant: "00000000-0000-4000-8000-000000000003",
  principal: "00000000-0000-4000-8000-000000000004",
  thread: "00000000-0000-4000-8000-000000000005",
  request: "00000000-0000-4000-8000-000000000006",
  message: "00000000-0000-4000-8000-000000000007",
};

function harness(options: {
  runFailure?: Error;
  callFailure?: Error;
} = {}) {
  const order: string[] = [];
  let runArgs: AgentRunLedgerWriteArgs | undefined;
  let callArgs: AgentCallLedgerWriteArgs | undefined;
  const runWriter = {
    write: vi.fn(async (args: AgentRunLedgerWriteArgs) => {
      order.push("run");
      runArgs = args;
      if (options.runFailure) throw options.runFailure;
      return args.runId ?? IDS.run;
    }),
  };
  const callWriter = {
    write: vi.fn(async (args: AgentCallLedgerWriteArgs) => {
      order.push("call");
      callArgs = args;
      if (options.callFailure) throw options.callFailure;
      return args.callId ?? IDS.call;
    }),
  };
  return {
    recorder: new AgentExecutionLedgerRecorder(runWriter, callWriter),
    runWriter,
    callWriter,
    order,
    get runArgs() {
      return runArgs;
    },
    get callArgs() {
      return callArgs;
    },
  };
}

function completedTerminal(): AgentExecutionTerminalMetadata {
  return {
    runId: IDS.run,
    tenantId: IDS.tenant,
    principalId: IDS.principal,
    threadId: IDS.thread,
    clientRequestId: IDS.request,
    responseMessageId: IDS.message,
    plane: "neon",
    requestedPublicModelId: "atlas-balanced",
    policyRevision: "tenant-policy:v3",
    dataHandlingProfileId: "anthropic-platform-stateless:v1",
    promptVersion: "atlas-conversation-base:v1",
    outcome: "completed",
    finishReason: "stop",
    usage: {
      completeness: "final",
      inputTokens: 125,
      outputTokens: 42,
    },
    // Product billing is deliberately not derived from provider cost.
    billable: {
      units: "1.000000",
      unitType: "atlas_turn",
    },
    retryCount: 0,
    timing: {
      startedAt: new Date("2026-07-23T01:00:00.000Z"),
      firstTokenAt: new Date("2026-07-23T01:00:00.080Z"),
      completedAt: new Date("2026-07-23T01:00:00.275Z"),
    },
    correlationId: "correlation-1",
    traceId: "trace-1",
    providerCall: {
      invoked: true,
      callId: IDS.call,
      bindingId: "atlas-balanced-anthropic-v1",
      providerId: "anthropic",
      actualModelId: "claude-sonnet-4-6",
      adapterVersion: "1",
      providerRequestId: "msg_01_provider_support_id",
      providerRegion: "us",
      providerAccountClass: "platform_unverified",
      credential: {
        owner: "platform",
        source: "environment",
        referenceFingerprint: "ref:hmac-sha256:v1:0123456789abcdef",
        fingerprint: "credential:hmac-sha256:v1:0123456789abcdef",
      },
      outcome: "completed",
      finishReason: "stop",
      usage: {
        completeness: "final",
        inputTokens: 125,
        outputTokens: 42,
      },
      billable: {
        units: "167.000000",
        unitType: "provider_tokens",
      },
      pricing: {
        version: "anthropic-2026-07-23",
        inputPerMillion: "3",
        outputPerMillion: "15.00000000",
      },
      timing: {
        startedAt: new Date("2026-07-23T01:00:00.010Z"),
        firstTokenAt: new Date("2026-07-23T01:00:00.080Z"),
        completedAt: new Date("2026-07-23T01:00:00.260Z"),
      },
    },
  };
}

describe("AgentExecutionLedgerRecorder", () => {
  it("records a completed run before its call with exact routing and accounting facts", async () => {
    const target = harness();

    await expect(target.recorder.record(completedTerminal())).resolves.toEqual({
      runId: IDS.run,
      callId: IDS.call,
    });

    expect(target.order).toEqual(["run", "call"]);
    expect(target.runArgs).toMatchObject({
      requestedModelId: "atlas-balanced",
      responseMessageId: IDS.message,
      resolvedBindingId: "atlas-balanced-anthropic-v1",
      resolvedProviderId: "anthropic",
      actualModelId: "claude-sonnet-4-6",
      adapterVersion: "1",
      policyRevision: "tenant-policy:v3",
      dataHandlingProfileId: "anthropic-platform-stateless:v1",
      providerAccountClass: "platform_unverified",
      promptVersion: "atlas-conversation-base:v1",
      outcome: "completed",
      usage: {
        source: "provider_final",
        inputTokens: 125,
        outputTokens: 42,
      },
      modelCallCount: 1,
      billing: {
        units: "1.000000",
        unitType: "atlas_turn",
      },
      cost: {
        amount: "0.00100500",
        currency: "USD",
        basis: "catalog_estimate",
        priceVersion: "anthropic-2026-07-23",
      },
      durationMs: 275,
    });
    expect(target.callArgs).toMatchObject({
      runId: IDS.run,
      callId: IDS.call,
      requestedModelId: "atlas-balanced",
      bindingId: "atlas-balanced-anthropic-v1",
      providerId: "anthropic",
      actualModelId: "claude-sonnet-4-6",
      adapterVersion: "1",
      providerAccountClass: "platform_unverified",
      credential: {
        owner: "platform",
        source: "environment",
        referenceFingerprint: "ref:hmac-sha256:v1:0123456789abcdef",
        fingerprint: "credential:hmac-sha256:v1:0123456789abcdef",
      },
      usage: {
        source: "provider_final",
        inputTokens: 125,
        outputTokens: 42,
      },
      billing: {
        units: "167.000000",
        unitType: "provider_tokens",
      },
      cost: {
        amount: "0.00100500",
        priceVersion: "anthropic-2026-07-23",
      },
      durationMs: 250,
    });
    expect(target.runArgs).not.toHaveProperty("prompt");
    expect(target.runArgs).not.toHaveProperty("response");
    expect(target.callArgs).not.toHaveProperty("prompt");
    expect(target.callArgs).not.toHaveProperty("response");
  });

  it("records a rejected pre-provider run without fabricating a call", async () => {
    const target = harness();
    const terminal: AgentExecutionTerminalMetadata = {
      ...completedTerminal(),
      outcome: "rejected",
      finishReason: "policy_denied",
      failure: {
        code: "model_not_allowed",
        category: "policy",
        retryable: false,
      },
      usage: { completeness: "unavailable" },
      billable: null,
      providerCall: undefined,
      actualModelId: null,
      timing: {
        startedAt: new Date("2026-07-23T01:00:00.000Z"),
        completedAt: new Date("2026-07-23T01:00:00.003Z"),
      },
    };

    await expect(target.recorder.record(terminal)).resolves.toEqual({
      runId: IDS.run,
      callId: null,
    });

    expect(target.runWriter.write).toHaveBeenCalledOnce();
    expect(target.callWriter.write).not.toHaveBeenCalled();
    expect(target.runArgs).toMatchObject({
      outcome: "rejected",
      errorCode: "model_not_allowed",
      errorCategory: "policy",
      isRetryable: false,
      modelCallCount: 0,
      usage: { source: "unavailable" },
      cost: null,
    });
  });

  it("preserves partial usage and observed cost for a cancelled invocation", async () => {
    const target = harness();
    const base = completedTerminal();
    const terminal: AgentExecutionTerminalMetadata = {
      ...base,
      outcome: "cancelled",
      finishReason: "cancelled",
      failure: { code: "client_cancelled", category: "cancelled", retryable: false },
      usage: {
        completeness: "partial",
        inputTokens: 100,
        outputTokens: 7,
      },
      timing: {
        ...base.timing,
        completedAt: new Date("2026-07-23T01:00:00.150Z"),
      },
      providerCall: {
        ...base.providerCall!,
        outcome: "cancelled",
        finishReason: "cancelled",
        failure: {
          code: "client_cancelled",
          category: "cancelled",
          retryable: false,
        },
        usage: {
          completeness: "partial",
          inputTokens: 100,
          outputTokens: 7,
        },
        timing: {
          ...base.providerCall!.timing,
          completedAt: new Date("2026-07-23T01:00:00.145Z"),
        },
      },
    };

    await target.recorder.record(terminal);

    expect(target.runArgs).toMatchObject({
      outcome: "cancelled",
      usage: {
        source: "provider_stream",
        inputTokens: 100,
        outputTokens: 7,
      },
      cost: { amount: "0.00040500" },
    });
    expect(target.callArgs).toMatchObject({
      outcome: "cancelled",
      usage: { source: "provider_stream" },
      cost: { amount: "0.00040500" },
    });
  });

  it("records an incomplete invocation with unavailable usage and no invented cost", async () => {
    const target = harness();
    const base = completedTerminal();
    const terminal: AgentExecutionTerminalMetadata = {
      ...base,
      outcome: "incomplete",
      finishReason: "stream_incomplete",
      usage: { completeness: "unavailable" },
      billable: null,
      providerCall: {
        ...base.providerCall!,
        outcome: "incomplete",
        finishReason: "stream_incomplete",
        usage: { completeness: "unavailable" },
        billable: null,
      },
    };

    await target.recorder.record(terminal);

    expect(target.runArgs).toMatchObject({
      outcome: "incomplete",
      usage: { source: "unavailable" },
      billing: null,
      cost: null,
    });
    expect(target.callArgs).toMatchObject({
      outcome: "incomplete",
      usage: { source: "unavailable" },
      billing: null,
      cost: null,
    });
  });

  it("does not turn unknown usage into zero even when a price snapshot exists", async () => {
    const target = harness();
    const base = completedTerminal();
    const terminal: AgentExecutionTerminalMetadata = {
      ...base,
      outcome: "failed",
      usage: { completeness: "unavailable" },
      providerCall: {
        ...base.providerCall!,
        outcome: "failed",
        usage: { completeness: "unavailable" },
      },
    };

    await target.recorder.record(terminal);

    expect(target.runArgs?.usage).toEqual({ source: "unavailable" });
    expect(target.runArgs?.cost).toBeNull();
    expect(target.callArgs?.usage).toEqual({ source: "unavailable" });
    expect(target.callArgs?.cost).toBeNull();
  });

  it("propagates a run-write failure and never attempts the dependent call", async () => {
    const failure = new Error("run ledger unavailable");
    const target = harness({ runFailure: failure });

    await expect(target.recorder.record(completedTerminal())).rejects.toBe(failure);

    expect(target.order).toEqual(["run"]);
    expect(target.callWriter.write).not.toHaveBeenCalled();
  });

  it("propagates a call-write failure after the required parent row", async () => {
    const failure = new Error("call ledger unavailable");
    const target = harness({ callFailure: failure });

    await expect(target.recorder.record(completedTerminal())).rejects.toBe(failure);

    expect(target.order).toEqual(["run", "call"]);
  });

  it("rounds sub-cent catalog estimates at eight decimal places without floats", async () => {
    const target = harness();
    const base = completedTerminal();
    const terminal: AgentExecutionTerminalMetadata = {
      ...base,
      usage: { completeness: "final", inputTokens: 1, outputTokens: 0 },
      providerCall: {
        ...base.providerCall!,
        usage: { completeness: "final", inputTokens: 1, outputTokens: 0 },
        pricing: {
          version: "tiny-rate-v1",
          inputPerMillion: "0.005",
          outputPerMillion: "0",
        },
      },
    };

    await target.recorder.record(terminal);

    expect(target.callArgs?.cost).toMatchObject({ amount: "0.00000001" });
  });

  it("prices disjoint cached-input and reasoning usage exactly once", async () => {
    const target = harness();
    const base = completedTerminal();
    const usage = {
      completeness: "final" as const,
      inputTokens: 10,
      cacheReadTokens: 20,
      cacheWriteTokens: 3,
      outputTokens: 5,
      reasoningTokens: 2,
    };
    const terminal: AgentExecutionTerminalMetadata = {
      ...base,
      usage,
      providerCall: {
        ...base.providerCall!,
        providerId: "openai",
        bindingId: "atlas-openai-eval-openai-v1",
        actualModelId: "gpt-5.6-sol",
        usage,
        billable: {
          units: "40.000000",
          unitType: "provider_tokens",
        },
        pricing: {
          version: "openai-public-pricing-2026-07-23",
          inputPerMillion: "5",
          cacheReadPerMillion: "0.5",
          cacheWritePerMillion: "6.25",
          outputPerMillion: "30",
          reasoningPerMillion: "30",
        },
      },
    };

    await target.recorder.record(terminal);

    expect(target.callArgs).toMatchObject({
      usage: {
        source: "provider_final",
        inputTokens: 10,
        cacheReadTokens: 20,
        cacheWriteTokens: 3,
        outputTokens: 5,
        reasoningTokens: 2,
      },
      billing: {
        units: "40.000000",
        unitType: "provider_tokens",
      },
      cost: {
        amount: "0.00028875",
        currency: "USD",
        basis: "catalog_estimate",
        priceVersion: "openai-public-pricing-2026-07-23",
      },
    });
  });
});

describe("TransactionalAgentExecutionLedgerRecorder", () => {
  it("rolls back the parent run when the dependent call insert fails", async () => {
    const committed: Array<{ table: string; row: Record<string, unknown> }> = [];
    const failure = new Error("call insert failed");
    const db = {
      transaction: vi.fn(() => ({
        execute: async (
          operation: (transaction: AnyDb) => Promise<unknown>,
        ) => {
          const staged: Array<{ table: string; row: Record<string, unknown> }> = [];
          const transaction = {
            insertInto: (table: string) => ({
              values: (row: Record<string, unknown>) => ({
                execute: async () => {
                  if (table === "log.ai_agent_call") throw failure;
                  staged.push({ table, row });
                },
              }),
            }),
          } as unknown as AnyDb;
          const result = await operation(transaction);
          committed.push(...staged);
          return result;
        },
      })),
    } as unknown as AnyDb;
    const logger: AiLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const recorder = new TransactionalAgentExecutionLedgerRecorder(db, logger);

    await expect(recorder.record(completedTerminal())).rejects.toBe(failure);

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(committed).toEqual([]);
  });
});
