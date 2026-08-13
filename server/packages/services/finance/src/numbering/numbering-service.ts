import {
  FinanceContractError,
  financePermissions,
  type AllocateFinanceNumberCommand,
  type FinanceNumberAllocation,
  type FinanceNumberingPolicy,
  type FinanceNumberingPolicyReader,
  type FinanceNumberingReconciliation,
  type FinanceNumberingRepository,
  type FinanceFoundationReader,
  type FinancePermissionChecker,
} from "@athyper/server-contract-finance";
import type { FinanceAuditRecorder, FinanceOutboxWriter } from "../shared/evidence.js";

interface TransactionRunner<Transaction> { run<T>(actor: AllocateFinanceNumberCommand["actor"], work: (transaction: Transaction) => Promise<T>): Promise<T>; }

export class FinanceNumberingService<Transaction = unknown> {
  constructor(private readonly options: {
    readonly policies: FinanceNumberingPolicyReader;
    readonly repository: FinanceNumberingRepository<Transaction>;
    readonly foundation: FinanceFoundationReader;
    readonly permissions: FinancePermissionChecker;
    readonly transactions: TransactionRunner<Transaction>;
    readonly audit: FinanceAuditRecorder<Transaction>;
    readonly outbox: FinanceOutboxWriter<Transaction>;
    readonly now?: () => string;
  }) {}

  async allocate(command: AllocateFinanceNumberCommand): Promise<FinanceNumberAllocation> {
    if (!(await this.options.permissions.isAllowed(command.actor, financePermissions.numberingAllocate))) throw new FinanceContractError("FINANCE_PERMISSION_DENIED");
    const policy = await this.options.policies.resolve({ actor:command.actor,tenantId: command.actor.tenantId, companyCodeId: command.companyCodeId, documentType: command.documentType, jurisdictionCode: command.jurisdictionCode });
    if (!policy) throw new FinanceContractError("FINANCE_NOT_FOUND", "Numbering policy was not found");
    validatePolicy(policy, command);
    const period = await this.options.foundation.getBookPeriod(command.actor, command.ledgerBookId, command.fiscalPeriodId);
    if (!period || period.companyCodeId !== command.companyCodeId) throw new FinanceContractError("FINANCE_NOT_FOUND", "Book period was not found for the numbering scope");
    if (!policy.allowedPeriodStatuses.includes(period.status)) throw new FinanceContractError("FINANCE_PERIOD_CLOSED", "Number allocation is not allowed in the accounting period", { status: period.status });
    if (Number.isNaN(new Date(command.occurredAt).valueOf())) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "occurredAt must be an ISO date");
    validateFxTrace(command);

