/**
 * Turns one terminal Atlas execution snapshot into append-only run/call rows.
 *
 * The input contract intentionally contains operational metadata only. Prompt,
 * message, response, tool argument/result, retrieval text, and evidence content
 * have no place in this recorder.
 */

import type { AtlasPlane } from "@athyper/platform-ai-agent-runtime";
import type { AiLogMetrics, AiLogger, AnyDb } from "../ai-runtime.types.js";
import {
  AgentCallLedgerWriter,
  AgentRunLedgerWriter,
  type AgentLedgerDb,
  type AgentCallLedgerWriteArgs,
  type AgentCallOutcome,
  type AgentLedgerBilling,
  type AgentLedgerCost,
  type AgentLedgerCredential,
  type AgentLedgerUsage,
  type AgentRunLedgerWriteArgs,
  type AgentRunOutcome,
} from "../agent-run-ledger-writer.js";

const COST_SCALE = 8;
const COST_SCALE_FACTOR = 100_000_000n;
const TOKENS_PER_MILLION = 1_000_000n;
const DECIMAL_RATE_PATTERN = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,8})?$/;

export type AgentExecutionUsage =
  | {
      completeness: "final" | "partial";
      inputTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
    }
  | {
      completeness: "unavailable";
    };

export interface AgentExecutionTiming {
  startedAt: Date;
  firstTokenAt?: Date | null;
  completedAt: Date;
}

export interface AgentExecutionFailure {
  code?: string | null;
  category?: string | null;
  retryable?: boolean | null;
}

/**
 * Immutable price catalog entry that was effective when the call began.
 *
 * Rates are decimal strings per one million tokens. Strings prevent an
 * accidental floating-point multiplication from entering the accounting path.
 * If a non-zero usage category has no corresponding rate, estimated cost is
 * deliberately unavailable rather than understated.
 */
export interface AgentCatalogPriceSnapshot {
  version: string;
  currency?: string;
  inputPerMillion?: string | null;
  cacheReadPerMillion?: string | null;
  cacheWritePerMillion?: string | null;
  outputPerMillion?: string | null;
  reasoningPerMillion?: string | null;
}

export interface AgentProviderCallTerminalMetadata {
  /** Presence of this object means the provider invocation was attempted. */
  invoked: true;
  callId: string;
  sequenceNo?: number;
  bindingId: string;
  providerId: string;
  actualModelId?: string | null;
  adapterVersion: string;
  providerRequestId?: string | null;
  providerRegion?: string | null;
  providerAccountClass?: string | null;
  credential: AgentLedgerCredential;
  outcome: AgentCallOutcome;
  finishReason?: string | null;
  failure?: AgentExecutionFailure;
  usage: AgentExecutionUsage;
  billable?: AgentLedgerBilling | null;
  pricing?: AgentCatalogPriceSnapshot | null;
  retryCount?: number;
  timing: AgentExecutionTiming;
}

export interface AgentExecutionTerminalMetadata {
  runId: string;
  tenantId: string;
  principalId: string;
  threadId: string;
  clientRequestId: string;
  responseMessageId: string;
  plane: AtlasPlane;
  requestedPublicModelId: string;

  /**
   * Resolution facts can exist without an invocation (for example, a policy
   * rejection after catalog resolution). Provider-call facts take precedence
   * when a provider was invoked.
   */
  resolvedBindingId?: string | null;
  resolvedProviderId?: string | null;
  actualModelId?: string | null;
  adapterVersion?: string | null;
  providerRegion?: string | null;
  providerAccountClass?: string | null;

  policyRevision?: string | null;
  dataHandlingProfileId?: string | null;
  promptVersion?: string | null;
  outcome: AgentRunOutcome;
  finishReason?: string | null;
  failure?: AgentExecutionFailure;
  usage: AgentExecutionUsage;
  billable?: AgentLedgerBilling | null;
  retryCount?: number;
  /** Logical provider invocations aggregated into this terminal snapshot. */
  modelCallCount?: number;
  toolCallCount?: number;
  retrievalCallCount?: number;
  timing: AgentExecutionTiming;
  correlationId?: string | null;
  traceId?: string | null;
  createdBy?: string;

