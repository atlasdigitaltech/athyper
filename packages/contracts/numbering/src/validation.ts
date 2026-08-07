import { ALLOWED_TOKENS, CTX_TOKEN_PREFIX, NUMBERING_CONFIG, SCOPE_KEY_REQUIRED_KINDS } from "./constants.js";
import type {
  NumberingPolicyContract,
  NumberingPreviewContext,
  NumberingPreviewResult,
  NumberingPreviewStep,
} from "./interfaces.js";

// ─── Internal helpers ─────────────────────────────────────────────────────────

const TOKEN_PATTERN = /\{([a-z][a-z0-9_.]*)\}/gu;
const CODE_PATTERN  = /^[a-z][a-z0-9_.-]{1,126}$/u;
const MONTH_NAMES   = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"] as const;

function dateParts(
  value: string | Date,
  timezoneCode: string | null,
): { yyyy: string; yy: string; mm: string; dd: string; mmm: string } {
  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.getTime())) throw new Error("occurred_at.invalid");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezoneCode ?? "UTC",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const yyyy = part("year");
  const mm   = part("month");
  const mmm  = MONTH_NAMES[parseInt(mm, 10) - 1] ?? "???";
  return { yyyy, yy: yyyy.slice(-2), mm, dd: part("day"), mmm };
}

function extractTokens(template: string): string[] {
  return [...template.matchAll(TOKEN_PATTERN)].map((m) => m[1]!);
}

function isCtxToken(raw: string): boolean {
  return raw.startsWith(CTX_TOKEN_PREFIX);
}

function ctxKey(raw: string): string {
  return raw.slice(CTX_TOKEN_PREFIX.length);
}

