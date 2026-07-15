export const DEFAULT_USER_DATE_FORMAT = "%d %b %Y";
export const DEFAULT_USER_TIME_ZONE = "UTC";
export const DEFAULT_USER_LOCALE = "en";

export type UserDateFormat =
  | "%d %b %Y"
  | "%d-%b-%Y"
  | "%d/%m/%Y"
  | "%m/%d/%Y"
  | "%Y-%m-%d";

const SUPPORTED_DATE_FORMATS = new Set<UserDateFormat>([
  "%d %b %Y",
  "%d-%b-%Y",
  "%d/%m/%Y",
  "%m/%d/%Y",
  "%Y-%m-%d",
]);

interface DateParts {
  day: string;
  month: string;
  year: string;
  monthShort: string;
  monthLong: string;
}

export interface UserDateFormatPreferences {
  locale?: string | null;
  dateFormat?: string | null;
  timeZone?: string | null;
}

export interface UserDateFormatOptions extends UserDateFormatPreferences {
  includeTime?: boolean;
}

export function normalizeUserDateFormat(value: unknown): UserDateFormat {
  if (typeof value !== "string") return DEFAULT_USER_DATE_FORMAT;
  const normalized = value.trim();
  return SUPPORTED_DATE_FORMATS.has(normalized as UserDateFormat)
    ? normalized as UserDateFormat
    : DEFAULT_USER_DATE_FORMAT;
}

function safeLocale(value: string | null | undefined): string {
  return value && value.trim() ? value.trim() : DEFAULT_USER_LOCALE;
}

function safeTimeZone(value: string | null | undefined): string | undefined {
  if (!value || !value.trim()) return undefined;
  const candidate = value.trim();
  try {
    new Intl.DateTimeFormat(DEFAULT_USER_LOCALE, { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return undefined;
  }
}

function dateOnlyParts(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function monthName(year: number, month: number, locale: string, width: "short" | "long"): string {
  const date = new Date(Date.UTC(year, month - 1, 1, 12));
  return new Intl.DateTimeFormat(locale, { month: width, timeZone: "UTC" }).format(date);
}

function partsFromDateOnly(value: string, locale: string): DateParts | null {
  const parts = dateOnlyParts(value);
  if (!parts) return null;
  return {
    day: String(parts.day).padStart(2, "0"),
    month: String(parts.month).padStart(2, "0"),
    year: String(parts.year),
    monthShort: monthName(parts.year, parts.month, locale, "short"),
    monthLong: monthName(parts.year, parts.month, locale, "long"),
  };
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function partsFromDate(date: Date, locale: string, timeZone: string | undefined): DateParts {
  const baseOptions: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  };
  const numericParts = new Intl.DateTimeFormat(locale, baseOptions).formatToParts(date);
  const monthShort = new Intl.DateTimeFormat(locale, {
    month: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
  const monthLong = new Intl.DateTimeFormat(locale, {
    month: "long",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);

  return {
    day: partValue(numericParts, "day").padStart(2, "0"),
    month: partValue(numericParts, "month").padStart(2, "0"),
    year: partValue(numericParts, "year"),
    monthShort,
    monthLong,
  };
}

function parsedDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatPattern(parts: DateParts, format: UserDateFormat): string {
  return format
    .replaceAll("%d", parts.day)
    .replaceAll("%m", parts.month)
    .replaceAll("%Y", parts.year)
    .replaceAll("%b", parts.monthShort)
    .replaceAll("%B", parts.monthLong);
}

function formatTime(date: Date, locale: string, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatUserDateValue(value: unknown, options: UserDateFormatOptions = {}): string {
  if (value === null || value === undefined || value === "") return "-";

  const locale = safeLocale(options.locale);
  const dateFormat = normalizeUserDateFormat(options.dateFormat);
  const timeZone = safeTimeZone(options.timeZone);
  const raw = String(value);
  const date = parsedDate(value);
  const parts = !options.includeTime && typeof value === "string"
    ? partsFromDateOnly(raw, locale) ?? (date ? partsFromDate(date, locale, timeZone) : null)
    : date ? partsFromDate(date, locale, timeZone) : null;

  if (!parts) return raw;

  const dateText = formatPattern(parts, dateFormat);
  if (!options.includeTime || !date) return dateText;
  return `${dateText} ${formatTime(date, locale, timeZone)}`;
}