  providerCall?: AgentProviderCallTerminalMetadata;
}

export interface AgentExecutionLedgerRecordResult {
  runId: string;
  callId: string | null;
}

export interface AgentRunLedgerSink {
  write(args: AgentRunLedgerWriteArgs): Promise<string>;
}

export interface AgentCallLedgerSink {
  write(args: AgentCallLedgerWriteArgs): Promise<string>;
}

/**
 * Records the parent run before its optional provider call because
 * ai.ai_agent_call has a foreign key to ai.ai_agent_run.
 *
 * Failures intentionally propagate. A caller must never interpret a failed
 * ledger write as successful metering.
 */
export class AgentExecutionLedgerRecorder {
  constructor(
    private readonly runWriter: AgentRunLedgerSink,
    private readonly callWriter: AgentCallLedgerSink,
  ) {}

  async record(
    terminal: AgentExecutionTerminalMetadata,
  ): Promise<AgentExecutionLedgerRecordResult> {
    validateTerminalSemantics(terminal);

    const providerCall = terminal.providerCall;
    const callCost = providerCall
      ? estimateCatalogCost(providerCall.usage, providerCall.pricing)
      : null;

    const runId = await this.runWriter.write({
      runId: terminal.runId,
      tenantId: terminal.tenantId,
      principalId: terminal.principalId,
      threadId: terminal.threadId,
      clientRequestId: terminal.clientRequestId,
      responseMessageId: terminal.responseMessageId,
      plane: terminal.plane,
      policyRevision: terminal.policyRevision,
      dataHandlingProfileId: terminal.dataHandlingProfileId,
      requestedModelId: terminal.requestedPublicModelId,
      resolvedBindingId: providerCall?.bindingId ?? terminal.resolvedBindingId,
      resolvedProviderId: providerCall?.providerId ?? terminal.resolvedProviderId,
      actualModelId: providerCall?.actualModelId ?? terminal.actualModelId,
      adapterVersion: providerCall?.adapterVersion ?? terminal.adapterVersion,
      providerRegion: providerCall?.providerRegion ?? terminal.providerRegion,
      providerAccountClass:
        providerCall?.providerAccountClass ?? terminal.providerAccountClass,
      promptVersion: terminal.promptVersion,
      outcome: terminal.outcome,
      finishReason: terminal.finishReason,
      errorCode: terminal.failure?.code,
      errorCategory: terminal.failure?.category,
      isRetryable: terminal.failure?.retryable,
      usage: toLedgerUsage(terminal.usage),
      modelCallCount:
        terminal.modelCallCount ?? (providerCall ? 1 : 0),
      toolCallCount: terminal.toolCallCount ?? 0,
      retrievalCallCount: terminal.retrievalCallCount ?? 0,
      retryCount: terminal.retryCount ?? providerCall?.retryCount ?? 0,
      billing: terminal.billable,
      cost: callCost,
      durationMs: durationMs(terminal.timing),
      startedAt: terminal.timing.startedAt,
      firstTokenAt: terminal.timing.firstTokenAt,
      completedAt: terminal.timing.completedAt,
      correlationId: terminal.correlationId,
      traceId: terminal.traceId,
      createdBy: terminal.createdBy ?? terminal.principalId,
    });

    if (!providerCall) {
      return { runId, callId: null };
    }

    const callId = await this.callWriter.write({
      callId: providerCall.callId,
      tenantId: terminal.tenantId,
      runId,
      sequenceNo: providerCall.sequenceNo ?? 0,
      callKind: "model",
      operationId: providerCall.bindingId,
      policyRevision: terminal.policyRevision,
      dataHandlingProfileId: terminal.dataHandlingProfileId,
      bindingId: providerCall.bindingId,
      providerId: providerCall.providerId,
      requestedModelId: terminal.requestedPublicModelId,
      actualModelId: providerCall.actualModelId,
      adapterVersion: providerCall.adapterVersion,
      promptVersion: terminal.promptVersion,
      providerRequestId: providerCall.providerRequestId,
      providerRegion: providerCall.providerRegion,
      providerAccountClass: providerCall.providerAccountClass,
      credential: providerCall.credential,
      outcome: providerCall.outcome,
      finishReason: providerCall.finishReason,
      errorCode: providerCall.failure?.code,
      errorCategory: providerCall.failure?.category,
      isRetryable: providerCall.failure?.retryable,
      retryCount: providerCall.retryCount ?? 0,
      usage: toLedgerUsage(providerCall.usage),
      billing: providerCall.billable,
      cost: callCost,
      durationMs: durationMs(providerCall.timing),
      startedAt: providerCall.timing.startedAt,
      firstTokenAt: providerCall.timing.firstTokenAt,
      completedAt: providerCall.timing.completedAt,
      createdBy: terminal.createdBy ?? terminal.principalId,
    });

    return { runId, callId };
  }
}

