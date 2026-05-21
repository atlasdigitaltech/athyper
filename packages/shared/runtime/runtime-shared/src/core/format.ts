/** Converts bytes to a human-readable size string (e.g. 1.4 KB, 2.3 MB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format an ISO date string as "02 Jan 2026". Returns "—" for falsy input. */
export function fmtDate(iso: unknown): string {
  if (!iso || typeof iso !== "string") return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return String(iso);
  }
}

/** Format an ISO date string as "02 Jan 2026 · 14:30". Returns undefined for falsy input. */
export function fmtDateTime(iso: unknown): string | undefined {
  if (!iso || typeof iso !== "string") return undefined;
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch {
    return String(iso);
  }
}

/** Format an unknown value as a 2-decimal number string. Returns undefined for non-numeric. */
export function fmtAmountMaybe(val: unknown): string | undefined {
  const n = typeof val === "number" ? val : Number(val);
  if (Number.isNaN(n)) return undefined;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

/** Convert a snake_case or UPPER_CASE code to Title Case (e.g. "purchase_order" → "Purchase Order"). */
export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Resolve the display symbol for a currency code ("USD" → "$", "EUR" → "€").
 *  Returns empty string when Intl falls back to the code itself. */
export function getCurrencySymbol(code: string): string {
  if (!code) return "";
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency")?.value ?? code;
    return sym === code ? "" : sym;
  } catch {
    return "";
  }
}

export type CurrencyCodePosition = "prefix" | "suffix" | "none";

export interface MoneyFormatOptions {
  currencyCode?: string | null;
  minorUnits?: number | null;
  locale?: string;
  currencyCodePosition?: CurrencyCodePosition;
  fallbackMinorUnits?: number;
}

export type MoneyCurrencySource = "header" | "item" | "line" | "record" | "constant" | "auto";

export interface MoneyFieldConfig {
  currencyField?: string;
  currencySource?: MoneyCurrencySource;
  currencyCode?: string;
  currencyCodePosition?: CurrencyCodePosition;
  currencyEditable?: boolean;
  minorUnits?: number | null;
  fallbackMinorUnits?: number;
}

export interface MoneyFieldFormatContext {
  header?: Record<string, unknown> | null;
  item?: Record<string, unknown> | null;
  record?: Record<string, unknown> | null;
  fallbackCurrencyCode?: string | null;
  fallbackCurrencyCodePosition?: CurrencyCodePosition;
  minorUnits?: number | null;
  fallbackMinorUnits?: number;
}

export interface ResolvedMoneyFieldFormat {
  currencyCode?: string;
  currencyCodePosition: CurrencyCodePosition;
  currencyEditable?: boolean;
  minorUnits?: number | null;
  fallbackMinorUnits: number;
}

export function normaliseCurrencyCode(code: unknown): string | undefined {
  if (typeof code !== "string") return undefined;
  const normalized = code.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : undefined;
}

function recordProp(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined) return raw[key];
  }
  return undefined;
}

function stringProp(raw: Record<string, unknown>, ...keys: string[]): string | undefined {
  const value = recordProp(raw, ...keys);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function boolProp(raw: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  const value = recordProp(raw, ...keys);
  return typeof value === "boolean" ? value : undefined;
}

function numberProp(raw: Record<string, unknown>, ...keys: string[]): number | null | undefined {
  const value = recordProp(raw, ...keys);
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeCurrencyCodePosition(value: unknown): CurrencyCodePosition | undefined {
  if (value === "prefix" || value === "suffix" || value === "none") return value;
  if (value === "before") return "prefix";
  if (value === "after") return "suffix";
  return undefined;
}

function normalizeMoneyCurrencySource(value: unknown): MoneyCurrencySource | undefined {
  if (
    value === "header" ||
    value === "item" ||
    value === "line" ||
    value === "record" ||
    value === "constant" ||
    value === "auto"
  ) {
    return value;
  }
  if (value === "row") return "item";
  return undefined;
}

function readRecordPath(record: Record<string, unknown> | null | undefined, path: string | undefined): unknown {
  if (!record || !path) return undefined;
  if (record[path] !== undefined) return record[path];
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, record);
}

function readCurrencyFromContext(
  field: string | undefined,
  context: MoneyFieldFormatContext,
  source: MoneyCurrencySource,
): string | undefined {
  if (!field) return undefined;

  const itemCurrency = normaliseCurrencyCode(readRecordPath(context.item, field));
  const headerCurrency = normaliseCurrencyCode(readRecordPath(context.header, field));
  const recordCurrency = normaliseCurrencyCode(readRecordPath(context.record, field));

  if (source === "item" || source === "line") {
    return itemCurrency ?? headerCurrency ?? recordCurrency;
  }
  if (source === "record") {
    return recordCurrency ?? headerCurrency ?? itemCurrency;
  }
  if (source === "auto") {
    return itemCurrency ?? headerCurrency ?? recordCurrency;
  }
  return headerCurrency ?? recordCurrency ?? itemCurrency;
}

export function resolveMoneyFieldConfig(raw: unknown): MoneyFieldConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const display = stringProp(obj, "currency_display", "currencyDisplay");
  const position = display === "none"
    ? "none"
    : normalizeCurrencyCodePosition(recordProp(obj, "currency_code_position"));
  const fallbackMinorUnits = numberProp(obj, "fallback_minor_units");

  return {
    currencyField:        stringProp(obj, "currency_field"),
    currencySource:       normalizeMoneyCurrencySource(recordProp(obj, "currency_source")),
    currencyCode:         normaliseCurrencyCode(recordProp(obj, "currency_code")),
    currencyCodePosition: position,
    currencyEditable:     boolProp(obj, "currency_editable"),
    minorUnits:           numberProp(obj, "minor_units"),
    fallbackMinorUnits:   typeof fallbackMinorUnits === "number" ? fallbackMinorUnits : undefined,
  };
}

