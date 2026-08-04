/**
 * Append-only Atlas run/call ledger writers.
 *
 * These writers persist terminal operational facts only. Their public argument
 * contracts intentionally have no prompt, message, response, tool argument,
 * tool result, retrieval text, or evidence payload fields.
 */

import { randomUUID } from "node:crypto";
import type { AiLogger, AnyDb } from "./ai-runtime.types.js";
import type {
  ProviderCredentialOwner,
  ProviderCredentialSource,
} from "./provider-credential-resolver.js";

export type AgentLedgerDb = Pick<AnyDb, "insertInto">;

export type AgentRunOutcome =
  | "completed"
  | "failed"
  | "incomplete"
  | "cancelled"
  | "rejected";
export type AgentCallOutcome = "completed" | "failed" | "incomplete" | "cancelled";
export type AgentCallKind = "model" | "tool" | "retrieval";
export type AgentLedgerUsageSource =
  | "provider_final"
  | "provider_stream"
  | "estimated"
  | "unavailable";

export interface AgentLedgerUsage {
  source: AgentLedgerUsageSource;
  inputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
}

export interface AgentLedgerBilling {
  units: string;
  unitType: string;
}

export interface AgentLedgerCost {
  /**
   * Decimal string, not a JS floating-point calculation. Maximum scale is 8.
   * Example: "0.00004250".
   */
  amount: string;
  currency?: string;
  basis: "catalog_estimate" | "provider_reported" | "billing_reconciled";
  priceVersion?: string | null;
}

export interface AgentLedgerCredential {
  owner: ProviderCredentialOwner;
  source: ProviderCredentialSource;
  referenceFingerprint: string;
  fingerprint: string;
}

export interface AgentRunLedgerWriteArgs {
  runId?: string;
  tenantId: string;
  principalId: string;
  threadId: string;
  clientRequestId: string;
  responseMessageId: string;
  plane: "neon" | "mesh" | "admin";
  policyRevision?: string | null;
  dataHandlingProfileId?: string | null;
  requestedModelId: string;
  resolvedBindingId?: string | null;
  resolvedProviderId?: string | null;
  actualModelId?: string | null;
  adapterVersion?: string | null;
  providerRegion?: string | null;
  providerAccountClass?: string | null;
  promptVersion?: string | null;
  outcome: AgentRunOutcome;
  finishReason?: string | null;
  errorCode?: string | null;
  errorCategory?: string | null;
  isRetryable?: boolean | null;
  usage?: AgentLedgerUsage;
  modelCallCount?: number;
  toolCallCount?: number;
  retrievalCallCount?: number;
  retryCount?: number;
  billing?: AgentLedgerBilling | null;
  cost?: AgentLedgerCost | null;
  durationMs: number;
  startedAt: Date;
  firstTokenAt?: Date | null;
  completedAt: Date;
  correlationId?: string | null;
  traceId?: string | null;
  createdBy?: string;
}

export interface AgentCallLedgerWriteArgs {
  callId?: string;
  tenantId: string;
  runId: string;
  sequenceNo: number;
  callKind: AgentCallKind;
  operationId?: string | null;
  policyRevision?: string | null;
  dataHandlingProfileId?: string | null;
  bindingId?: string | null;
  providerId?: string | null;
  requestedModelId?: string | null;
  actualModelId?: string | null;
  adapterVersion?: string | null;
  promptVersion?: string | null;
  providerRequestId?: string | null;
  providerRegion?: string | null;
  providerAccountClass?: string | null;
  credential?: AgentLedgerCredential | null;
  outcome: AgentCallOutcome;
  finishReason?: string | null;
  errorCode?: string | null;
  errorCategory?: string | null;
  isRetryable?: boolean | null;
  retryCount?: number;
  usage?: AgentLedgerUsage;
  billing?: AgentLedgerBilling | null;
  cost?: AgentLedgerCost | null;
  durationMs: number;
  startedAt: Date;
  firstTokenAt?: Date | null;
  completedAt: Date;
  createdBy: string;
}

