export type OperationScopeRolloutMode = "legacy" | "shadow" | "active";
export type OperationScopeDecision = "allow" | "deny";

export interface OperationScopeActivationCoordinate {
  plane: "neon" | "mesh";
  entityCode: string;
  sourceEntityOperationId: string;
  sourceReleaseHash: string;
  sourceArtifactHash: string;
}

export interface OperationScopeQualificationEvidence
  extends OperationScopeActivationCoordinate {
  sampleCount: number;
  mismatchCount: number;
  candidateErrorCount: number;
  observedFrom: Date;
  observedThrough: Date;
}

export interface OperationScopeActivationRule
  extends OperationScopeActivationCoordinate {
  mode: OperationScopeRolloutMode;
}

export interface ComparableAuthorizationDecision {
  decision: OperationScopeDecision;
  reason: string;
  fingerprint: string;
}

export interface OperationScopeShadowComparison {
  coordinate: OperationScopeActivationCoordinate;
  context: OperationScopeShadowContext;
  observedAt: Date;
  status: "match" | "mismatch" | "candidate_error";
  legacy: ComparableAuthorizationDecision;
  candidate: ComparableAuthorizationDecision | null;
  candidateError: string | null;
}

export interface OperationScopeShadowContext {
  tenantId: string;
  principalId: string;
  requestId: string;
  correlationId?: string;
  cohortCode?: string;
}

export interface OperationScopeShadowSink {
  append(comparison: OperationScopeShadowComparison): Promise<void>;
}

export interface OperationScopeRolloutResolver {
  resolve(request: CanonicalDecisionRequest): Promise<{
    coordinate: OperationScopeActivationCoordinate;
    mode: OperationScopeRolloutMode;
    qualification?: OperationScopeQualificationEvidence;
  } | null>;
}

export function summarizeOperationScopeQualification(
  coordinate: OperationScopeActivationCoordinate,
  comparisons: readonly OperationScopeShadowComparison[],
): OperationScopeQualificationEvidence {
  const exact = comparisons.filter((comparison) => sameCoordinate(coordinate, comparison.coordinate));
  const times = exact.map((comparison) => comparison.observedAt.getTime());
  const observed = times.length > 0 ? times : [0];
  return {
    ...coordinate,
    sampleCount: exact.length,
    mismatchCount: exact.filter((comparison) => comparison.status === "mismatch").length,
    candidateErrorCount: exact.filter((comparison) => comparison.status === "candidate_error").length,
    observedFrom: new Date(Math.min(...observed)),
    observedThrough: new Date(Math.max(...observed)),
  };
}

export class QualifiedOperationScopeRolloutResolver
  implements OperationScopeRolloutResolver {
  private readonly rules = new Map<string, {
    rule: OperationScopeActivationRule;
    qualification?: OperationScopeQualificationEvidence;
  }>();

  constructor(
    rules: readonly OperationScopeActivationRule[],
    evidence: readonly OperationScopeQualificationEvidence[],
  ) {
    for (const rule of rules) {
      const matchingEvidence = evidence.find((candidate) => sameCoordinate(rule, candidate));
      assertOperationScopeActivationQualified(rule, matchingEvidence);
      this.rules.set(ruleKey(rule.plane, rule.sourceEntityOperationId), {
        rule,
        ...(matchingEvidence ? { qualification: matchingEvidence } : {}),
      });
    }
  }

  async resolve(request: CanonicalDecisionRequest): Promise<{
    coordinate: OperationScopeActivationCoordinate;
    mode: OperationScopeRolloutMode;
    qualification?: OperationScopeQualificationEvidence;
  } | null> {
    if (request.subject.plane === "admin" || request.mode === "registered_capability") return null;
    const resolved = this.rules.get(ruleKey(request.subject.plane, request.entityOperationId));
    return resolved
      ? { coordinate: resolved.rule, mode: resolved.rule.mode, ...(
          resolved.qualification ? { qualification: resolved.qualification } : {}) }
      : null;
  }
}

export interface OperationScopeShadowEvaluation<T> {
  coordinate: OperationScopeActivationCoordinate;
  context: OperationScopeShadowContext;
  mode: OperationScopeRolloutMode;
  qualification?: OperationScopeQualificationEvidence;
  legacy(): Promise<{ value: T; comparable: ComparableAuthorizationDecision }>;
  candidate(): Promise<{ value: T; comparable: ComparableAuthorizationDecision }>;
}

export const DEFAULT_OPERATION_SCOPE_QUALIFICATION = Object.freeze({
  minimumSamples: 1_000,
  minimumWindowMilliseconds: 24 * 60 * 60 * 1_000,
});