export function resolveMoneyFieldFormat(
  raw: unknown,
  context: MoneyFieldFormatContext = {},
): ResolvedMoneyFieldFormat {
  const config = resolveMoneyFieldConfig(raw);
  const source = config.currencySource ?? (config.currencyCode ? "constant" : "header");
  const currencyCode = source === "constant"
    ? config.currencyCode
    : readCurrencyFromContext(config.currencyField, context, source)
      ?? config.currencyCode
      ?? normaliseCurrencyCode(context.fallbackCurrencyCode);

  return {
    currencyCode,
    currencyCodePosition: config.currencyCodePosition ?? context.fallbackCurrencyCodePosition ?? "prefix",
    currencyEditable:     config.currencyEditable,
    minorUnits:           context.minorUnits ?? config.minorUnits ?? null,
    fallbackMinorUnits:   context.fallbackMinorUnits ?? config.fallbackMinorUnits ?? 2,
  };
}

export function fmtMoneyFromFieldConfig(
  value: unknown,
  raw: unknown,
  context: MoneyFieldFormatContext = {},
): string | undefined {
  const format = resolveMoneyFieldFormat(raw, context);
  return fmtMoney(value, {
    currencyCode:          format.currencyCode,
    currencyCodePosition:  format.currencyCodePosition,
    minorUnits:            format.minorUnits,
    fallbackMinorUnits:    format.fallbackMinorUnits,
  });
}

function minorUnitsFromIntl(currencyCode: string, locale: string): number | undefined {
  try {
    const digits = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
    }).resolvedOptions().maximumFractionDigits;
    return typeof digits === "number" && Number.isInteger(digits) && digits >= 0 && digits <= 6
      ? digits
      : undefined;
  } catch {
    return undefined;
  }
}

export function resolveCurrencyMinorUnits(
  minorUnits?: number | null,
  currencyCode?: string | null,
  locale = "en-US",
  fallbackMinorUnits = 2,
): number {
  if (Number.isInteger(minorUnits) && minorUnits! >= 0 && minorUnits! <= 6) {
    return minorUnits!;
  }

  const normalizedCode = normaliseCurrencyCode(currencyCode);
  if (normalizedCode) {
    const intlDigits = minorUnitsFromIntl(normalizedCode, locale);
    if (intlDigits !== undefined) return intlDigits;
  }

  return fallbackMinorUnits;
}

export function fmtMoneyNumber(value: unknown, opts: MoneyFormatOptions = {}): string | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;

  const locale = opts.locale ?? "en-US";
  const digits = resolveCurrencyMinorUnits(
    opts.minorUnits,
    opts.currencyCode,
    locale,
    opts.fallbackMinorUnits ?? 2,
  );

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function fmtMoney(value: unknown, opts: MoneyFormatOptions = {}): string | undefined {
  const amount = fmtMoneyNumber(value, opts);
  if (!amount) return undefined;

  const code = normaliseCurrencyCode(opts.currencyCode);
  const position = opts.currencyCodePosition ?? "prefix";
  if (!code || position === "none") return amount;
  return position === "suffix" ? `${amount} ${code}` : `${code} ${amount}`;
}

/** Format a numeric amount with two decimal places.
 *  Optionally appends the currency code with a leading space. */
export function fmtAmount(v: number, currencyCode?: string): string {
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
  return currencyCode ? `${formatted} ${currencyCode}` : formatted;
}

/** Format a numeric value with configurable decimal places.
 *  Returns "—" for non-numeric input (safe for table cells). */
export function fmtNum(v: unknown, dec = 2): string {
  const n = Number(v);
  return Number.isNaN(n)
    ? "—"
    : n.toLocaleString(undefined, {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      });
}

/** Split a formatted number string at the decimal point for xl hero display.
 *  Returns [whole, ".decimal"] — decimal is empty string when no point present. */
export function splitDecimal(s: string): [string, string] {
  const i = s.lastIndexOf(".");
  return i === -1 ? [s, ""] : [s.slice(0, i), s.slice(i)];
}
