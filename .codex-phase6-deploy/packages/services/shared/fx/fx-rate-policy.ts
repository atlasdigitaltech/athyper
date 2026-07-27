import { sql } from "kysely";
import { asIsoDate, positiveFxRateInput, resolveFxRate } from "./fx-rate.service.js";
import { buildFxRateSnapshot } from "./fx-rate-snapshot.js";
import type {
  AnyDb,
  ResolveDocumentFxRateInput,
  ResolveDocumentFxRateResult,
} from "./fx-rate.types.js";

interface ReferenceFxRow {
  currency_code: string | null;
  base_currency_code: string | null;
  exchange_rate: string | number | null;
}

export async function resolveDocumentFxRate(
  db: AnyDb,
  input: ResolveDocumentFxRateInput,
): Promise<ResolveDocumentFxRateResult | null> {
  const currencyCode = normalizeCurrency(input.currencyCode);
  const baseCurrencyCode = normalizeCurrency(input.baseCurrencyCode);
  const asOfDate = asIsoDate(input.eventDate);

  if (!currencyCode || !baseCurrencyCode) return null;

  if (currencyCode === baseCurrencyCode) {
    return buildResult(currencyCode, baseCurrencyCode, 1, {
      source: "identity",
      rateType: "SPOT",
      asOfDate,
      fixed: true,
      effectiveDate: asOfDate,
    });
  }

  const manualRate = positiveFxRateInput(input.manualExchangeRate ?? input.exchangeRate);
  if (input.allowManualOverride && manualRate) {
    return buildResult(currencyCode, baseCurrencyCode, manualRate, {
      source: "manual_override",
      rateType: "MANUAL",
      asOfDate,
      fixed: true,
      effectiveDate: asOfDate,
    });
  }

  const reference = await resolveReferenceRate(db, input);
  if (reference) {
    return buildResult(currencyCode, baseCurrencyCode, reference.rate, {
      source: reference.source,
      rateType: reference.rateType,
      asOfDate: reference.asOfDate,
      sourceDocumentType: reference.sourceDocumentType,
      sourceDocumentId: reference.sourceDocumentId,
      fixed: true,
      effectiveDate: reference.asOfDate,
    });
  }

  const lookup = await resolveFxRate(db, {
    tenantId: input.tenantId,
    fromCurrency: currencyCode,
    toCurrency: baseCurrencyCode,
    asOf: asOfDate,
    rateType: input.rateType ?? "SPOT",
    pivotCurrency: input.pivotCurrency,
  });

  if (!lookup.rate) return null;

  return buildResult(currencyCode, baseCurrencyCode, lookup.rate, {
    source: "spot",
    rateType: "SPOT",
    asOfDate,
    fixed: false,
    lookupMethod: lookup.method,
    lookupSource: lookup.source,
    effectiveDate: lookup.effectiveDate,
  });
}

async function resolveReferenceRate(
  db: AnyDb,
  input: ResolveDocumentFxRateInput,
): Promise<{
  rate: number;
  source: "commitment_fixed" | "reference_document";
  rateType: "CONTRACTED" | "HISTORICAL";
  asOfDate: string;
  sourceDocumentType: string;
  sourceDocumentId: string;
} | null> {
  const commitmentId = readId(input.commitmentId);
  if (commitmentId && isFixedPolicy(input.fxPolicy)) {
    const row = await loadCommitmentFx(db, input.tenantId, commitmentId);
    const rate = positiveFxRateInput(row?.exchange_rate);
    if (rate) {
      return {
        rate,
        source: "commitment_fixed",
        rateType: "CONTRACTED",
        asOfDate: asIsoDate(input.eventDate),
        sourceDocumentType: "commitment",
        sourceDocumentId: commitmentId,
      };
    }
  }

  const referenceId = readId(input.referenceDocumentId);
  const referenceType = readReferenceType(input.referenceDocumentType);
  if (!referenceId || !referenceType) return null;

  const row = await loadReferenceFx(db, input.tenantId, referenceType, referenceId);
  const rate = positiveFxRateInput(row?.exchange_rate);
  if (!rate) return null;

  return {
    rate,
    source: "reference_document",
    rateType: "HISTORICAL",
    asOfDate: asIsoDate(input.eventDate),
    sourceDocumentType: referenceType,
    sourceDocumentId: referenceId,
  };
}

async function loadCommitmentFx(
  db: AnyDb,
  tenantId: string,
  commitmentId: string,
): Promise<ReferenceFxRow | null> {
  const rows = await sql<ReferenceFxRow>`
    SELECT currency_code, base_currency_code, exchange_rate
      FROM document.commitment
     WHERE id        = ${commitmentId}::uuid
       AND tenant_id = ${tenantId}::uuid
     LIMIT 1
  `.execute(db);
  return rows.rows[0] ?? null;
}

async function loadReferenceFx(
  db: AnyDb,
  tenantId: string,
  referenceType: string,
  referenceId: string,
): Promise<ReferenceFxRow | null> {
  if (referenceType !== "purchase_invoice") return null;
  const rows = await sql<ReferenceFxRow>`
    SELECT currency_code, base_currency_code, exchange_rate
      FROM document.purchase_invoice
     WHERE id        = ${referenceId}::uuid
       AND tenant_id = ${tenantId}::uuid
     LIMIT 1
  `.execute(db);
  return rows.rows[0] ?? null;
}

function buildResult(
  currencyCode: string,
  baseCurrencyCode: string,
  exchangeRate: number,
  snapshot: Parameters<typeof buildFxRateSnapshot>[0],
): ResolveDocumentFxRateResult {
  return {
    currency_code: currencyCode,
    base_currency_code: baseCurrencyCode,
    exchange_rate: exchangeRate,
    fx_rate_snapshot: buildFxRateSnapshot(snapshot),
  };
}

function normalizeCurrency(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim().toUpperCase();
  return trimmed || null;
}

function readId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readReferenceType(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim().replace(/-/g, "_") : "";
  return normalized || null;
}

function isFixedPolicy(value: unknown): boolean {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "fixed_at_commitment" || normalized === "manual_contract_rate" || normalized === "commitment_fixed";
}
