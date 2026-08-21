import type { FinanceActor } from "./commands.js";
import type { BookPeriodStatus } from "./foundation.js";

export type FinanceNumberingMode = "continuous" | "fiscal_period" | "gapless";

export interface FinanceNumberingPolicy {
  readonly id: string;
  readonly revision: string;
  readonly jurisdictionCode: string;
  readonly documentType: string;
  readonly mode: FinanceNumberingMode;
  readonly prefix: string;
  readonly formatTemplate?: string;
  readonly padding: number;
  readonly padCharacter?: string;
  readonly startValue?: number;
  readonly incrementBy?: number;
  readonly maximumValue?: number;
  readonly source?: "tenant" | "global";
  readonly allowedPeriodStatuses: readonly BookPeriodStatus[];
}

/** Immutable rate coordinates stored with a numbered foreign-currency document. */
export interface FinanceFxTrace {
  readonly sourceCode: string;
  readonly sourceVersion: string;
  readonly rateId: string;
  readonly rateVersion: number;
  readonly rateDate: string;
  readonly fromCurrencyCode: string;
  readonly toCurrencyCode: string;
  readonly rate: string;
}

export interface AllocateFinanceNumberCommand {
  readonly actor: FinanceActor;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
  readonly companyCodeId: string;
  readonly ledgerBookId: string;
  readonly fiscalPeriodId: string;
  readonly documentId: string;
  readonly documentType: string;
  readonly jurisdictionCode: string;
  readonly transactionCurrencyCode: string;
  readonly baseCurrencyCode: string;
  readonly fxTrace?: FinanceFxTrace;
}

export interface FinanceNumberAllocation {
  readonly id: string;
  readonly tenantId: string;
  readonly documentId: string;
  readonly documentType: string;
  readonly jurisdictionCode: string;
  readonly fiscalPeriodId: string;
  readonly sequence: number;
  readonly formattedNumber: string;
  readonly policyId: string;
  readonly policyRevision: string;
  readonly fxTrace?: FinanceFxTrace;
  readonly allocatedAt: string;
  readonly voidedAt?: string;
  readonly voidReason?: string;
}

export interface FinanceNumberingReconciliation {
  readonly policyId: string;
  readonly policyRevision: string;
  readonly fiscalPeriodId?: string;
  readonly firstSequence?: number;
  readonly lastSequence?: number;
  readonly allocationCount: number;
  readonly voidedSequences: readonly number[];
  readonly missingSequences: readonly number[];
  readonly duplicateSequences: readonly number[];
  readonly balanced: boolean;
}

export interface FinanceNumberingPolicyReader {
  resolve(input: { readonly actor: FinanceActor; readonly tenantId: string; readonly companyCodeId: string; readonly documentType: string; readonly jurisdictionCode: string }): Promise<FinanceNumberingPolicy | undefined>;
}

export interface FinanceNumberingRepository<Transaction = unknown> {
  allocate(input: { readonly command: AllocateFinanceNumberCommand; readonly policy: FinanceNumberingPolicy; readonly scopeKey: string; readonly formattedPrefix: string }, transaction: Transaction): Promise<FinanceNumberAllocation>;
  listAllocations(input: { readonly tenantId: string; readonly policyId: string; readonly policyRevision: string; readonly fiscalPeriodId?: string }, transaction?: Transaction): Promise<readonly FinanceNumberAllocation[]>;
}
