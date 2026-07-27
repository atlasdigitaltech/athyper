import { describe, expect, it, vi } from "vitest";
import type { AiLogger, AnyDb } from "../ai-runtime.types.js";
import {
  AgentCallLedgerWriter,
  AgentRunLedgerWriter,
  type AgentCallLedgerWriteArgs,
  type AgentLedgerMetrics,
  type AgentRunLedgerWriteArgs,
} from "../agent-run-ledger-writer.js";

const IDS = {
  run: "00000000-0000-4000-8000-000000000001",
  call: "00000000-0000-4000-8000-000000000002",
  tenant: "00000000-0000-4000-8000-000000000003",
  principal: "00000000-0000-4000-8000-000000000004",
  thread: "00000000-0000-4000-8000-000000000005",
  request: "00000000-0000-4000-8000-000000000006",
  message: "00000000-0000-4000-8000-000000000007",
};

function harness(options: { rejectWith?: Error } = {}) {
  let table = "";
  let row: Record<string, unknown> = {};
  const execute = options.rejectWith
    ? vi.fn().mockRejectedValue(options.rejectWith)
    : vi.fn().mockResolvedValue(undefined);
  const db = {
    insertInto: vi.fn((nextTable: string) => {
      table = nextTable;
      return {
        values: vi.fn((nextRow: Record<string, unknown>) => {
          row = nextRow;
          return { execute };
        }),
      };
    }),
  } as unknown as AnyDb;
  const logger: AiLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const metrics: AgentLedgerMetrics = { writeFailed: vi.fn() };
  return {
    db,
    logger,
    metrics,
    execute,
    get table() { return table; },
    get row() { return row; },
  };
}

function runArgs(): AgentRunLedgerWriteArgs {
  return {
    runId: IDS.run,
    tenantId: IDS.tenant,
    principalId: IDS.principal,
    threadId: IDS.thread,
    clientRequestId: IDS.request,
    responseMessageId: IDS.message,
    plane: "neon",
    policyRevision: "tenant-policy:v3",
    dataHandlingProfileId: "no-provider-storage:v1",
    requestedModelId: "atlas-balanced",
    resolvedBindingId: "atlas-balanced:anthropic:claude-sonnet-4-6:v1",
    resolvedProviderId: "anthropic",
    actualModelId: "claude-sonnet-4-6",
    adapterVersion: "anthropic-messages:v1",
    providerRegion: "us",
    providerAccountClass: "platform_unverified",
    promptVersion: "atlas-system:v1",
    outcome: "completed",
    finishReason: "end_turn",
    usage: {
      source: "provider_final",
      inputTokens: 125,
      cacheWriteTokens: 20,
      outputTokens: 42,
    },
    modelCallCount: 1,
    retryCount: 1,
    billing: {
      units: "167.000000",
      unitType: "tokens",
    },
    cost: {
      amount: "0.00004250",
      basis: "catalog_estimate",
      priceVersion: "2026-07-23",
    },
    durationMs: 275,
    startedAt: new Date("2026-07-23T01:00:00.000Z"),
    firstTokenAt: new Date("2026-07-23T01:00:00.080Z"),
    completedAt: new Date("2026-07-23T01:00:00.275Z"),
  };
}

function callArgs(): AgentCallLedgerWriteArgs {
  return {
    callId: IDS.call,
    tenantId: IDS.tenant,
    runId: IDS.run,
    sequenceNo: 0,
    callKind: "model",
    operationId: "atlas-balanced:anthropic:claude-sonnet-4-6:v1",
    policyRevision: "tenant-policy:v3",
    dataHandlingProfileId: "no-provider-storage:v1",
    bindingId: "atlas-balanced:anthropic:claude-sonnet-4-6:v1",
    providerId: "anthropic",
    requestedModelId: "atlas-balanced",
    actualModelId: "claude-sonnet-4-6",
    adapterVersion: "anthropic-messages:v1",
    promptVersion: "atlas-system:v1",
    providerRequestId: "req_provider_safe_support_id",
    providerRegion: "us",
    providerAccountClass: "platform_unverified",
    credential: {
      owner: "platform",
      source: "environment",
      referenceFingerprint: "ref:hmac-sha256:v1:0123456789abcdef",
      fingerprint: "credential:hmac-sha256:v1:0123456789abcdef",
    },
    outcome: "completed",
    finishReason: "end_turn",
    usage: {
      source: "provider_final",
      inputTokens: 125,
      outputTokens: 42,
    },
    billing: {
      units: "167.000000",
      unitType: "tokens",
    },
    cost: {
      amount: "0.00004250",
      basis: "catalog_estimate",
    },
    durationMs: 250,
    startedAt: new Date("2026-07-23T01:00:00.010Z"),
    firstTokenAt: new Date("2026-07-23T01:00:00.080Z"),
    completedAt: new Date("2026-07-23T01:00:00.260Z"),
    createdBy: IDS.principal,
  };
}

