import { resolveDocumentFxRate } from "../../fx/index.js";
import type { ResolveDocumentFxRateResult } from "../../fx/index.js";
import { registerResolver, type ServerResolver } from "../registry.js";
import { fxResolveRateContract } from "./resolve-rate.contract.js";

const impl: ServerResolver<ResolveDocumentFxRateResult> = async (inputs, ctx) => {
  const currencyCode = readString(inputs["currency_code"]);
  const baseCurrencyCode = readString(inputs["base_currency_code"]);
  if (!currencyCode || !baseCurrencyCode) return null;

  return resolveDocumentFxRate(ctx.db, {
    tenantId: ctx.tenantId,
    companyCodeId: readString(inputs["company_code_id"]),
    currencyCode,
    baseCurrencyCode,
    exchangeRate: inputs["exchange_rate"],
    eventDate: firstPresent(
      inputs["fx_rate_as_of_date"],
      inputs["posting_date"],
      inputs["value_date"],
      inputs["document_date"],
      inputs["invoice_date"],
      inputs["commitment_date"],
    ),
    rateType: readString(inputs["fx_rate_type"]) ?? readString(inputs["rate_type"]) ?? "SPOT",
    pivotCurrency: readString(inputs["pivot_currency"]),
    referenceDocumentType: readString(inputs["reference_document_type"])
      ?? readString(inputs["source_document_type"])
      ?? deriveInvoiceReferenceType(inputs),
    referenceDocumentId: readString(inputs["reference_document_id"])
      ?? readString(inputs["source_document_id"])
      ?? readString(inputs["reversal_of_id"])
      ?? readString(inputs["credited_invoice_id"])
      ?? readString(inputs["debited_invoice_id"]),
    commitmentId: readString(inputs["commitment_id"]),
    fxPolicy: readString(inputs["fx_policy"]),
    allowManualOverride: readBoolean(inputs["allow_manual_fx_rate"])
      || readBoolean(inputs["allow_manual_override"])
      || readString(inputs["fx_policy"]) === "manual_contract_rate",
    manualExchangeRate: inputs["manual_exchange_rate"] ?? inputs["exchange_rate"],
  });
};

export function registerFxResolveRate(): void {
  registerResolver(fxResolveRateContract, impl);
}

function firstPresent(...values: unknown[]): string | Date | null {
  for (const value of values) {
    if (value instanceof Date) return value;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

function deriveInvoiceReferenceType(inputs: Record<string, unknown>): string | null {
  return readString(inputs["reversal_of_id"])
    || readString(inputs["credited_invoice_id"])
    || readString(inputs["debited_invoice_id"])
    ? "purchase_invoice"
    : null;
}
