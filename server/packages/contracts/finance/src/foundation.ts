import type { FinanceActor } from "./commands.js";

export type FinanceDecimal = string;
export type BookPeriodStatus = "future" | "open" | "soft_close" | "hard_close";
export type FinanceRoundingMethod =
  "ROUND_HALF_UP" | "ROUND_HALF_EVEN" | "ROUND_DOWN" | "ROUND_UP";
export type RoundingSlot =
  | "UNIT_PRICE"
  | "LINE_DISCOUNT"
  | "LINE_NET"
  | "LINE_TAX"
  | "LINE_GROSS"
  | "DOCUMENT_SUBTOTAL"
  | "DOCUMENT_TAX"
  | "DOCUMENT_TOTAL"
  | "EXCHANGE_RATE"
  | "WITHHOLDING_TAX"
  | "UNIT_QUANTITY"
  | "LINE_QUANTITY"
  | "WEIGHT"
  | "VOLUME"
  | "PERCENTAGE";

export interface FinanceCoordinates {
  readonly companyCodeId: string;
  readonly ledgerBookId: string;
  readonly fiscalPeriodId: string;
  readonly currencyCode: string;
}

export interface RoundingResolutionRequest {
  readonly tenantId: string;
  readonly actor?: FinanceActor;
  readonly companyCodeId?: string;
  readonly currencyCode?: string;
  readonly slot?: RoundingSlot;
}

export interface RoundingRuleCandidate {
  readonly contextId: string;
  readonly companyCodeId?: string;
  readonly currencyCode?: string;
  readonly slot?: RoundingSlot;
  readonly ruleId: string;
  readonly ruleCode: string;
  readonly method: FinanceRoundingMethod;
  readonly precisionDigits?: number;
  readonly roundingIncrement?: FinanceDecimal;
  readonly revision: string;
  readonly contextRevision?: string;
  readonly ruleRevision?: string;
}

export interface CurrencyRoundingDefaults {
  readonly currencyCode: string;
  readonly minorUnits: number;
  readonly roundingIncrement?: FinanceDecimal;
  readonly revision: string;
}

export interface RoundingEvidence {
  readonly source: "rule" | "currency_default";
  readonly method: FinanceRoundingMethod;
  readonly precisionDigits: number;
  readonly roundingIncrement: FinanceDecimal;
  readonly specificity: number;
  readonly revision: string;
  readonly contextRevision?: string;
  readonly ruleRevision?: string;
  readonly currencyRevision?: string;
  readonly evidenceHash: string;
  readonly contextId?: string;
  readonly ruleId?: string;
  readonly ruleCode?: string;
}

export interface BookPeriodRecord extends FinanceCoordinates {
  readonly tenantId: string;
  readonly id: string;
  readonly status: BookPeriodStatus;
  readonly version: number;
}

export interface BookPeriodTransitionCommand {
  readonly actor: FinanceActor;
  readonly coordinates: Omit<FinanceCoordinates, "currencyCode">;
  readonly targetStatus: BookPeriodStatus;
  readonly expectedVersion: number;
  readonly authorizeReopen?: boolean;
  readonly reopenReason?: string;
  readonly reopenApprovalEvidence?: Readonly<Record<string, unknown>>;
}

export interface LedgerBookEvidence {
  readonly id: string;
  readonly companyCodeId: string;
  readonly baseCurrencyCode: string;
  readonly active: boolean;
  readonly assignmentRevision: string;
}

export interface CurrencyEvidence {
  readonly currencyCode: string;
  readonly active: boolean;
  readonly minorUnits: number;
  readonly revision: string;
}

export interface SourceDocumentEvidence {
  readonly sourceType: string;
  readonly sourceId: string;
  readonly version: number;
  readonly hash: string;
}

export interface PostingGuardRequest {
  readonly actor: FinanceActor;
  readonly permissionCode: string;
  readonly coordinates: FinanceCoordinates;
  readonly roundingSlot: RoundingSlot;
  readonly source: SourceDocumentEvidence;
}

export interface PostingAdmission {
  readonly coordinates: FinanceCoordinates;
  readonly book: LedgerBookEvidence;
  readonly period: BookPeriodRecord;
  readonly currency: CurrencyEvidence;
  readonly rounding: RoundingEvidence;
  readonly source: SourceDocumentEvidence;
  readonly evidenceHash: string;
}

export type PeriodAdmission = Pick<
  PostingAdmission,
  "book" | "period" | "currency"
>;
export interface FinancePeriodAdmissionGuard {
  assertPeriodOpen(
    actor: FinanceActor,
    coordinates: FinanceCoordinates,
  ): Promise<PeriodAdmission>;
}

/** Compatibility alias; the domain-specific declaration is canonical. */
export type { FinanceRoundingMethod as RoundingMethod };