/**
 * Proves that an exact immutable release/artifact coordinate has a clean,
 * plane-local comparison window. Evidence from another plane or artifact is
 * never reusable.
 */
export function assertOperationScopeActivationQualified(
  rule: OperationScopeActivationRule,
  evidence: OperationScopeQualificationEvidence | undefined,
  thresholds = DEFAULT_OPERATION_SCOPE_QUALIFICATION,
): void {
  if (rule.mode !== "active") return;
  if (!evidence) throw new Error("operation_scope_activation.evidence_required");
  for (const key of [
    "plane",
    "entityCode",
    "sourceEntityOperationId",
    "sourceReleaseHash",
    "sourceArtifactHash",
  ] as const) {
    if (rule[key] !== evidence[key]) {
      throw new Error(`operation_scope_activation.${key}_mismatch`);
    }
  }
  if (evidence.sampleCount < thresholds.minimumSamples) {
    throw new Error("operation_scope_activation.samples_insufficient");
  }
  if (evidence.mismatchCount !== 0) {
    throw new Error("operation_scope_activation.mismatches_present");
  }
  if (evidence.candidateErrorCount !== 0) {
    throw new Error("operation_scope_activation.candidate_errors_present");
  }
  if (evidence.observedThrough.getTime() - evidence.observedFrom.getTime()
      < thresholds.minimumWindowMilliseconds) {
    throw new Error("operation_scope_activation.window_insufficient");
  }
}

/**
 * Comparison-only migration boundary. Legacy remains authoritative in shadow
 * mode. Candidate and telemetry failures are observable but cannot deny or
 * grant a request until an explicitly qualified rule is switched to active.
 */
export class OperationScopeShadowComparator {
  constructor(
    private readonly sink: OperationScopeShadowSink,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async evaluate<T>(input: OperationScopeShadowEvaluation<T>): Promise<T> {
    if (input.mode === "legacy") return (await input.legacy()).value;
    if (input.mode === "active") {
      assertOperationScopeActivationQualified(
        { ...input.coordinate, mode: "active" },
        input.qualification,
      );
      return (await input.candidate()).value;
    }

    const legacy = await input.legacy();
    try {
      const candidate = await input.candidate();
      await this.appendBestEffort({
        coordinate: input.coordinate,
        context: input.context,
        observedAt: this.now(),
        status: sameDecision(legacy.comparable, candidate.comparable) ? "match" : "mismatch",
        legacy: legacy.comparable,
        candidate: candidate.comparable,
        candidateError: null,
      });
    } catch (error) {
      await this.appendBestEffort({
        coordinate: input.coordinate,
        context: input.context,
        observedAt: this.now(),
        status: "candidate_error",
        legacy: legacy.comparable,
        candidate: null,
        candidateError: safeError(error),
      });
    }
    return legacy.value;
  }

  private async appendBestEffort(comparison: OperationScopeShadowComparison): Promise<void> {
    try {
      await this.sink.append(comparison);
    } catch {
      // Shadow telemetry is never allowed to affect the authoritative result.
    }
  }
}

/**
 * Drop-in decision API used during migration. No caller is switched merely by
 * constructing this adapter: an unresolved operation stays legacy, and a
 * rollout resolver must explicitly return shadow or active for the exact
 * immutable coordinate.
 */
export class OperationScopeShadowDecisionApi
  implements ProductionAuthorizationDecisionApi {
  constructor(
    private readonly legacy: ProductionAuthorizationDecisionApi,
    private readonly candidate: ProductionAuthorizationDecisionApi,
    private readonly rollout: OperationScopeRolloutResolver,
    private readonly comparator: OperationScopeShadowComparator,
    private readonly activeCandidate: ProductionAuthorizationDecisionApi = candidate,
  ) {}

  async decide(request: CanonicalDecisionRequest): Promise<AuthorizationDecisionEnvelope> {
    const rollout = await this.rollout.resolve(request);
    if (!rollout) return this.legacy.decide(request);
    return this.comparator.evaluate({
      ...rollout,
      context: shadowContext(request),
      legacy: async () => {
        const value = await this.legacy.decide(request);
        return { value, comparable: comparableDecision(value) };
      },
      candidate: async () => {
        const value = await (rollout.mode === "active" ? this.activeCandidate : this.candidate).decide(request);
        return { value, comparable: comparableDecision(value) };
      },
    });
  }

  async decideBatch(
    requests: readonly CanonicalDecisionRequest[],
  ): Promise<AuthorizationBatchEnvelope> {
    const results = await Promise.all(requests.map((request) => this.decide(request)));
    return { contractVersion: AUTHORIZATION_RUNTIME_CONTRACT_VERSION, results };
  }

  async materialize(
    request: CollectionDecisionRequest,
  ): Promise<AuthorizationMaterializationEnvelope> {
    const rollout = await this.rollout.resolve(request);
    if (!rollout) return this.legacy.materialize(request);
    return this.comparator.evaluate({
      ...rollout,
      context: shadowContext(request),
      legacy: async () => {
        const value = await this.legacy.materialize(request);
        return { value, comparable: comparableMaterialization(value) };
      },
      candidate: async () => {
        const value = await (rollout.mode === "active" ? this.activeCandidate : this.candidate).materialize(request);
        return { value, comparable: comparableMaterialization(value) };
      },
    });
  }
}

/**
 * P5-E7 boundary used only after complete retirement qualification. Registered
 * capabilities retain their independent authority, while Entity operations
 * have no legacy execution path: every request must resolve to one qualified
 * active immutable coordinate.
 */
export class RetiredLegacyOperationScopeDecisionApi
  implements ProductionAuthorizationDecisionApi {
  constructor(
    private readonly capabilities:ProductionAuthorizationDecisionApi,
    private readonly normalized:ProductionAuthorizationDecisionApi,
    private readonly rollout:OperationScopeRolloutResolver,
  ){}

  async decide(request:CanonicalDecisionRequest):Promise<AuthorizationDecisionEnvelope>{
    if(request.mode==="registered_capability")return this.capabilities.decide(request);
    const resolved=await this.requireActive(request);
    assertOperationScopeActivationQualified({...resolved.coordinate,mode:"active"},resolved.qualification);
    return this.normalized.decide(request);
  }

  async decideBatch(requests:readonly CanonicalDecisionRequest[]):Promise<AuthorizationBatchEnvelope>{
    const results=await Promise.all(requests.map(request=>this.decide(request)));
    return {contractVersion:AUTHORIZATION_RUNTIME_CONTRACT_VERSION,results};
  }

  async materialize(request:CollectionDecisionRequest):Promise<AuthorizationMaterializationEnvelope>{
    const resolved=await this.requireActive(request);
    assertOperationScopeActivationQualified({...resolved.coordinate,mode:"active"},resolved.qualification);
    return this.normalized.materialize(request);
  }

  private async requireActive(request:CanonicalDecisionRequest){
    const resolved=await this.rollout.resolve(request);
    if(!resolved)throw new Error("operation_scope_retired.active_coordinate_required");
    if(resolved.mode!=="active")throw new Error(`operation_scope_retired.${resolved.mode}_not_supported`);
    return resolved;
  }
}

function sameDecision(
  legacy: ComparableAuthorizationDecision,
  candidate: ComparableAuthorizationDecision,
): boolean {
  return legacy.decision === candidate.decision
    && legacy.reason === candidate.reason;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n\t]+/gu, " ").slice(0, 1_000);
}

