import type { FinanceActor, FinanceCommand } from "./commands.js";
import type { FinanceCoordinates, FinanceDecimal, SourceDocumentEvidence } from "./foundation.js";
import type { FinanceCommandResult } from "./results.js";

export interface JournalEvidenceRef extends SourceDocumentEvidence {
  readonly sourceType: "document.journal_entry";
}

export interface CanonicalJournalLine {
  readonly id: string;
  readonly lineNo: number;
  readonly glAccountId: string;
  readonly transactionCurrencyCode: string;
  readonly transactionDebit: FinanceDecimal;
  readonly transactionCredit: FinanceDecimal;
  readonly baseCurrencyCode: string;
  readonly baseDebit: FinanceDecimal;
  readonly baseCredit: FinanceDecimal;
  readonly costCenterId?: string;
  readonly profitCenterId?: string;
  readonly projectId?: string;
  readonly dimensionSetId?: string;
}

/** Read-only snapshot supplied by the canonical journal owner. */
export interface CanonicalJournalSnapshot extends FinanceCoordinates {
  readonly journalEntryId: string;
  readonly companyCodeId: string;
  readonly status: "posted";
  readonly version: number;
  readonly hash: string;
  readonly transactionCurrencyCode: string;
  readonly baseCurrencyCode: string;
  readonly totalDebit: FinanceDecimal;
  readonly totalCredit: FinanceDecimal;
  readonly lineCount: number;
  readonly postedAt: string;
  readonly lines: readonly CanonicalJournalLine[];
}

export interface CanonicalJournalSourcePort {
  loadImmutable(actor: FinanceActor, evidence: JournalEvidenceRef): Promise<CanonicalJournalSnapshot | undefined>;
  validateDimensionScope(actor: FinanceActor, journal: CanonicalJournalSnapshot): Promise<readonly string[]>;
}

export interface GlCoordinate extends FinanceCoordinates {
  readonly glAccountId: string;
  readonly costCenterId?: string;
  readonly profitCenterId?: string;
  readonly projectId?: string;
  readonly dimensionSetId?: string;
}

export interface GlBalance extends GlCoordinate {
  readonly id: string;
  readonly openingDebit: FinanceDecimal;
  readonly openingCredit: FinanceDecimal;
  readonly periodDebit: FinanceDecimal;
  readonly periodCredit: FinanceDecimal;
  readonly closingDebit: FinanceDecimal;
  readonly closingCredit: FinanceDecimal;
  readonly lastAppliedSequence: number;
  readonly lastIdempotencyKey: string;
  readonly lastJournalEntryId: string;
  readonly lastPostedAt: string;
  readonly versionNumber: number;
}
export interface GlBalanceQuery extends Pick<GlCoordinate,"companyCodeId"|"ledgerBookId"|"fiscalPeriodId"> {readonly glAccountId?:string;readonly currencyCode?:string;}
export interface GlReconciliation {readonly query:GlBalanceQuery;readonly balances:readonly GlBalance[];readonly periodDebit:FinanceDecimal;readonly periodCredit:FinanceDecimal;readonly balanced:boolean;}

export type GlPostingPayload = Readonly<Record<string, unknown>> & {
  readonly journal: JournalEvidenceRef;
  readonly postingSequence: number;
};
export type GlPostingCommand = FinanceCommand<GlPostingPayload>;
export type GlPostingOutput = Readonly<Record<string, unknown>> & { readonly journalEntryId: string; readonly balances: readonly GlBalance[]; readonly admissionEvidenceHash: string };

export interface GlBalanceRepository<Transaction = unknown> {
  applyAggregate(input: { readonly actor: FinanceActor; readonly coordinate: GlCoordinate; readonly debit: FinanceDecimal; readonly credit: FinanceDecimal; readonly postingSequence: number; readonly idempotencyKey: string; readonly journalEntryId: string; readonly postedAt: string }, transaction: Transaction): Promise<{ readonly balance: GlBalance; readonly replayed: boolean }>;
  list?(actor:FinanceActor,query:GlBalanceQuery,transaction:Transaction):Promise<readonly GlBalance[]>;
}

export interface GlPostingServiceContract { post(command: GlPostingCommand): Promise<FinanceCommandResult<GlPostingOutput>>; }

