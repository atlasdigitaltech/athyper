import { createHash } from "node:crypto";

import type {
  AuthorizationRolloutPlane,
  AuthorizationRolloutSelection,
} from "./authorization-rollout.types.js";

export const AUTHORIZATION_SHADOW_CONSUMER_PATHS = [
  "single",
  "batch",
  "session",
  "admin",
  "mesh",
  "workflow",
  "company_scope",
  "acl",
] as const;
export type AuthorizationShadowConsumerPath =
  typeof AUTHORIZATION_SHADOW_CONSUMER_PATHS[number];

export const AUTHORIZATION_SHADOW_ACTION_CLASSES = [
  "routine_read",
  "mutation",
  "admin_action",
  "financial_posting",
  "workflow_decision",
  "delegation_use",
  "acl_protected_read",
] as const;
export type AuthorizationShadowActionClass =
  typeof AUTHORIZATION_SHADOW_ACTION_CLASSES[number];

export const AUTHORIZATION_MISMATCH_CLASSES = [
  "capability",
  "scope",
  "precedence",
  "plane",
  "entitlement",
  "operation_mapping",
  "delegation",
  "acl",
  "data_defect",
] as const;
export type AuthorizationMismatchClass =
  typeof AUTHORIZATION_MISMATCH_CLASSES[number];

export type AuthorizationTypedScopeKind =
  | "tenant_or_account"
  | "company_code"
  | "legal_entity"
  | "operating_organization"
  | "network_relationship"
  | "resource"
  | "record";

export interface AuthorizationNormalizedScope {
  readonly kind: AuthorizationTypedScopeKind;
  readonly values: readonly string[];
}

export interface AuthorizationComparableDecision {
  readonly plane: AuthorizationRolloutPlane;
  readonly decision: "allow" | "deny";
  readonly permissionCodes: readonly string[];
  readonly scopes: readonly AuthorizationNormalizedScope[];
  readonly reason: string;
  readonly evidenceKinds?: readonly (
    | "entitlement"
    | "delegation"
    | "record_acl"
    | "deny"
    | "ordinary_authority"
  )[];
}

export interface AuthorizationImmutableShadowInput {
  readonly requestId: string;
  readonly immutableContextSha256: string;
  readonly plane: AuthorizationRolloutPlane;
  readonly consumerPath: AuthorizationShadowConsumerPath;
  readonly actionClass: AuthorizationShadowActionClass;
  readonly permissionCode: string;
  readonly cohortCode: string;
  readonly catalogVersion: string;
  readonly identityContext: Readonly<Record<string, unknown>>;
}

export interface AuthorizationShadowEvaluators {
  readonly evaluateLegacy: (
    input: AuthorizationImmutableShadowInput,
  ) => Promise<AuthorizationComparableDecision>;
  readonly evaluateV2: (
    input: AuthorizationImmutableShadowInput,
  ) => Promise<AuthorizationComparableDecision>;
  readonly evaluateApprovedTargetTruth: (
    input: AuthorizationImmutableShadowInput,
  ) => Promise<AuthorizationComparableDecision | null>;
}

export interface AuthorizationShadowComparisonRecord {
  readonly selection: AuthorizationRolloutSelection;
  readonly input: AuthorizationImmutableShadowInput;
  readonly sampled: true;
  readonly status: "match" | "mismatch" | "v2_error";
  readonly legacyDecision: AuthorizationComparableDecision;
  readonly v2Decision?: AuthorizationComparableDecision;
  readonly targetTruth?: AuthorizationComparableDecision;
  readonly legacyMatchesTarget: boolean;
  readonly v2MatchesTarget: boolean;
  readonly mismatchClasses: readonly AuthorizationMismatchClass[];
  readonly ownerTeam: string;
  readonly expectedDisposition: "expected" | "bug" | "unclassified";
  readonly v2ErrorCode?: string;
}

export interface AuthorizationShadowComparisonSink {
  append(record: AuthorizationShadowComparisonRecord): Promise<void>;
}

export interface AuthorizationShadowComparisonServiceDeps {
  readonly sink: AuthorizationShadowComparisonSink;
  readonly resolveOwner: (
    input: AuthorizationImmutableShadowInput,
    mismatchClasses: readonly AuthorizationMismatchClass[],
  ) => string | undefined;
  readonly lowRiskSampleNumerator?: number;
  readonly lowRiskSampleDenominator?: number;
  readonly onSinkError?: (
    error: unknown,
    input: AuthorizationImmutableShadowInput,
  ) => void;
}

export interface AuthorizationShadowDecision {
  readonly authoritative: "legacy";
  readonly decision: AuthorizationComparableDecision;
  readonly sampled: boolean;
}

