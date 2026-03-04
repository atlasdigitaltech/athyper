// framework/runtime/src/services/business/engines/federation-engine/domain/types.ts

// --- Legal Entity ---

export type EntityType = "PARENT" | "SUBSIDIARY" | "ASSOCIATE" | "JOINT_VENTURE" | "BRANCH";
export type ConsolidationMethod = "FULL" | "PROPORTIONAL" | "EQUITY" | "NONE";
export type ICTxnType = "SALE" | "PURCHASE" | "LOAN" | "RECHARGE" | "DIVIDEND";
export type ICTxnStatus = "CREATED" | "MIRRORED" | "PRICED" | "POSTED" | "NETTED" | "SETTLED";
export type FxRateType = "SPOT" | "PERIOD_AVG" | "PERIOD_END" | "BUDGET";
export type AgreementType = "GOODS" | "SERVICES" | "LOAN" | "ROYALTY" | "MANAGEMENT_FEE";
export type TransferPricingMethod = "CUP" | "RESALE_MINUS" | "COST_PLUS" | "TNMM" | "PROFIT_SPLIT";
export type EliminationType = "IC_REVENUE_EXPENSE" | "IC_RECEIVABLE_PAYABLE" | "IC_PROFIT" | "MINORITY_INTEREST" | "INVESTMENT";
export type NettingStatus = "PROPOSED" | "APPROVED" | "SETTLED";

export interface LegalEntity {
    id: string;
    tenantId: string;
    code: string;
    name: string;
    countryCode: string;
    functionalCurrency: string;
    reportingCurrency: string;
    entityType: EntityType;
    parentEntityId: string | null;
    consolidationMethod: ConsolidationMethod;
    ownershipPct: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateLegalEntityInput {
    tenantId: string;
    code: string;
    name: string;
    countryCode: string;
    functionalCurrency: string;
    reportingCurrency: string;
    entityType: EntityType;
    parentEntityId?: string;
    consolidationMethod?: ConsolidationMethod;
    ownershipPct?: string;
}

// --- IC Agreement ---

export interface IntercompanyAgreement {
    id: string;
    tenantId: string;
    sourceEntityCode: string;
    destEntityCode: string;
    agreementType: AgreementType;
    transferPricingMethod: TransferPricingMethod;
    markupPct: string | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    isActive: boolean;
}

// --- IC Transaction ---

export interface IntercompanyTransaction {
    id: string;
    tenantId: string;
    sourceEntityCode: string;
    destEntityCode: string;
    sourceDocId: string | null;
    destDocId: string | null;
    txnType: ICTxnType;
    amount: string;
    currencyCode: string;
    transferPrice: string | null;
    armLengthPrice: string | null;
    sourceJeId: string | null;
    destJeId: string | null;
    nettingBatchId: string | null;
    status: ICTxnStatus;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateICTransactionInput {
    tenantId: string;
    sourceEntityCode: string;
    destEntityCode: string;
    txnType: ICTxnType;
    amount: string;
    currencyCode: string;
    sourceDocId?: string;
}

// --- FX Rate ---

export interface FxRate {
    id: string;
    tenantId: string;
    fromCurrency: string;
    toCurrency: string;
    rateType: FxRateType;
    rate: string;
    effectiveDate: Date;
    source: string | null;
}

export interface CreateFxRateInput {
    tenantId: string;
    fromCurrency: string;
    toCurrency: string;
    rateType: FxRateType;
    rate: string;
    effectiveDate: Date;
    source?: string;
}

// --- FX Revaluation ---

export interface FxRevaluation {
    id: string;
    tenantId: string;
    entityCode: string;
    accountId: string;
    originalCurrency: string;
    functionalCurrency: string;
    originalAmount: string;
    originalFunctionalAmount: string;
    revaluedFunctionalAmount: string;
    unrealizedGainLoss: string;
    revaluationDate: Date;
    fiscalYear: number;
    periodNumber: number;
    referenceJeId: string | null;
    autoReversed: boolean;
}

// --- Consolidation Elimination ---

export interface ConsolidationElimination {
    id: string;
    tenantId: string;
    fiscalYear: number;
    periodNumber: number;
    eliminationType: EliminationType;
    sourceEntityCode: string;
    destEntityCode: string;
    amount: string;
    currencyCode: string;
    referenceJeId: string | null;
    status: string;
    createdAt: Date;
}

// --- Netting Batch ---

export interface NettingBatch {
    id: string;
    tenantId: string;
    batchDate: Date;
    entityPair: string;
    grossAmount: string;
    netAmount: string;
    currencyCode: string;
    status: NettingStatus;
    settlementJeIds: string[];
    createdAt: Date;
}