export interface CrossBookPolicyEvidence {
  readonly policyId: string;
  readonly effectiveFrom: string;
  readonly version: number;
  readonly hash: string;
  readonly companyCodeId: string;
  readonly destinationLedgerBookId: string;
}
export interface CrossBookPostingPayload extends Readonly<Record<string, unknown>> {
  readonly sourceJournal: JournalEvidenceRef;
  readonly policy: CrossBookPolicyEvidence;
}
export type CrossBookPostingCommand = FinanceCommand<CrossBookPostingPayload>;
export type CrossBookExecutionStatus = "pending" | "processing" | "succeeded" | "failed" | "cancelled";
export interface CrossBookPostingExecution {
  readonly id: string;
  readonly tenantId: string;
  readonly companyCodeId: string;
  readonly sourceJournalEntryId: string;
  readonly crossBookPostingPolicyId: string;
  readonly postingPolicyEffectiveFrom: string;
  readonly destinationCommandId: string;
  readonly idempotencyKey: string;
  readonly status: CrossBookExecutionStatus;
  readonly attemptCount: number;
  readonly targetJournalEntryId?: string;
  readonly errorCode?: string;
  readonly errorDetail?: Readonly<Record<string, unknown>>;
  readonly evidencePayload: Readonly<Record<string, unknown>>;
  readonly versionNumber: number;
}
export interface CrossBookPolicyPort { loadImmutable(actor: FinanceActor, evidence: CrossBookPolicyEvidence): Promise<CrossBookPolicyEvidence | undefined>; }
export interface DestinationJournalCommandPort {
  createDerivedJournal(input: { readonly actor: FinanceActor; readonly commandId: string; readonly idempotencyKey: string; readonly source: CanonicalJournalSnapshot; readonly policy: CrossBookPolicyEvidence }): Promise<{ readonly journalEntryId: string; readonly replayed: boolean; readonly evidence: Readonly<Record<string, unknown>> }>;
}
export interface CrossBookExecutionRepository<Transaction = unknown> {
  create(command: CrossBookPostingCommand, input: { readonly destinationCommandId: string; readonly evidencePayload: Readonly<Record<string, unknown>> }, transaction: Transaction): Promise<{ readonly execution: CrossBookPostingExecution; readonly replayed: boolean }>;
  claim(actor: FinanceActor, executionId: string, transaction: Transaction): Promise<CrossBookPostingExecution | undefined>;
  succeed(actor: FinanceActor, executionId: string, targetJournalEntryId: string, evidence: Readonly<Record<string, unknown>>, transaction: Transaction): Promise<CrossBookPostingExecution>;
  fail(actor: FinanceActor, executionId: string, errorCode: string, detail: Readonly<Record<string, unknown>>, transaction: Transaction): Promise<CrossBookPostingExecution>;
  get(actor: FinanceActor, executionId: string, transaction?: Transaction): Promise<CrossBookPostingExecution | undefined>;
}

export type CommitmentFulfillmentType = "goods_receipt" | "service_acceptance" | "invoice_match" | "payment" | "milestone_completion" | "advance_recovery" | "retention_release";
export interface CommitmentSourceEvidence extends SourceDocumentEvidence { readonly sourceLineId?: string; }
export interface CommitmentLineSnapshot {
  readonly commitmentId: string;
  readonly commitmentLineId: string;
  readonly companyCodeId: string;
  readonly quantity?: FinanceDecimal;
  readonly uomCode?: string;
  readonly amount: FinanceDecimal;
  readonly currencyCode: string;
  readonly baseAmount: FinanceDecimal;
  readonly baseCurrencyCode: string;
  readonly version: number;
  readonly hash: string;
}
export interface CommitmentFulfillment {
  readonly id: string; readonly companyCodeId: string; readonly commitmentId: string; readonly commitmentLineId: string;
  readonly fulfillmentType: CommitmentFulfillmentType; readonly fulfillmentDate: string; readonly fiscalPeriodId: string;
  readonly quantity?: FinanceDecimal; readonly uomCode?: string; readonly amount: FinanceDecimal; readonly currencyCode: string;
  readonly baseAmount: FinanceDecimal; readonly baseCurrencyCode: string; readonly exchangeRate: FinanceDecimal;
  readonly source: CommitmentSourceEvidence; readonly reversesFulfillmentId?: string; readonly idempotencyKey: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}
export type CommitmentFulfillmentPayload = Readonly<Record<string, unknown>> & Omit<CommitmentFulfillment, "id" | "idempotencyKey" | "metadata"> & { readonly postingCoordinates: FinanceCoordinates; readonly sourceSnapshot: CommitmentLineSnapshot; readonly metadata?: Readonly<Record<string, unknown>> };
export type CommitmentFulfillmentCommand = FinanceCommand<CommitmentFulfillmentPayload>;
export interface CommitmentPosition { readonly commitmentId: string; readonly commitmentLineId: string; readonly committedQuantity?: FinanceDecimal; readonly actualQuantity?: FinanceDecimal; readonly remainingQuantity?: FinanceDecimal; readonly committedAmount: FinanceDecimal; readonly actualAmount: FinanceDecimal; readonly remainingAmount: FinanceDecimal; readonly currencyCode: string; readonly committedBaseAmount: FinanceDecimal; readonly actualBaseAmount: FinanceDecimal; readonly remainingBaseAmount: FinanceDecimal; readonly baseCurrencyCode: string; }
export interface CommitmentSourcePort {
  loadImmutable(actor: FinanceActor, snapshot: CommitmentLineSnapshot): Promise<CommitmentLineSnapshot | undefined>;
  loadFulfillmentSource(actor: FinanceActor, evidence: CommitmentSourceEvidence): Promise<SourceDocumentEvidence | undefined>;
}
export interface CommitmentRepository<Transaction = unknown> {
  append(command: CommitmentFulfillmentCommand, transaction: Transaction): Promise<CommitmentFulfillment>;
  get(actor: FinanceActor, fulfillmentId: string, transaction: Transaction): Promise<CommitmentFulfillment | undefined>;
  list(actor: FinanceActor, commitmentId: string, commitmentLineId: string, transaction?: Transaction): Promise<readonly CommitmentFulfillment[]>;
}
export interface CommitmentServiceContract { fulfill(command: CommitmentFulfillmentCommand): Promise<FinanceCommandResult<Readonly<Record<string, unknown>> & { readonly fulfillment: CommitmentFulfillment }>>; position(actor: FinanceActor, snapshot: CommitmentLineSnapshot): Promise<CommitmentPosition>; }
