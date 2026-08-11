import { NumberingError, type NumberingPolicy, type NumberingResult } from "./numbering.js";

export interface FormatNumberInput {
  readonly nextValue: number;
  readonly occurredAt: string;
  readonly tenantId: string;
  readonly scopeKey?: string;
  readonly fiscalYear?: string;
  readonly contextFields?: Readonly<Record<string, string>>;
}

export function formatNumber(policy: NumberingPolicy, input: FormatNumberInput): Omit<NumberingResult, "allocationId" | "idempotencySource" | "allocatedAt"> {
  validatePolicy(policy);
  if (!Number.isSafeInteger(input.nextValue) || input.nextValue < 0) throw new NumberingError("NUMBERING_VALUE_INVALID", "nextValue must be a non-negative safe integer", 400);
  if (policy.maximumValue !== undefined && input.nextValue > policy.maximumValue) throw new NumberingError("NUMBERING_EXHAUSTED", `Numbering policy ${policy.policyCode} is exhausted`, 409);
  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.valueOf())) throw new NumberingError("NUMBERING_DATE_INVALID", "occurredAt must be an ISO date", 400);
  const scopeKey = policy.scopeKind === "tenant" ? input.tenantId : input.scopeKey?.trim();
  if (!scopeKey || scopeKey.length > 512) throw new NumberingError("NUMBERING_SCOPE_INVALID", `A stable scopeKey is required for ${policy.scopeKind} numbering`);
  const date = dateParts(occurredAt, policy.timezoneCode ?? "UTC");
  const resetBucket = bucket(policy.resetKind, date, input.fiscalYear);
  const sequenceText = String(input.nextValue).padStart(policy.sequenceWidth, policy.padCharacter);
  const tokens: Record<string, string> = { seq: sequenceText, yyyy: date.year, yy: date.year.slice(-2), mm: date.month, dd: date.day, mmm: date.monthName, fiscal_year: input.fiscalYear ?? "", scope: scopeKey };
  let formatted = policy.formatTemplate.replace(/\{(seq|yyyy|yy|mm|dd|mmm|fiscal_year|scope)\}/gu, (_match, token: string) => tokens[token] ?? "");
  formatted = formatted.replace(/\{ctx\.([a-z][a-z0-9_.-]{0,126})\}/gu, (_match, key: string) => {
    const value = input.contextFields?.[key]?.trim();
    if (!value) throw new NumberingError("NUMBERING_CONTEXT_MISSING", `Missing numbering context field: ${key}`);
    return value;
  });
  if (/\{[^{}]+\}/u.test(formatted)) throw new NumberingError("NUMBERING_TEMPLATE_TOKEN_INVALID", "Numbering template contains an unsupported token");
  if (formatted.length > 512) throw new NumberingError("NUMBERING_OUTPUT_TOO_LONG", "Formatted number exceeds 512 characters");
  return { policyId: policy.id, policyCode: policy.policyCode, policyRevision: policy.policyRevision, formattedNumber: formatted, allocatedValue: input.nextValue, followingValue: input.nextValue + policy.incrementBy, scopeKey, resetBucket, policySource: policy.source };
}

export function validatePolicy(policy: NumberingPolicy): void {
  if ((policy.formatTemplate.match(/\{seq\}/gu) ?? []).length !== 1) throw new NumberingError("NUMBERING_TEMPLATE_SEQ_INVALID", "formatTemplate must contain exactly one {seq}");
  if (!Number.isInteger(policy.sequenceWidth) || policy.sequenceWidth < 1 || policy.sequenceWidth > 20) throw new NumberingError("NUMBERING_WIDTH_INVALID", "sequenceWidth must be between 1 and 20");
  if (policy.padCharacter.length !== 1 || /[{}\s]/u.test(policy.padCharacter)) throw new NumberingError("NUMBERING_PAD_INVALID", "padCharacter must be one non-whitespace character");
  if (!Number.isSafeInteger(policy.incrementBy) || policy.incrementBy < 1) throw new NumberingError("NUMBERING_INCREMENT_INVALID", "incrementBy must be a positive safe integer");
}

function bucket(kind: NumberingPolicy["resetKind"], date: DateParts, fiscalYear?: string): string {
  if (kind === "never") return "never";
  if (kind === "calendar_year") return date.year;
  if (kind === "calendar_month") return `${date.year}-${date.month}`;
  if (kind === "calendar_day") return `${date.year}-${date.month}-${date.day}`;
  const value = fiscalYear?.trim();
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$/u.test(value)) throw new NumberingError("NUMBERING_FISCAL_YEAR_INVALID", "A stable fiscalYear is required by this policy");
  return value;
}

interface DateParts { year: string; month: string; day: string; monthName: string }
function dateParts(value: Date, timeZone: string): DateParts {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
    const month = get("month");
    return { year: get("year"), month, day: get("day"), monthName: ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][Number(month) - 1] ?? "" };
  } catch { throw new NumberingError("NUMBERING_TIMEZONE_INVALID", `Unknown timezone: ${timeZone}`); }
}