const MANDATORY_COMPARISON_ACTIONS =
  new Set<AuthorizationShadowActionClass>([
    "mutation",
    "admin_action",
    "financial_posting",
    "workflow_decision",
    "delegation_use",
    "acl_protected_read",
  ]);

/**
 * Wave 7 shadow runner. Legacy remains authoritative and the service never
 * merges an allow, permission, scope, or evidence item from another evaluator.
 */
export class AuthorizationShadowComparisonService {
  private readonly deps: AuthorizationShadowComparisonServiceDeps;
  private readonly numerator: number;
  private readonly denominator: number;

  constructor(deps: AuthorizationShadowComparisonServiceDeps) {
    this.deps = deps;
    this.numerator = deps.lowRiskSampleNumerator ?? 1;
    this.denominator = deps.lowRiskSampleDenominator ?? 100;
    if (
      !Number.isSafeInteger(this.numerator)
      || !Number.isSafeInteger(this.denominator)
      || this.numerator < 0
      || this.denominator < 1
      || this.numerator > this.denominator
    ) {
      throw new Error("invalid low-risk authorization shadow sample");
    }
  }

  async decide(
    selection: AuthorizationRolloutSelection,
    input: AuthorizationImmutableShadowInput,
    evaluators: AuthorizationShadowEvaluators,
  ): Promise<AuthorizationShadowDecision> {
    const immutableInput = deepFreezeShadowInput(input);
    const sampled = mustCompare(immutableInput.actionClass)
      || isDeterministicallySampled(
        immutableInput.requestId,
        this.numerator,
        this.denominator,
      );
    if (!sampled || selection.mode !== "shadow") {
      return Object.freeze({
        authoritative: "legacy",
        decision: await evaluators.evaluateLegacy(immutableInput),
        sampled: false,
      });
    }

    const [legacyResult, v2Result, truthResult] = await Promise.allSettled([
      evaluators.evaluateLegacy(immutableInput),
      evaluators.evaluateV2(immutableInput),
      evaluators.evaluateApprovedTargetTruth(immutableInput),
    ]);
    if (legacyResult.status === "rejected") throw legacyResult.reason;

    const legacyDecision = normalizeDecision(legacyResult.value);
    const targetTruth = truthResult.status === "fulfilled" && truthResult.value
      ? normalizeDecision(truthResult.value)
      : undefined;
    const v2Decision = v2Result.status === "fulfilled"
      ? normalizeDecision(v2Result.value)
      : undefined;
    const legacyMatchesTarget = targetTruth
      ? decisionsEqual(legacyDecision, targetTruth)
      : false;
    const v2MatchesTarget = targetTruth && v2Decision
      ? decisionsEqual(v2Decision, targetTruth)
      : false;
    const mismatchClasses = classifyMismatch(
      immutableInput,
      legacyDecision,
      v2Decision,
      targetTruth,
    );
    const status = v2Result.status === "rejected"
      ? "v2_error"
      : legacyMatchesTarget && v2MatchesTarget
        ? "match"
        : "mismatch";
    const ownerTeam = this.deps.resolveOwner(
      immutableInput,
      mismatchClasses,
    )?.trim() || "unowned";
    const record: AuthorizationShadowComparisonRecord = Object.freeze({
      selection,
      input: immutableInput,
      sampled: true,
      status,
      legacyDecision,
      ...(v2Decision ? { v2Decision } : {}),
      ...(targetTruth ? { targetTruth } : {}),
      legacyMatchesTarget,
      v2MatchesTarget,
      mismatchClasses,
      ownerTeam,
      expectedDisposition: status === "match" ? "expected" : "unclassified",
      ...(v2Result.status === "rejected"
        ? { v2ErrorCode: safeErrorCode(v2Result.reason) }
        : {}),
    });
    try {
      await this.deps.sink.append(record);
    } catch (error) {
      this.deps.onSinkError?.(error, immutableInput);
    }
    return Object.freeze({
      authoritative: "legacy",
      decision: legacyDecision,
      sampled: true,
    });
  }
}

export function mustCompare(
  actionClass: AuthorizationShadowActionClass,
): boolean {
  return MANDATORY_COMPARISON_ACTIONS.has(actionClass);
}

export function isDeterministicallySampled(
  requestId: string,
  numerator: number,
  denominator: number,
): boolean {
  if (numerator === denominator) return true;
  if (numerator === 0) return false;
  const digest = createHash("sha256").update(requestId).digest();
  return digest.readUInt32BE(0) % denominator < numerator;
}