/**
 * Production ledger facade. The parent run and its optional call row are
 * committed in one tenant-stamped Kysely transaction, so an immutable
 * completed run can never survive without its required provider call.
 *
 * AgentExecutionLedgerRecorder remains the pure sink orchestrator used by
 * deterministic unit tests and by this transaction boundary.
 */
export class TransactionalAgentExecutionLedgerRecorder {
  constructor(
    private readonly db: AnyDb,
    private readonly logger: AiLogger,
    private readonly metrics?: AiLogMetrics,
  ) {}

  async record(
    terminal: AgentExecutionTerminalMetadata,
  ): Promise<AgentExecutionLedgerRecordResult> {
    return this.db.transaction().execute(async (transaction) => {
      const transactionDb: AgentLedgerDb = transaction;
      const recorder = new AgentExecutionLedgerRecorder(
        new AgentRunLedgerWriter(transactionDb, this.logger, this.metrics),
        new AgentCallLedgerWriter(transactionDb, this.logger, this.metrics),
      );
      return recorder.record(terminal);
    });
  }
}

/**
 * Calculates a catalog estimate at an 8-decimal USD/currency scale using only
 * BigInt arithmetic. Returns null when usage or a needed price is unavailable.
 */
export function estimateCatalogCost(
  usage: AgentExecutionUsage,
  pricing?: AgentCatalogPriceSnapshot | null,
): AgentLedgerCost | null {
  if (!pricing) return null;

  const rates = {
    inputTokens: parseOptionalRate(pricing.inputPerMillion, "inputPerMillion"),
    cacheReadTokens: parseOptionalRate(
      pricing.cacheReadPerMillion,
      "cacheReadPerMillion",
    ),
    cacheWriteTokens: parseOptionalRate(
      pricing.cacheWritePerMillion,
      "cacheWritePerMillion",
    ),
    outputTokens: parseOptionalRate(pricing.outputPerMillion, "outputPerMillion"),
    reasoningTokens: parseOptionalRate(
      pricing.reasoningPerMillion,
      "reasoningPerMillion",
    ),
  } as const;
  const priceVersion = requiredMetadata(pricing.version, "pricing.version");
  const currency = normaliseCurrency(pricing.currency);

  if (usage.completeness === "unavailable") return null;

  let priceTokenProduct = 0n;
  let hasMeasuredCategory = false;
  for (const field of usageTokenFields) {
    const tokens = usage[field];
    if (tokens === undefined) continue;
    assertNonNegativeSafeInteger(tokens, `usage.${field}`);
    hasMeasuredCategory = true;
    if (tokens === 0) continue;

    const rate = rates[field];
    if (rate === null) return null;
    priceTokenProduct += BigInt(tokens) * rate;
  }
  if (!hasMeasuredCategory) return null;

  const scaledCost = divideRoundHalfUp(priceTokenProduct, TOKENS_PER_MILLION);
  return {
    amount: formatScaledDecimal(scaledCost, COST_SCALE),
    currency,
    basis: "catalog_estimate",
    priceVersion,
  };
}

function toLedgerUsage(usage: AgentExecutionUsage): AgentLedgerUsage {
  if (usage.completeness === "unavailable") {
    return { source: "unavailable" };
  }
  assertKnownUsage(usage);
  return {
    source: usage.completeness === "final" ? "provider_final" : "provider_stream",
    inputTokens: usage.inputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
  };
}