function computeResetBucket(
  resetKind: string,
  date: { yyyy: string; mm: string; dd: string },
  fiscalYear: string | null | undefined,
): string {
  switch (resetKind) {
    case "calendar_year":  return date.yyyy;
    case "calendar_month": return `${date.yyyy}-${date.mm}`;
    case "calendar_day":   return `${date.yyyy}-${date.mm}-${date.dd}`;
    case "fiscal_year":    return fiscalYear!;
    default:               return "never";
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the ctx key names that the policy's format_template requires.
 * e.g. "AP-{ctx.company_code}-{dd}{mmm}{yy}-{seq}" → ["company_code"]
 * Use this to validate contextFields before calling allocate().
 */
export function extractRequiredContextKeys(policy: NumberingPolicyContract): string[] {
  return [...new Set(
    extractTokens(policy.formatTemplate).filter(isCtxToken).map(ctxKey),
  )];
}

/** Validates the policy contract. Returns a list of diagnostic code strings (empty = valid). */
export function validateNumberingPolicy(policy: NumberingPolicyContract): string[] {
  const problems: string[] = [];

  if (!CODE_PATTERN.test(policy.policyCode)) problems.push("policy_code.invalid");
  if (!Number.isSafeInteger(policy.policyRevision) || policy.policyRevision < 1) problems.push("policy_revision.invalid");
  if (!policy.name.trim()) problems.push("name.required");

  const tplLen = policy.formatTemplate.length;
  if (tplLen < NUMBERING_CONFIG.minTemplateLength || tplLen > NUMBERING_CONFIG.maxTemplateLength) problems.push("format_template.length");

  const tokens    = extractTokens(policy.formatTemplate);
  const seqCount  = tokens.filter((t) => t === "seq").length;
  if (seqCount !== 1) problems.push("format_template.seq_once");

  const unknown = tokens.filter((t) => !isCtxToken(t) && !ALLOWED_TOKENS.has(t as never));
  if (unknown.length) problems.push("format_template.token_unknown");

  const remainder = policy.formatTemplate.replace(TOKEN_PATTERN, "");
  if (remainder.includes("{") || remainder.includes("}")) problems.push("format_template.braces_invalid");

  if (!Number.isSafeInteger(policy.sequenceWidth)
    || policy.sequenceWidth < NUMBERING_CONFIG.minSequenceWidth
    || policy.sequenceWidth > NUMBERING_CONFIG.maxSequenceWidth) problems.push("sequence_width.invalid");

  if (policy.padCharacter.length !== 1 || /[{}\s]/u.test(policy.padCharacter)) problems.push("pad_character.invalid");

  if (!Number.isSafeInteger(policy.startValue) || policy.startValue < 0
    || policy.startValue > Number.MAX_SAFE_INTEGER - policy.incrementBy) problems.push("start_value.invalid");

  if (!Number.isSafeInteger(policy.incrementBy) || policy.incrementBy < 1) problems.push("increment_by.invalid");

  if (policy.maximumValue != null && (
    !Number.isSafeInteger(policy.maximumValue)
    || policy.maximumValue < policy.startValue
    || policy.maximumValue > Number.MAX_SAFE_INTEGER - policy.incrementBy
  )) problems.push("maximum_value.invalid");

  const calendarTokens = ["yyyy", "yy", "mm", "dd", "mmm"];
  const usesCalendar   = tokens.some((t) => calendarTokens.includes(t));
  const calendarReset  = policy.resetKind.startsWith("calendar_")
    || (policy.displayResetKind?.startsWith("calendar_") ?? false);
  if ((usesCalendar || calendarReset) && !policy.timezoneCode) problems.push("timezone.required");

  if (tokens.includes("fiscal_year") && policy.resetKind !== "fiscal_year") problems.push("fiscal_year.reset_required");

  if (tokens.includes("scope") && policy.scopeKind === "tenant") problems.push("scope_token.tenant_scope_conflict");

  if (policy.fiscalYearPattern) {
    try { new RegExp(policy.fiscalYearPattern, "u"); }
    catch { problems.push("fiscal_year_pattern.invalid_regex"); }
  }

  return [...new Set(problems)];
}

/** Pure preview — does not mutate any counter. Throws if policy is invalid or context is insufficient. */
export function previewNumberingPolicy(
  policy: NumberingPolicyContract,
  context: NumberingPreviewContext,
): NumberingPreviewResult {
  const problems = validateNumberingPolicy(policy);
  if (problems.length) throw new Error(`numbering_policy.invalid:${problems.join(",")}`);

  if (!Number.isSafeInteger(context.nextValue) || context.nextValue < policy.startValue) throw new Error("next_value.invalid");
  if (policy.maximumValue != null && context.nextValue > policy.maximumValue) throw new Error("next_value.exhausted");
  if (SCOPE_KEY_REQUIRED_KINDS.has(policy.scopeKind) && !context.scopeKey) throw new Error("scope_key.required");
  if (policy.resetKind === "fiscal_year" && !context.fiscalYear) throw new Error("fiscal_year.required");

  if (policy.fiscalYearPattern && context.fiscalYear) {
    if (!new RegExp(policy.fiscalYearPattern, "u").test(context.fiscalYear)) throw new Error("fiscal_year.pattern_mismatch");
  }

  const requiredCtxKeys    = extractRequiredContextKeys(policy);
  const missingCtxKeys     = requiredCtxKeys.filter((k) => !context.contextFields?.[k]);
  if (missingCtxKeys.length) throw new Error(`context_fields.missing:${missingCtxKeys.join(",")}`);

  const date         = dateParts(context.occurredAt, policy.timezoneCode);
  const sequenceText = String(context.nextValue).padStart(policy.sequenceWidth, policy.padCharacter);

  const formattedNumber = policy.formatTemplate.replace(TOKEN_PATTERN, (_match, key: string) => {
    if (isCtxToken(key)) return context.contextFields?.[ctxKey(key)] ?? "";
    const simple: Record<string, string> = {
      seq: sequenceText, scope: context.scopeKey ?? "", fiscal_year: context.fiscalYear ?? "",
      ...date,
    };
    return simple[key] ?? "";
  });

  const resetBucket        = computeResetBucket(policy.resetKind, date, context.fiscalYear);
  const displayResetBucket = policy.displayResetKind
    ? computeResetBucket(policy.displayResetKind, date, context.fiscalYear)
    : resetBucket;

  return {
    formattedNumber,
    sequenceText,
    nextValue:          context.nextValue,
    followingValue:     context.nextValue + policy.incrementBy,
    resetBucket,
    displayResetBucket,
  };
}

/**
 * Simulate N sequential allocations without touching the database.
 * When simulateResetAt is supplied, steps straddle the timestamp — the first
 * half use context.occurredAt, the second half use simulateResetAt.
 * crossedBoundary is set on the first step of a new reset bucket.
 */
export function simulateSteps(
  policy: NumberingPolicyContract,
  context: NumberingPreviewContext,
  steps: number,
  simulateResetAt?: string,
): NumberingPreviewStep[] {
  const clampedSteps = Math.min(Math.max(steps, 1), NUMBERING_CONFIG.maxPreviewSteps);
  const midpoint     = Math.ceil(clampedSteps / 2);
  const results: NumberingPreviewStep[] = [];
  let currentValue  = context.nextValue;
  let prevBucket: string | null = null;

  for (let i = 0; i < clampedSteps; i++) {
    if (policy.maximumValue != null && currentValue > policy.maximumValue) break;

    const occurredAt = simulateResetAt && i >= midpoint ? simulateResetAt : context.occurredAt;
    const ctx        = { ...context, nextValue: currentValue, occurredAt };
    const preview    = previewNumberingPolicy(policy, ctx);
    const crossed    = prevBucket !== null && prevBucket !== preview.resetBucket;

    if (crossed) {
      // Restart from startValue in the new bucket
      currentValue = policy.startValue;
      const resetCtx     = { ...context, nextValue: currentValue, occurredAt };
      const resetPreview = previewNumberingPolicy(policy, resetCtx);
      results.push({
        stepNumber:      i + 1,
        formattedNumber: resetPreview.formattedNumber,
        sequenceText:    resetPreview.sequenceText,
        allocatedValue:  resetPreview.nextValue,
        followingValue:  resetPreview.followingValue,
        resetBucket:     resetPreview.resetBucket,
        crossedBoundary: true,
        occurredAt:      typeof occurredAt === "string" ? occurredAt : (occurredAt as Date).toISOString(),
      });
      prevBucket   = resetPreview.resetBucket;
      currentValue = resetPreview.followingValue;
    } else {
      results.push({
        stepNumber:      i + 1,
        formattedNumber: preview.formattedNumber,
        sequenceText:    preview.sequenceText,
        allocatedValue:  preview.nextValue,
        followingValue:  preview.followingValue,
        resetBucket:     preview.resetBucket,
        crossedBoundary: false,
        occurredAt:      typeof occurredAt === "string" ? occurredAt : (occurredAt as Date).toISOString(),
      });
      prevBucket   = preview.resetBucket;
      currentValue = preview.followingValue;
    }
  }

  return results;
}

/**
 * Attempt to decompose a formatted number back to its sequence value using
 * the policy's format_template. Returns null if the number does not match.
 * Pure — no database access required.
 */
export function parseFormattedNumber(
  formattedNumber: string,
  policy: NumberingPolicyContract,
): { sequenceValue: number; sequenceText: string } | null {
  // Split template on token boundaries (capture group → tokens appear in result array)
  const parts = policy.formatTemplate.split(/\{([a-z][a-z0-9_.]*)\}/u);

  let regexStr = "";
  let hasSeq   = false;

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // literal segment — escape for regex
      regexStr += (parts[i] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else {
      const token = parts[i]!;
      if (token === "seq") { regexStr += "(?<seq>\\d+)"; hasSeq = true; }
      else if (token === "yyyy")        regexStr += "\\d{4}";
      else if (token === "yy")          regexStr += "\\d{2}";
      else if (token === "mm")          regexStr += "\\d{2}";
      else if (token === "dd")          regexStr += "\\d{2}";
      else if (token === "mmm")         regexStr += "[A-Z]{3}";
      else                              regexStr += "[\\s\\S]+?";
    }
  }

  if (!hasSeq) return null;

  try {
    const match = new RegExp(`^${regexStr}$`, "u").exec(formattedNumber);
    const sequenceText = match?.groups?.["seq"];
    if (!sequenceText) return null;
    const sequenceValue = parseInt(sequenceText, 10);
    return Number.isSafeInteger(sequenceValue) ? { sequenceValue, sequenceText } : null;
  } catch {
    return null;
  }
}
