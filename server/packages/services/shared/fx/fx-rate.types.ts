import type { Kysely } from "kysely";

export type AnyDb = Kysely<any>;

export type FxRateType =
  | "SPOT"
  | "PERIOD_AVG"
  | "PERIOD_END"
  | "BUDGET"
  | "CONTRACTED"
  | "HISTORICAL"
  | "MANUAL";

export type FxRateSource =
  | "identity"
  | "spot"
  | "commitment_fixed"
  | "reference_document"
  | "manual_override";

export type FxRateLookupParams = {
  tenantId: string;
  fromCurrency: string;
  toCurrency: string;
  asOf?: string | Date | null;
  rateType?: FxRateType | string | null;
  pivotCurrency?: string | null;
};

export type FxRateLookupResult = {
  rate: number | null;
  method: string;
  source: string | null;
  effectiveDate: string | null;
  fromCurrency: string;
  toCurrency: string;
  rateType: string;
  asOf: string;
  pivotCurrency: string;
};

export interface FxRateSnapshot {
  source: FxRateSource;
  rateType: "SPOT" | "CONTRACTED" | "HISTORICAL" | "MANUAL";
  asOfDate: string;
  sourceDocumentType?: string | null;
  sourceDocumentId?: string | null;
  fixed: boolean;
  resolver: "fx.resolve_rate";
  resolvedAt: string;
  lookupMethod?: string | null;
  lookupSource?: string | null;
  effectiveDate?: string | null;
}

export interface ResolveDocumentFxRateInput {
  tenantId: string;
  companyCodeId?: string | null;
  currencyCode?: string | null;
  baseCurrencyCode?: string | null;
  exchangeRate?: unknown;
  eventDate?: string | Date | null;
  rateType?: FxRateType | string | null;
  pivotCurrency?: string | null;
  referenceDocumentType?: string | null;
  referenceDocumentId?: string | null;
  commitmentId?: string | null;
  fxPolicy?: string | null;
  allowManualOverride?: boolean;
  manualExchangeRate?: unknown;
}

export interface ResolveDocumentFxRateResult {
  currency_code: string;
  base_currency_code: string;
  exchange_rate: number;
  fx_rate_snapshot: FxRateSnapshot;
}
