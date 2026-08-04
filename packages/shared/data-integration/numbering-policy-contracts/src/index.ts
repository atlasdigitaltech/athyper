export type NumberingPlane = "neon" | "mesh";
export type NumberingScopeKind =
  | "tenant"
  | "entity"
  | "operating_organization"
  | "resource_company"
  | "ledger"
  | "network_account";
export type NumberingResetKind =
  | "never"
  | "calendar_year"
  | "calendar_month"
  | "calendar_day"
  | "fiscal_year";
export type NumberingPolicyStatus = "draft" | "active" | "retired";

export interface NumberingPolicyCoordinate {
  targetPlane: NumberingPlane;
  policyCode: string;
  policyRevision: number;
}

export interface NumberingPolicyContract {
  policyCode: string;
  policyRevision: number;
  name: string;
  description: string | null;
  formatTemplate: string;
  sequenceWidth: number;
  padCharacter: string;
  startValue: number;
  incrementBy: number;
  maximumValue: number | null;
  scopeKind: NumberingScopeKind;
  resetKind: NumberingResetKind;
  timezoneCode: string | null;
  status: NumberingPolicyStatus;
}

export interface NumberingPreviewContext {
  nextValue: number;
  occurredAt: string | Date;
  scopeKey?: string | null;
  fiscalYear?: string | null;
}

export interface NumberingPreviewResult {
  formattedNumber: string;
  sequenceText: string;
  nextValue: number;
  followingValue: number;
  resetBucket: string;
}

export interface NumberingPolicyTestCommand extends NumberingPolicyCoordinate, NumberingPreviewContext {
  tenantId: string;
  principalId: string;
}

export interface NumberingPolicyTestResult {
  targetPlane: NumberingPlane;
  tenantId: string;
  policyId: string;
  policySource: "tenant" | "global";
  policy: NumberingPolicyContract;
  input: NumberingPreviewContext;
  preview: NumberingPreviewResult;
  diagnosticCodes: readonly string[];
}

export interface NumberingAllocationCommand extends NumberingPolicyCoordinate {
  allocationId: string;
  tenantId: string;
  principalId: string;
  occurredAt: string | Date;
  scopeKey?: string | null;
  fiscalYear?: string | null;
  correlationId?: string | null;
}

export interface NumberingAllocationResult {
  allocationId: string;
  tenantId: string;
  policyId: string;
  counterId: string;
  policyCode: string;
  policyRevision: number;
  formattedNumber: string;
  allocatedValue: number;
  followingValue: number;
  scopeKey: string;
  resetBucket: string;
  rowVersion: number;
  allocatedAt: string;
}

const TOKEN_PATTERN = /\{([a-z_]+)\}/gu;
const ALLOWED_TOKENS = new Set(["seq", "yyyy", "yy", "mm", "dd", "fiscal_year", "scope"]);
const CODE_PATTERN = /^[a-z][a-z0-9_.-]{1,126}$/u;

export function validateNumberingPolicy(policy: NumberingPolicyContract): string[] {
  const problems: string[] = [];
  if (!CODE_PATTERN.test(policy.policyCode)) problems.push("policy_code.invalid");
  if (!Number.isSafeInteger(policy.policyRevision) || policy.policyRevision < 1) problems.push("policy_revision.invalid");
  if (!policy.name.trim()) problems.push("name.required");
  if (policy.formatTemplate.length < 3 || policy.formatTemplate.length > 256) problems.push("format_template.length");
  const tokens = [...policy.formatTemplate.matchAll(TOKEN_PATTERN)].map((match) => match[1]!);
  if (tokens.filter((token) => token === "seq").length !== 1) problems.push("format_template.seq_once");
  if (tokens.some((token) => !ALLOWED_TOKENS.has(token))) problems.push("format_template.token_unknown");
  if (policy.formatTemplate.replace(TOKEN_PATTERN, "").includes("{") || policy.formatTemplate.replace(TOKEN_PATTERN, "").includes("}")) problems.push("format_template.braces_invalid");
  if (!Number.isSafeInteger(policy.sequenceWidth) || policy.sequenceWidth < 1 || policy.sequenceWidth > 20) problems.push("sequence_width.invalid");
  if (policy.padCharacter.length !== 1 || /[{}\s]/u.test(policy.padCharacter)) problems.push("pad_character.invalid");
  if (!Number.isSafeInteger(policy.startValue) || policy.startValue < 0
    || policy.startValue > Number.MAX_SAFE_INTEGER - policy.incrementBy) problems.push("start_value.invalid");
  if (!Number.isSafeInteger(policy.incrementBy) || policy.incrementBy < 1) problems.push("increment_by.invalid");
  if (policy.maximumValue !== null && (!Number.isSafeInteger(policy.maximumValue)
    || policy.maximumValue < policy.startValue
    || policy.maximumValue > Number.MAX_SAFE_INTEGER - policy.incrementBy)) problems.push("maximum_value.invalid");
  const usesCalendar = tokens.some((token) => ["yyyy", "yy", "mm", "dd"].includes(token));
  if ((usesCalendar || policy.resetKind.startsWith("calendar_")) && !policy.timezoneCode) problems.push("timezone.required");
  if (tokens.includes("fiscal_year") && policy.resetKind !== "fiscal_year") problems.push("fiscal_year.reset_required");
  return [...new Set(problems)];
}

function dateParts(value: string | Date, timezoneCode: string | null): { yyyy: string; yy: string; mm: string; dd: string } {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("occurred_at.invalid");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezoneCode ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const yyyy = part("year");
  return { yyyy, yy: yyyy.slice(-2), mm: part("month"), dd: part("day") };
}

export function previewNumberingPolicy(policy: NumberingPolicyContract, context: NumberingPreviewContext): NumberingPreviewResult {
  const problems = validateNumberingPolicy(policy);
  if (problems.length) throw new Error(`numbering_policy.invalid:${problems.join(",")}`);
  if (!Number.isSafeInteger(context.nextValue) || context.nextValue < policy.startValue) throw new Error("next_value.invalid");
  if (policy.maximumValue !== null && context.nextValue > policy.maximumValue) throw new Error("next_value.exhausted");
  if (policy.scopeKind !== "tenant" && !context.scopeKey) throw new Error("scope_key.required");
  if (policy.resetKind === "fiscal_year" && !context.fiscalYear) throw new Error("fiscal_year.required");

  const date = dateParts(context.occurredAt, policy.timezoneCode);
  const sequenceText = String(context.nextValue).padStart(policy.sequenceWidth, policy.padCharacter);
  const values: Record<string, string> = {
    seq: sequenceText,
    ...date,
    fiscal_year: context.fiscalYear ?? "",
    scope: context.scopeKey ?? "",
  };
  const formattedNumber = policy.formatTemplate.replace(TOKEN_PATTERN, (_token, key: string) => values[key] ?? "");
  const resetBucket = policy.resetKind === "never" ? "never"
    : policy.resetKind === "calendar_year" ? date.yyyy
      : policy.resetKind === "calendar_month" ? `${date.yyyy}-${date.mm}`
        : policy.resetKind === "calendar_day" ? `${date.yyyy}-${date.mm}-${date.dd}`
          : context.fiscalYear!;
  return {
    formattedNumber,
    sequenceText,
    nextValue: context.nextValue,
    followingValue: context.nextValue + policy.incrementBy,
    resetBucket,
  };
}