export interface AgentLedgerMetrics {
  writeFailed(kind: "agent_run" | "agent_call"): void;
}

export class AgentRunLedgerWriter {
  constructor(
    private readonly db: AgentLedgerDb,
    private readonly logger: AiLogger,
    private readonly metrics?: AgentLedgerMetrics,
  ) {}

  async write(args: AgentRunLedgerWriteArgs): Promise<string> {
    const runId = args.runId ?? randomUUID();
    try {
      const usage = normaliseUsage(args.usage);
      const billing = normaliseBilling(args.billing);
      const cost = normaliseCost(args.cost);
      const completedAt = completionDate(args.startedAt, args.completedAt);
      const resolvedProviderId = optionalText(args.resolvedProviderId, 64);
      const providerAccountClass = optionalText(args.providerAccountClass, 64);
      if (resolvedProviderId && !providerAccountClass) {
        throw new Error(
          "providerAccountClass is required when resolvedProviderId is present.",
        );
      }
      await this.db
        .insertInto("ai.ai_agent_run")
        .values({
          id: runId,
          tenant_id: args.tenantId,
          log_type: "system",
          principal_id: args.principalId,
          thread_id: args.threadId,
          client_request_id: args.clientRequestId,
          response_message_id: args.responseMessageId,
          plane: args.plane,
          policy_revision: optionalText(args.policyRevision, 100),
          data_handling_profile_id: optionalText(args.dataHandlingProfileId, 200),
          requested_model_id: requiredText(args.requestedModelId, "requestedModelId", 200),
          resolved_binding_id: optionalText(args.resolvedBindingId, 200),
          resolved_provider_id: resolvedProviderId,
          actual_model_id: optionalText(args.actualModelId, 200),
          adapter_version: optionalText(args.adapterVersion, 100),
          provider_region: optionalText(args.providerRegion, 64),
          provider_account_class: providerAccountClass,
          prompt_version: optionalText(args.promptVersion, 100),
          outcome: args.outcome,
          finish_reason: optionalText(args.finishReason, 64),
          error_code: optionalText(args.errorCode, 128),
          error_category: optionalText(args.errorCategory, 64),
          is_retryable: args.isRetryable ?? null,
          usage_source: usage.source,
          input_tokens: usage.inputTokens,
          cache_read_tokens: usage.cacheReadTokens,
          cache_write_tokens: usage.cacheWriteTokens,
          output_tokens: usage.outputTokens,
          reasoning_tokens: usage.reasoningTokens,
          model_call_count: nonNegativeInteger(args.modelCallCount ?? 0, "modelCallCount"),
          tool_call_count: nonNegativeInteger(args.toolCallCount ?? 0, "toolCallCount"),
          retrieval_call_count: nonNegativeInteger(
            args.retrievalCallCount ?? 0,
            "retrievalCallCount",
          ),
          retry_count: nonNegativeInteger(args.retryCount ?? 0, "retryCount"),
          billable_units: billing.units,
          billable_unit_type: billing.unitType,
          cost_amount: cost.amount,
          cost_currency: cost.currency,
          cost_basis: cost.basis,
          price_version: cost.priceVersion,
          duration_ms: nonNegativeInteger(args.durationMs, "durationMs"),
          started_at: validDate(args.startedAt, "startedAt"),
          first_token_at: optionalEventDate(
            args.startedAt,
            args.firstTokenAt,
            completedAt,
            "firstTokenAt",
          ),
          completed_at: completedAt,
          correlation_id: args.correlationId ?? null,
          trace_id: optionalText(args.traceId, 256),
          created_by: args.createdBy ?? args.principalId,
        })
        .execute();
      return runId;
    } catch (error) {
      this.metrics?.writeFailed("agent_run");
      this.logger.error("ai_agent_run_ledger_write_failed", {
        runId,
        tenantId: args.tenantId,
        errorType: safeErrorType(error),
      });
      throw error;
    }
  }
}

