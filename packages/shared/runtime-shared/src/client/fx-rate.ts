export type FxRateClientResult = {
  ok: boolean;
  status: number;
  rate: number | null;
  method?: string;
  source?: string | null;
  effectiveDate?: string | null;
  fromCurrency?: string;
  toCurrency?: string;
  rateType?: string;
  asOf?: string;
  pivotCurrency?: string;
  error?: string;
  message?: string;
};

export type FxRateClientLookup = {
  fromCurrency: string;
  toCurrency: string;
  asOf?: string | null;
  rateType?: string | null;
  signal?: AbortSignal;
};

function positiveRate(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function fetchLatestFxRate({
  fromCurrency,
  toCurrency,
  asOf,
  rateType,
  signal,
}: FxRateClientLookup): Promise<FxRateClientResult> {
  const params = new URLSearchParams({
    from: fromCurrency.trim().toUpperCase(),
    to:   toCurrency.trim().toUpperCase(),
  });
  if (asOf) params.set("asOf", asOf);
  if (rateType) params.set("rateType", rateType);

  try {
    const res = await fetch(`/api/finance/fx-rate?${params.toString()}`, {
      cache: "no-store",
      signal,
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    return {
      ...body,
      ok:           res.ok,
      status:       res.status,
      rate:         positiveRate(body["rate"]),
      method:       body["method"] == null ? undefined : String(body["method"]),
      source:       body["source"] == null ? null : String(body["source"]),
      effectiveDate: body["effectiveDate"] == null ? null : String(body["effectiveDate"]),
      fromCurrency: body["fromCurrency"] == null ? undefined : String(body["fromCurrency"]),
      toCurrency:   body["toCurrency"] == null ? undefined : String(body["toCurrency"]),
      rateType:     body["rateType"] == null ? undefined : String(body["rateType"]),
      asOf:         body["asOf"] == null ? undefined : String(body["asOf"]),
      pivotCurrency: body["pivotCurrency"] == null ? undefined : String(body["pivotCurrency"]),
      error:        body["error"] == null ? undefined : String(body["error"]),
      message:      body["message"] == null ? undefined : String(body["message"]),
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }
    return {
      ok:      false,
      status:  0,
      rate:    null,
      message: err instanceof Error ? err.message : "Exchange Rate lookup failed.",
    };
  }
}