describe("AgentRunLedgerWriter", () => {
  it("writes exact routing and accounting facts without content fields", async () => {
    const target = harness();
    const writer = new AgentRunLedgerWriter(
      target.db,
      target.logger,
      target.metrics,
    );
    const args = {
      ...runArgs(),
      message: "must not be stored",
      history: ["must not be stored"],
      response: "must not be stored",
    } as unknown as AgentRunLedgerWriteArgs;

    await expect(writer.write(args)).resolves.toBe(IDS.run);

    expect(target.table).toBe("log.ai_agent_run");
    expect(target.row).toMatchObject({
      id: IDS.run,
      tenant_id: IDS.tenant,
      response_message_id: IDS.message,
      requested_model_id: "atlas-balanced",
      resolved_binding_id: "atlas-balanced:anthropic:claude-sonnet-4-6:v1",
      resolved_provider_id: "anthropic",
      actual_model_id: "claude-sonnet-4-6",
      policy_revision: "tenant-policy:v3",
      data_handling_profile_id: "no-provider-storage:v1",
      adapter_version: "anthropic-messages:v1",
      provider_region: "us",
      provider_account_class: "platform_unverified",
      prompt_version: "atlas-system:v1",
      input_tokens: 125,
      cache_write_tokens: 20,
      output_tokens: 42,
      retry_count: 1,
      billable_units: "167.000000",
      billable_unit_type: "tokens",
      cost_amount: "0.00004250",
      cost_currency: "USD",
    });
    expect(target.row).not.toHaveProperty("message");
    expect(target.row).not.toHaveProperty("history");
    expect(target.row).not.toHaveProperty("response");
  });

  it("preserves unknown usage as null instead of inventing zero", async () => {
    const target = harness();
    const writer = new AgentRunLedgerWriter(target.db, target.logger);

    await writer.write({
      ...runArgs(),
      usage: undefined,
      billing: undefined,
      cost: undefined,
    });

    expect(target.row).toMatchObject({
      usage_source: "unavailable",
      input_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
      output_tokens: null,
      reasoning_tokens: null,
      billable_units: null,
      billable_unit_type: null,
      cost_amount: null,
      cost_basis: null,
    });
  });

  it("requires provider account class for a resolved provider", async () => {
    const target = harness();
    const writer = new AgentRunLedgerWriter(target.db, target.logger);

    await expect(writer.write({
      ...runArgs(),
      providerAccountClass: undefined,
    })).rejects.toThrow(/providerAccountClass is required/);
  });
});

describe("AgentCallLedgerWriter", () => {
  it("writes credential fingerprints but accepts no credential value/reference", async () => {
    const target = harness();
    const writer = new AgentCallLedgerWriter(target.db, target.logger);

    await expect(writer.write(callArgs())).resolves.toBe(IDS.call);

    expect(target.table).toBe("log.ai_agent_call");
    expect(target.row).toMatchObject({
      run_id: IDS.run,
      sequence_no: 0,
      operation_id: "atlas-balanced:anthropic:claude-sonnet-4-6:v1",
      binding_id: "atlas-balanced:anthropic:claude-sonnet-4-6:v1",
      provider_id: "anthropic",
      actual_model_id: "claude-sonnet-4-6",
      policy_revision: "tenant-policy:v3",
      data_handling_profile_id: "no-provider-storage:v1",
      adapter_version: "anthropic-messages:v1",
      prompt_version: "atlas-system:v1",
      provider_region: "us",
      provider_account_class: "platform_unverified",
      credential_owner: "platform",
      credential_source: "environment",
      credential_reference_hash: "ref:hmac-sha256:v1:0123456789abcdef",
      credential_fingerprint: "credential:hmac-sha256:v1:0123456789abcdef",
      billable_units: "167.000000",
      billable_unit_type: "tokens",
    });
    expect(target.row).not.toHaveProperty("secret");
    expect(target.row).not.toHaveProperty("secret_ref");
    expect(target.row).not.toHaveProperty("prompt");
    expect(target.row).not.toHaveProperty("response");
  });

  it("emits safe failure telemetry and rethrows the original DB error", async () => {
    const dbError = new Error("database detail contains sk-sensitive-value");
    const target = harness({ rejectWith: dbError });
    const writer = new AgentCallLedgerWriter(
      target.db,
      target.logger,
      target.metrics,
    );

    await expect(writer.write(callArgs())).rejects.toBe(dbError);

    expect(target.metrics.writeFailed).toHaveBeenCalledWith("agent_call");
    expect(target.logger.error).toHaveBeenCalledWith(
      "ai_agent_call_ledger_write_failed",
      {
        callId: IDS.call,
        runId: IDS.run,
        tenantId: IDS.tenant,
        errorType: "Error",
      },
    );
    expect(JSON.stringify(vi.mocked(target.logger.error).mock.calls))
      .not.toContain("sk-sensitive-value");
  });

  it("rejects invalid counters before writing", async () => {
    const target = harness();
    const writer = new AgentCallLedgerWriter(
      target.db,
      target.logger,
      target.metrics,
    );

    await expect(
      writer.write({ ...callArgs(), retryCount: -1 }),
    ).rejects.toThrow("retryCount must be a non-negative safe integer");
    expect(target.execute).not.toHaveBeenCalled();
    expect(target.metrics.writeFailed).toHaveBeenCalledWith("agent_call");
  });

  it("requires provider account class for a model provider call", async () => {
    const target = harness();
    const writer = new AgentCallLedgerWriter(target.db, target.logger);

    await expect(writer.write({
      ...callArgs(),
      providerAccountClass: undefined,
    })).rejects.toThrow(/providerAccountClass is required/);
  });
});
