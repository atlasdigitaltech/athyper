export type FxPolicyScopeType = "tenant" | "company" | "book";
export type FxRatePurpose = "transaction" | "revaluation";
export type FxHealthState = "healthy" | "missing" | "stale" | "manual_override_required" | "fallback_exhausted";

export interface FxCapability {
  allowed: boolean;
  permission: string;
  reasonCode: string | null;
}

export interface FxPermissions {
  view: FxCapability;
  configure: FxCapability;
  advancedConfigure: FxCapability;
  addRate: FxCapability;
  replaceRate: FxCapability;
  importRates: FxCapability;
  exportRates: FxCapability;
}

export interface FxExposureSource {
  sourceType: "ledger_book" | "bank_account" | "payment_policy" | "settlement_rule";
  sourceId: string;
  currencyCode: string;
  purpose: FxRatePurpose;
  bookId: string | null;
  bookCode: string | null;
  detail: Record<string, unknown>;
}

export interface FxRateRequirement {
  requirementKey: string;
  fromCurrency: string;
  toCurrency: string;
  rateType: string;
  purpose: FxRatePurpose;
  requiredAsOfDate: string;
  observedAt: string;
  bookId: string | null;
  bookCode: string | null;
  exposureSources: FxExposureSource[];
  state: FxHealthState;
  reasonCode: string;
  blocksOperation: boolean;
  manualOverride: {
    allowed: boolean;
    approvalRequired: boolean;
  };
  selectedRate: Record<string, unknown> | null;
}

export const deniedCapability = (permission: string, reasonCode: string): FxCapability => ({
  allowed: false,
  permission,
  reasonCode,
});

export const allowedCapability = (permission: string): FxCapability => ({
  allowed: true,
  permission,
  reasonCode: null,
});