function validateTerminalSemantics(
  terminal: AgentExecutionTerminalMetadata,
): void {
  requiredMetadata(terminal.runId, "runId");
  requiredMetadata(terminal.tenantId, "tenantId");
  requiredMetadata(terminal.principalId, "principalId");
  requiredMetadata(terminal.threadId, "threadId");
  requiredMetadata(terminal.clientRequestId, "clientRequestId");
  requiredMetadata(terminal.responseMessageId, "responseMessageId");
  requiredMetadata(terminal.requestedPublicModelId, "requestedPublicModelId");
  durationMs(terminal.timing);
  validateUsage(terminal.usage);

  if (terminal.outcome === "completed" && terminal.usage.completeness !== "final") {
    throw new Error("A completed run requires final provider usage.");
  }
  if (terminal.outcome === "rejected" && terminal.providerCall) {
    throw new Error("A rejected run cannot contain a provider invocation.");
  }

  const call = terminal.providerCall;
  if (!call) return;
  if (call.invoked !== true) {
    throw new Error("providerCall.invoked must be true when providerCall is present.");
  }
  requiredMetadata(call.callId, "providerCall.callId");
  requiredMetadata(call.bindingId, "providerCall.bindingId");
  requiredMetadata(call.providerId, "providerCall.providerId");
  requiredMetadata(call.adapterVersion, "providerCall.adapterVersion");
  requiredMetadata(
    call.credential.fingerprint,
    "providerCall.credential.fingerprint",
  );
  durationMs(call.timing);
  validateUsage(call.usage);
  if (call.outcome === "completed" && call.usage.completeness !== "final") {
    throw new Error("A completed provider call requires final provider usage.");
  }
}

function validateUsage(usage: AgentExecutionUsage): void {
  if (usage.completeness === "unavailable") return;
  assertKnownUsage(usage);
}

function assertKnownUsage(
  usage: Exclude<AgentExecutionUsage, { completeness: "unavailable" }>,
): void {
  let hasValue = false;
  for (const field of usageTokenFields) {
    const value = usage[field];
    if (value === undefined) continue;
    hasValue = true;
    assertNonNegativeSafeInteger(value, `usage.${field}`);
  }
  if (!hasValue) {
    throw new Error("Final or partial usage must contain at least one token value.");
  }
}

function durationMs(timing: AgentExecutionTiming): number {
  const startedAtMs = validDateMs(timing.startedAt, "timing.startedAt");
  const completedAtMs = validDateMs(timing.completedAt, "timing.completedAt");
  if (completedAtMs < startedAtMs) {
    throw new Error("timing.completedAt must not precede timing.startedAt.");
  }
  if (timing.firstTokenAt !== undefined && timing.firstTokenAt !== null) {
    const firstTokenAtMs = validDateMs(
      timing.firstTokenAt,
      "timing.firstTokenAt",
    );
    if (firstTokenAtMs < startedAtMs || firstTokenAtMs > completedAtMs) {
      throw new Error(
        "timing.firstTokenAt must fall between timing.startedAt and timing.completedAt.",
      );
    }
  }
  return completedAtMs - startedAtMs;
}

function validDateMs(value: Date, field: string): number {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid Date.`);
  }
  return value.getTime();
}

function parseOptionalRate(
  value: string | null | undefined,
  field: string,
): bigint | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  if (!DECIMAL_RATE_PATTERN.test(normalized)) {
    throw new Error(
      `pricing.${field} must be a non-negative decimal with scale <= ${COST_SCALE}.`,
    );
  }
  const [whole = "0", fractional = ""] = normalized.split(".");
  return BigInt(whole) * COST_SCALE_FACTOR
    + BigInt(fractional.padEnd(COST_SCALE, "0"));
}

function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

function formatScaledDecimal(value: bigint, scale: number): string {
  const digits = value.toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, -scale);
  const fractional = digits.slice(-scale);
  return `${whole}.${fractional}`;
}

function requiredMetadata(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must not be empty.`);
  return normalized;
}

function normaliseCurrency(value?: string): string {
  const normalized = (value ?? "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("pricing.currency must be a three-letter currency code.");
  }
  return normalized;
}

function assertNonNegativeSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer.`);
  }
}

const usageTokenFields = [
  "inputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "outputTokens",
  "reasoningTokens",
] as const;
