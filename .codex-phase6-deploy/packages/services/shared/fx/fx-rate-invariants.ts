export interface FxTriadValidationInput {
  currencyCode?: string | null;
  baseCurrencyCode?: string | null;
  exchangeRate?: unknown;
}

export interface FxTriadValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateFxTriad(input: FxTriadValidationInput): FxTriadValidationResult {
  const currencyCode = normalizeCurrency(input.currencyCode);
  const baseCurrencyCode = normalizeCurrency(input.baseCurrencyCode);
  const rate = Number(input.exchangeRate);

  if (!currencyCode) return { ok: false, reason: "currency_code is required" };
  if (!baseCurrencyCode) return { ok: false, reason: "base_currency_code is required" };
  if (!Number.isFinite(rate) || rate <= 0) return { ok: false, reason: "exchange_rate must be positive" };
  if (currencyCode === baseCurrencyCode && rate !== 1) {
    return { ok: false, reason: "same-currency documents must use exchange_rate 1" };
  }

  return { ok: true };
}

function normalizeCurrency(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim().toUpperCase();
  return trimmed || null;
}