    return this.options.transactions.run(command.actor, async transaction => {
      const allocation = await this.options.repository.allocate({ command, policy, scopeKey: scopeKey(policy, command), formattedPrefix: renderPrefix(policy, command) }, transaction);
      const metadata = { formattedNumber: allocation.formattedNumber, sequence: allocation.sequence, policyId: policy.id, policyRevision: policy.revision, jurisdictionCode: policy.jurisdictionCode, mode: policy.mode, fiscalPeriodId: command.fiscalPeriodId, ...(allocation.fxTrace ? { fxTrace: allocation.fxTrace } : {}) };
      await this.options.outbox.append({ tenantId: command.actor.tenantId, topic: "finance", eventType: "finance.number.allocated", eventKey: allocation.id, aggregateType: "finance.number_allocation", aggregateId: allocation.id, actorId: command.actor.principalId, correlationId: command.actor.correlationId, payload: metadata }, transaction);
      await this.options.audit.record({ eventCode: "finance.number.allocated", action: "allocate", outcome: "success", actor: { kind: "user", principalId: command.actor.principalId }, tenantId: command.actor.tenantId, entityType: "finance.number_allocation", entityId: allocation.id, requestId: command.actor.correlationId, correlationId: command.actor.correlationId, metadata }, transaction);
      return allocation;
    });
  }

  async reconcile(input: { readonly actor: AllocateFinanceNumberCommand["actor"]; readonly policyId: string; readonly policyRevision: string; readonly fiscalPeriodId?: string }): Promise<FinanceNumberingReconciliation> {
    if (!(await this.options.permissions.isAllowed(input.actor, financePermissions.numberingReconcile))) throw new FinanceContractError("FINANCE_PERMISSION_DENIED");
    return this.options.transactions.run(input.actor,async transaction=>{
      const allocations = await this.options.repository.listAllocations({ tenantId: input.actor.tenantId, policyId: input.policyId, policyRevision: input.policyRevision, ...(input.fiscalPeriodId ? { fiscalPeriodId: input.fiscalPeriodId } : {}) },transaction);
      const counts = new Map<number, number>();
      for (const item of allocations) counts.set(item.sequence, (counts.get(item.sequence) ?? 0) + 1);
      const sequences = [...counts.keys()].sort((a, b) => a - b);
      const firstSequence = sequences[0], lastSequence = sequences.at(-1);
      const missingSequences: number[] = [];
      if (firstSequence !== undefined && lastSequence !== undefined) for (let value = firstSequence; value <= lastSequence; value += 1) if (!counts.has(value)) missingSequences.push(value);
      const duplicateSequences = sequences.filter(sequence => (counts.get(sequence) ?? 0) > 1);
      const voidedSequences = allocations.filter(item => item.voidedAt !== undefined).map(item => item.sequence).sort((a, b) => a - b);
      return { policyId: input.policyId, policyRevision: input.policyRevision, ...(input.fiscalPeriodId ? { fiscalPeriodId: input.fiscalPeriodId } : {}), ...(firstSequence === undefined ? {} : { firstSequence }), ...(lastSequence === undefined ? {} : { lastSequence }), allocationCount: allocations.length, voidedSequences, missingSequences, duplicateSequences, balanced: missingSequences.length === 0 && duplicateSequences.length === 0 };
    });
  }
}

function validatePolicy(policy: FinanceNumberingPolicy, command: AllocateFinanceNumberCommand): void {
  if (policy.documentType !== command.documentType || policy.jurisdictionCode !== command.jurisdictionCode) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Resolved numbering policy coordinates do not match the command");
  if (!Number.isInteger(policy.padding) || policy.padding < 1 || policy.padding > 20) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Numbering padding must be between 1 and 20");
}

function validateFxTrace(command: AllocateFinanceNumberCommand): void {
  const foreignCurrency = command.transactionCurrencyCode !== command.baseCurrencyCode;
  if (foreignCurrency && !command.fxTrace) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "FX source and version trace are required for foreign-currency numbering");
  if (!command.fxTrace) return;
  if (command.fxTrace.fromCurrencyCode !== command.transactionCurrencyCode || command.fxTrace.toCurrencyCode !== command.baseCurrencyCode || !command.fxTrace.sourceCode.trim() || !command.fxTrace.sourceVersion.trim() || !Number.isInteger(command.fxTrace.rateVersion) || command.fxTrace.rateVersion < 1 || Number.isNaN(new Date(command.fxTrace.rateDate).valueOf())) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "FX trace coordinates are invalid");
}

function scopeKey(policy: FinanceNumberingPolicy, command: AllocateFinanceNumberCommand): string {
  const base = `${command.actor.tenantId}:${command.companyCodeId}:${policy.id}:${policy.revision}`;
  return policy.mode === "continuous" ? base : `${base}:${command.fiscalPeriodId}`;
}

function renderPrefix(policy: FinanceNumberingPolicy, command: AllocateFinanceNumberCommand): string {
  return policy.prefix.replaceAll("{jurisdiction}", command.jurisdictionCode).replaceAll("{period}", command.fiscalPeriodId).replaceAll("{documentType}", command.documentType);
}