export function normalizeDecision(
  decision: AuthorizationComparableDecision,
): AuthorizationComparableDecision {
  const permissionCodes = sortedUnique(decision.permissionCodes);
  const evidenceKinds = sortedUnique(decision.evidenceKinds ?? []);
  const scopes = [...decision.scopes]
    .map((scope) => Object.freeze({
      kind: scope.kind,
      values: Object.freeze(sortedUnique(scope.values)),
    }))
    .sort((left, right) =>
      `${left.kind}:${left.values.join("\u0000")}`.localeCompare(
        `${right.kind}:${right.values.join("\u0000")}`,
      )
    );
  return Object.freeze({
    plane: decision.plane,
    decision: decision.decision,
    permissionCodes: Object.freeze(permissionCodes),
    scopes: Object.freeze(scopes),
    reason: decision.reason,
    evidenceKinds: Object.freeze(evidenceKinds),
  });
}

export function decisionsEqual(
  left: AuthorizationComparableDecision,
  right: AuthorizationComparableDecision,
): boolean {
  return JSON.stringify(normalizeDecision(left))
    === JSON.stringify(normalizeDecision(right));
}

export function classifyMismatch(
  input: AuthorizationImmutableShadowInput,
  legacy: AuthorizationComparableDecision,
  v2: AuthorizationComparableDecision | undefined,
  target: AuthorizationComparableDecision | undefined,
): readonly AuthorizationMismatchClass[] {
  const classes = new Set<AuthorizationMismatchClass>();
  if (!v2 || !target) classes.add("data_defect");
  const normalizedLegacy = normalizeDecision(legacy);
  const normalizedV2 = v2 ? normalizeDecision(v2) : undefined;
  const normalizedTarget = target ? normalizeDecision(target) : undefined;
  const available = [
    normalizedLegacy,
    normalizedV2,
    normalizedTarget,
  ].filter((value): value is AuthorizationComparableDecision => Boolean(value));
  if (
    legacy.plane !== input.plane
    || v2?.plane !== input.plane
    || target?.plane !== input.plane
  ) classes.add("plane");
  if (hasDistinct(available.map((value) => value.permissionCodes))) {
    classes.add("capability");
  }
  if (hasDistinct(available.map((value) => value.scopes))) {
    classes.add("scope");
  }
  if (available.some((value) =>
    !value.permissionCodes.includes(input.permissionCode)
  )) classes.add("operation_mapping");
  const reasons = [legacy.reason, v2?.reason, target?.reason].filter(Boolean);
  if (reasons.some((reason) => String(reason).includes("entitlement"))) {
    classes.add("entitlement");
  }
  if (
    hasDistinct(available.map((value) => value.decision))
    && !classes.has("entitlement")
  ) classes.add("precedence");
  const evidence = [
    ...(legacy.evidenceKinds ?? []),
    ...(v2?.evidenceKinds ?? []),
    ...(target?.evidenceKinds ?? []),
  ];
  if (
    input.actionClass === "delegation_use"
    || evidence.includes("delegation")
  ) classes.add("delegation");
  if (
    input.actionClass === "acl_protected_read"
    || input.consumerPath === "acl"
    || evidence.includes("record_acl")
  ) classes.add("acl");
  if (
    classes.size === 0
    && (
      (v2 && !decisionsEqual(legacy, v2))
      || (target && !decisionsEqual(legacy, target))
    )
  ) {
    classes.add("data_defect");
  }
  return Object.freeze([...classes].sort());
}

function deepFreezeShadowInput(
  input: AuthorizationImmutableShadowInput,
): AuthorizationImmutableShadowInput {
  if (!/^[0-9a-f]{64}$/.test(input.immutableContextSha256)) {
    throw new Error("shadow input requires immutable context SHA-256");
  }
  if (
    computeAuthorizationImmutableContextSha256(input.identityContext)
      !== input.immutableContextSha256
  ) {
    throw new Error("shadow immutable context SHA-256 mismatch");
  }
  if (!input.permissionCode.trim() || !input.cohortCode.trim()) {
    throw new Error("shadow input requires exact permission and cohort");
  }
  deepFreeze(input.identityContext);
  return Object.freeze({ ...input, identityContext: input.identityContext });
}

export function computeAuthorizationImmutableContextSha256(
  identityContext: Readonly<Record<string, unknown>>,
): string {
  return createHash("sha256")
    .update(stableJson(identityContext))
    .digest("hex");
}

function deepFreeze(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  Object.freeze(value);
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

function hasDistinct(values: readonly unknown[]): boolean {
  return new Set(values.map((value) => JSON.stringify(value))).size > 1;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${
    Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    ).join(",")
  }}`;
}

function safeErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code ?? "V2_ERROR");
  }
  return "V2_ERROR";
}