export class AgentCallLedgerWriter {
  constructor(
    private readonly db: AgentLedgerDb,
    private readonly logger: AiLogger,
    private readonly metrics?: AgentLedgerMetrics,
  ) {}

  async write(args: AgentCallLedgerWriteArgs): Promise<string> {
    const callId = args.callId ?? randomUUID();
    try {
      const usage = normaliseUsage(args.usage);
      const billing = normaliseBilling(args.billing);
      const cost = normaliseCost(args.cost);
      const credential = normaliseCredential(args.credential);
      const completedAt = completionDate(args.startedAt, args.completedAt);
      const providerId = optionalText(args.providerId, 64);
      const providerAccountClass = optionalText(args.providerAccountClass, 64);
      if (args.callKind === "model" && providerId && !providerAccountClass) {
        throw new Error(
          "providerAccountClass is required for a resolved model provider call.",
        );
      }
      await this.db
        .insertInto("ai.ai_agent_call")
        .values({
          id: callId,
          tenant_id: args.tenantId,
          log_type: "system",
          run_id: args.runId,
          sequence_no: nonNegativeInteger(args.sequenceNo, "sequenceNo"),
          call_kind: args.callKind,
          operation_id: optionalText(args.operationId, 200),
          policy_revision: optionalText(args.policyRevision, 100),
          data_handling_profile_id: optionalText(args.dataHandlingProfileId, 200),
          binding_id: optionalText(args.bindingId, 200),
          provider_id: providerId,
          requested_model_id: optionalText(args.requestedModelId, 200),
          actual_model_id: optionalText(args.actualModelId, 200),
          adapter_version: optionalText(args.adapterVersion, 100),
          prompt_version: optionalText(args.promptVersion, 100),
          provider_request_id: optionalText(args.providerRequestId, 500),
          provider_region: optionalText(args.providerRegion, 64),
          provider_account_class: providerAccountClass,
          credential_owner: credential.owner,
          credential_source: credential.source,
          credential_reference_hash: credential.referenceHash,
          credential_fingerprint: credential.fingerprint,
          outcome: args.outcome,
          finish_reason: optionalText(args.finishReason, 64),
          error_code: optionalText(args.errorCode, 128),
          error_category: optionalText(args.errorCategory, 64),
          is_retryable: args.isRetryable ?? null,
          retry_count: nonNegativeInteger(args.retryCount ?? 0, "retryCount"),
          usage_source: usage.source,
          input_tokens: usage.inputTokens,
          cache_read_tokens: usage.cacheReadTokens,
          cache_write_tokens: usage.cacheWriteTokens,
          output_tokens: usage.outputTokens,
          reasoning_tokens: usage.reasoningTokens,
          billable_units: billing.units,
          billable_unit_type: billing.unitType,
          cost_amount: cost.amount,
          cost_currency: cost.currency,
          cost_basis: cost.basis,
          price_version: cost.priceVersion,
          duration_ms: nonNegativeInteger(args.durationMs, "durationMs"),
          started_at: validDate(args.startedAt, "startedAt"),
          first_token_at: optionalEventDate(
            args.startedAt,
            args.firstTokenAt,
            completedAt,
            "firstTokenAt",
          ),
          completed_at: completedAt,
          created_by: args.createdBy,
        })
        .execute();
      return callId;
    } catch (error) {
      this.metrics?.writeFailed("agent_call");
      this.logger.error("ai_agent_call_ledger_write_failed", {
        callId,
        runId: args.runId,
        tenantId: args.tenantId,
        errorType: safeErrorType(error),
      });
      throw error;
    }
  }
}

