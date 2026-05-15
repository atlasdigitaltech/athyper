import { sql, type Kysely } from "kysely";

type AnyDb = Kysely<any>;

export type FxRateType = "SPOT" | "PERIOD_AVG" | "PERIOD_END" | "BUDGET" | "CONTRACTED" | "HISTORICAL";

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

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

function asIsoDate(value: string | Date | null | undefined): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const trimmed = String(value ?? "").trim();
  return trimmed || new Date().toISOString().slice(0, 10);
}

function parseFxPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function positiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function resolveFxRate(
  db: AnyDb,
  params: FxRateLookupParams,
): Promise<FxRateLookupResult> {
  const fromCurrency = normalizeCurrency(params.fromCurrency);
  const toCurrency = normalizeCurrency(params.toCurrency);
  const asOf = asIsoDate(params.asOf);
  const rateType = String(params.rateType ?? "SPOT").trim().toUpperCase();
  const pivotCurrency = normalizeCurrency(params.pivotCurrency ?? "MYR");

  if (fromCurrency === toCurrency) {
    return {
      rate: 1,
      method: "IDENTITY",
      source: null,
      effectiveDate: asOf,
      fromCurrency,
      toCurrency,
      rateType,
      asOf,
      pivotCurrency,
    };
  }

  const result = await sql<{ fxRate: unknown }>`
    SELECT master.get_fx_rate(
      ${params.tenantId}::uuid,
      ${fromCurrency}::character(3),
      ${toCurrency}::character(3),
      ${rateType},
      ${asOf}::date,
      ${pivotCurrency}::character(3)
    ) AS "fxRate"
  `.execute(db);

  const payload = parseFxPayload(result.rows[0]?.fxRate);
  const rate = positiveNumber(payload["rate"]);

  return {
    rate,
    method: String(payload["method"] ?? "NOT_FOUND"),
    source: payload["source"] == null ? null : String(payload["source"]),
    effectiveDate: payload["effective_date"] == null ? null : String(payload["effective_date"]),
    fromCurrency,
    toCurrency,
    rateType,
    asOf,
    pivotCurrency,
  };
}

export function positiveFxRateInput(value: unknown): number | null {
  return positiveNumber(value);
}
