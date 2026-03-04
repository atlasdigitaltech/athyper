// framework/runtime/src/services/business/engines/tax-engine/domain/types.ts

// --- Tax Jurisdiction ---

export type JurisdictionType = "COUNTRY" | "STATE" | "CITY" | "SPECIAL_ZONE";
export type TaxType = "VAT" | "GST" | "SALES_TAX" | "WHT" | "EXCISE" | "CUSTOMS";

export interface TaxJurisdiction {
    id: string;
    tenantId: string;
    code: string;
    name: string;
    countryCode: string;
    stateRegionCode: string | null;
    jurisdictionType: JurisdictionType;
    parentId: string | null;
    isActive: boolean;
    createdAt: Date;
}

export interface CreateTaxJurisdictionInput {
    tenantId: string;
    code: string;
    name: string;
    countryCode: string;
    stateRegionCode?: string;
    jurisdictionType: JurisdictionType;
    parentId?: string;
}

// --- Tax Rate ---

export interface TaxRate {
    id: string;
    tenantId: string;
    jurisdictionId: string;
    taxType: TaxType;
    taxCode: string;
    rate: string;
    description: string | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    categoryFilter: Record<string, unknown> | null;
    isReverseCharge: boolean;
    treatyRate: string | null;
    createdAt: Date;
}

export interface CreateTaxRateInput {
    tenantId: string;
    jurisdictionId: string;
    taxType: TaxType;
    taxCode: string;
    rate: string;
    description?: string;
    effectiveFrom: Date;
    effectiveTo?: Date;
    categoryFilter?: Record<string, unknown>;
    isReverseCharge?: boolean;
    treatyRate?: string;
}

// --- Tax Calculation ---

export interface TaxCalculation {
    id: string;
    tenantId: string;
    txnId: string;
    docId: string;
    commitmentId: string | null;
    lineItemIndex: number | null;
    jurisdictionId: string;
    taxType: TaxType;
    taxCode: string;
    baseAmount: string;
    taxRate: string;
    taxAmount: string;
    currencyCode: string;
    isReverseCharge: boolean;
    isWht: boolean;
    whtCertificateNo: string | null;
    isInputCreditEligible: boolean;
    calculatedAt: Date;
}

export interface CalculateTaxInput {
    tenantId: string;
    txnId: string;
    docId: string;
    commitmentId?: string;
    lineItemIndex?: number;
    jurisdictionCode: string;
    taxCode: string;
    baseAmount: string;
    currencyCode: string;
    transactionDate: Date;
    vendorCountryCode?: string;
    categoryCode?: string;
}

export interface TaxCalculationResult {
    calculations: TaxCalculation[];
    totalTaxAmount: string;
    totalBaseAmount: string;
    effectiveRate: string;
}

// --- Tax Credit Ledger ---

export interface TaxCreditLedger {
    id: string;
    tenantId: string;
    entityCode: string;
    jurisdictionId: string;
    fiscalYear: number;
    periodNumber: number;
    inputCredits: string;
    outputLiability: string;
    netPosition: string;
    reconciled: boolean;
    reconciledAt: Date | null;
    createdAt: Date;
}