function normaliseUsage(usage?: AgentLedgerUsage): {
  source: AgentLedgerUsageSource;
  inputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
} {
  return {
    source: usage?.source ?? "unavailable",
    inputTokens: optionalNonNegativeInteger(usage?.inputTokens, "inputTokens"),
    cacheReadTokens: optionalNonNegativeInteger(
      usage?.cacheReadTokens,
      "cacheReadTokens",
    ),
    cacheWriteTokens: optionalNonNegativeInteger(
      usage?.cacheWriteTokens,
      "cacheWriteTokens",
    ),
    outputTokens: optionalNonNegativeInteger(usage?.outputTokens, "outputTokens"),
    reasoningTokens: optionalNonNegativeInteger(
      usage?.reasoningTokens,
      "reasoningTokens",
    ),
  };
}

function normaliseBilling(billing?: AgentLedgerBilling | null): {
  units: string | null;
  unitType: string | null;
} {
  if (!billing) return { units: null, unitType: null };
  if (!/^(0|[1-9][0-9]{0,13})(\.[0-9]{1,6})?$/.test(billing.units)) {
    throw new Error("billing.units must be a non-negative decimal with scale <= 6.");
  }
  return {
    units: billing.units,
    unitType: requiredText(billing.unitType, "billing.unitType", 64),
  };
}

function normaliseCost(cost?: AgentLedgerCost | null): {
  amount: string | null;
  currency: string;
  basis: AgentLedgerCost["basis"] | null;
  priceVersion: string | null;
} {
  if (!cost) {
    return {
      amount: null,
      currency: "USD",
      basis: null,
      priceVersion: null,
    };
  }
  if (!/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,8})?$/.test(cost.amount)) {
    throw new Error("cost.amount must be a non-negative decimal with scale <= 8.");
  }
  const currency = (cost.currency ?? "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("cost.currency must be a three-letter uppercase code.");
  }
  return {
    amount: cost.amount,
    currency,
    basis: cost.basis,
    priceVersion: optionalText(cost.priceVersion, 100),
  };
}

function normaliseCredential(
  credential?: AgentLedgerCredential | null,
): {
  owner: ProviderCredentialOwner | null;
  source: ProviderCredentialSource | null;
  referenceHash: string | null;
  fingerprint: string | null;
} {
  if (!credential) {
    return {
      owner: null,
      source: null,
      referenceHash: null,
      fingerprint: null,
    };
  }
  return {
    owner: credential.owner,
    source: credential.source,
    referenceHash: requiredText(
      credential.referenceFingerprint,
      "credential.referenceFingerprint",
      128,
    ),
    fingerprint: requiredText(credential.fingerprint, "credential.fingerprint", 128),
  };
}

function nonNegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer.`);
  }
  return value;
}

function optionalNonNegativeInteger(
  value: number | null | undefined,
  field: string,
): number | null {
  return value === null || value === undefined
    ? null
    : nonNegativeInteger(value, field);
}

function requiredText(value: string, field: string, maxLength: number): string {
  const result = value.trim();
  if (result.length === 0 || result.length > maxLength) {
    throw new Error(`${field} must contain 1-${maxLength} characters.`);
  }
  return result;
}

function optionalText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) return null;
  const result = value.trim();
  if (result.length === 0) return null;
  if (result.length > maxLength) {
    throw new Error(`Metadata text must not exceed ${maxLength} characters.`);
  }
  return result;
}

function validDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid Date.`);
  }
  return value;
}

function completionDate(startedAt: Date, completedAt: Date): Date {
  const start = validDate(startedAt, "startedAt");
  const completion = validDate(completedAt, "completedAt");
  if (completion.getTime() < start.getTime()) {
    throw new Error("completedAt must not precede startedAt.");
  }
  return completion;
}

function optionalEventDate(
  startedAt: Date,
  value: Date | null | undefined,
  completedAt: Date,
  field: string,
): Date | null {
  if (value === null || value === undefined) return null;
  const start = validDate(startedAt, "startedAt");
  const event = validDate(value, field);
  if (event.getTime() < start.getTime() || event.getTime() > completedAt.getTime()) {
    throw new Error(`${field} must fall between startedAt and completedAt.`);
  }
  return event;
}

function safeErrorType(error: unknown): string {
  if (error instanceof Error && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(error.name)) {
    return error.name;
  }
  return "UnknownError";
}