function sameCoordinate(
  left: OperationScopeActivationCoordinate,
  right: OperationScopeActivationCoordinate,
): boolean {
  return left.plane === right.plane
    && left.entityCode === right.entityCode
    && left.sourceEntityOperationId === right.sourceEntityOperationId
    && left.sourceReleaseHash === right.sourceReleaseHash
    && left.sourceArtifactHash === right.sourceArtifactHash;
}

function ruleKey(plane: "neon" | "mesh", sourceEntityOperationId: string): string {
  return `${plane}:${sourceEntityOperationId}`;
}

function comparableDecision(
  envelope: AuthorizationDecisionEnvelope,
): ComparableAuthorizationDecision {
  return {
    decision: envelope.result.decision,
    reason: envelope.result.reason,
    fingerprint: envelope.authorizationFingerprint,
  };
}

function comparableMaterialization(
  envelope: AuthorizationMaterializationEnvelope,
): ComparableAuthorizationDecision {
  return {
    decision: envelope.decision,
    reason: envelope.reason,
    fingerprint: envelope.authorizationFingerprint,
  };
}

function shadowContext(request: CanonicalDecisionRequest): OperationScopeShadowContext {
  return {
    tenantId: request.subject.tenantOrAccountId,
    principalId: request.subject.principalId,
    requestId: request.requestId,
  };
}
import type {
  CanonicalDecisionRequest,
  CollectionDecisionRequest,
} from "../authorization-evaluator/index.js";
import {
  AUTHORIZATION_RUNTIME_CONTRACT_VERSION,
  type AuthorizationBatchEnvelope,
  type AuthorizationDecisionEnvelope,
  type AuthorizationMaterializationEnvelope,
  type ProductionAuthorizationDecisionApi,
} from "./types.js";
