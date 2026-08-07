import type { NumberingPlane, NumberingResetKind, NumberingPolicyStatus, NumberingScopeKind } from "./types.js";

export interface NumberingPolicyCoordinate {
  targetPlane:    NumberingPlane;
  policyCode:     string;
  policyRevision: number;
}

export interface NumberingPolicyContract {
  policyCode:    string;
  policyRevision: number;
  name:          string;
  description:   string | null;

  // template
  formatTemplate: string;
  sequenceWidth:  number;
  padCharacter:   string;

  // counter
  startValue:    number;
  incrementBy:   number;
  maximumValue:  number | null;

  // scope + reset
  scopeKind: NumberingScopeKind;
  resetKind: NumberingResetKind;
  /**
   * Drives the display bucket in the formatted number only.
   * Counter partition always uses resetKind.
   * Use "never" + displayResetKind "calendar_year" for carry-forward sequences
   * that still show the year in the formatted number.
   */
  displayResetKind?: NumberingResetKind;
  /**
   * timezoneCode is required when formatTemplate uses any calendar token
   * ({yyyy}, {yy}, {mm}, {dd}, {mmm}) or when resetKind / displayResetKind
   * is a calendar_* variant.
   */
  timezoneCode:  string | null;

  /**
   * Regex the caller's fiscalYear value must satisfy.
   * Validated at allocation and preview time.
   * Example: "^FY\\d{4}$"
   */
  fiscalYearPattern?: string | null;

  /**
   * Maximum character length of the formatted number output.
   * validateNumberingPolicy() checks this using the maximum plausible scope key length.
   */
  maxOutputLength?: number | null;

  status:      NumberingPolicyStatus;
  activatedAt?: string | null;
  activatedBy?: string | null;
}

export interface NumberingPreviewContext {
  nextValue:   number;
  occurredAt:  string | Date;
  scopeKey?:   string | null;
  fiscalYear?: string | null;
  /**
   * Resolved values for {ctx.<key>} tokens in format_template.
   * Caller reads from the entity record and applies any transforms
   * (via applyTransform()) before passing here.
   * Keys match what extractRequiredContextKeys() returns for the policy.
   */
  contextFields?: Record<string, string>;
}

export interface NumberingPreviewResult {
  formattedNumber:    string;
  sequenceText:       string;
  nextValue:          number;
  followingValue:     number;
  /** Counter partition key — driven by resetKind. */
  resetBucket:        string;
  /** Display bucket — driven by displayResetKind if set, otherwise same as resetBucket. */
  displayResetBucket: string;
}

// ─── Allocation ──────────────────────────────────────────────────────────────

export interface NumberingAllocationCommand extends NumberingPolicyCoordinate {
  allocationId:   string;
  tenantId:       string;
  principalId:    string;
  occurredAt:     string | Date;
  /**
   * Human-readable code, NOT a UUID. Drives the counter partition.
   * Max 128 chars. Examples: "COMP01", "LE-IND", "WH-BLR".
   * Caller resolves this from the entity record before calling allocate().
   */
  scopeKey?:      string | null;
  fiscalYear?:    string | null;
  correlationId?: string | null;
  /**
   * Resolved entity field values for {ctx.*} tokens.
   * Caller applies transforms before passing.
   * Missing keys for required ctx tokens → MISSING_CONTEXT_FIELD error.
   */
  contextFields?: Record<string, string>;
}

export interface NumberingAllocationResult {
  allocationId:      string;
  tenantId:          string;
  policyId:          string;
  counterId:         string;
  policyCode:        string;
  policyRevision:    number;
  formattedNumber:   string;
  allocatedValue:    number;
  followingValue:    number;
  scopeKey:          string;
  resetBucket:       string;
  rowVersion:        number;
  allocatedAt:       string;
  /** "replayed" when the same allocationId was already committed — no new counter increment. */
  idempotencySource: "fresh" | "replayed";
}

// ─── Batch allocation ────────────────────────────────────────────────────────

export interface NumberingBatchAllocationItem {
  allocationId:   string;
  scopeKey?:      string | null;
  fiscalYear?:    string | null;
  contextFields?: Record<string, string>;
}

export interface NumberingBatchAllocationCommand extends NumberingPolicyCoordinate {
  tenantId:    string;
  principalId: string;
  occurredAt:  string | Date;
  items:       readonly NumberingBatchAllocationItem[];
}

export interface NumberingBatchAllocationResult {
  allocations: readonly NumberingAllocationResult[];
  failedItems: readonly { allocationId: string; error: string }[];
}

// ─── Admin counter reset ─────────────────────────────────────────────────────

export interface NumberingCounterResetCommand extends NumberingPolicyCoordinate {
  tenantId:      string;
  principalId:   string;
  scopeKey:      string;
  resetBucket:   string;
  newStartValue: number;
  /** Mandatory audit reason. */
  reason:        string;
}

export interface NumberingCounterResetResult {
  counterId:     string;
  previousValue: number;
  newStartValue: number;
  resetAt:       string;
  resetBy:       string;
}

// ─── Tester ──────────────────────────────────────────────────────────────────

export interface NumberingPreviewStep {
  stepNumber:      number;
  formattedNumber: string;
  sequenceText:    string;
  allocatedValue:  number;
  followingValue:  number;
  resetBucket:     string;
  /** True when the counter reset between the previous step and this one. */
  crossedBoundary: boolean;
  occurredAt:      string;
}

export interface NumberingPolicyTestDiagnostics {
  codes:                string[];
  /** null when fiscalYearPattern is not set on the policy. */
  fiscalYearValid?:     boolean;
  contextFieldsMissing: string[];
  exhaustionInfo?: {
    /** null = unlimited (no maximumValue). */
    allocationsRemaining: number | null;
  };
  resetBoundaryInfo?: {
    lastValueBeforeReset:  number;
    firstValueAfterReset:  number;
  };
}

/**
 * Backward-compatible extension of the original test command.
 * testContext supersedes the top-level NumberingPreviewContext fields when present,
 * enabling contextFields and multi-step simulation without breaking existing callers.
 */
export interface NumberingPolicyTestCommand extends NumberingPolicyCoordinate, NumberingPreviewContext {
  tenantId:    string;
  principalId: string;
  /**
   * Enhanced context. When supplied, these values take priority over the
   * top-level NumberingPreviewContext fields inherited by this interface.
   */
  testContext?: {
    nextValue:      number;
    occurredAt:     string | Date;
    scopeKey?:      string | null;
    fiscalYear?:    string | null;
    contextFields?: Record<string, string>;
  };
  options?: {
    /** 1–10 sequential steps to preview. Default 3. */
    previewSteps?: number;
    /**
     * ISO timestamp. When set, tester generates steps that straddle this
     * boundary: first half before, second half after. Shows reset behaviour.
     */
    simulateResetAt?: string;
  };
}

export interface NumberingPolicyTestResult {
  targetPlane:  NumberingPlane;
  tenantId:     string;
  /** null when policySource is "inline". */
  policyId:     string | null;
  policySource: "live" | "draft" | "inline" | "tenant" | "global";
  policy:       NumberingPolicyContract;
  input:        NumberingPreviewContext;
  /** @deprecated — use sequence[0]. Retained for backward compatibility. */
  preview:      NumberingPreviewResult;
  sequence:     NumberingPreviewStep[];
  diagnostics:  NumberingPolicyTestDiagnostics;
  /** @deprecated — use diagnostics.codes. Retained for backward compatibility. */
  diagnosticCodes: readonly string[];
}
