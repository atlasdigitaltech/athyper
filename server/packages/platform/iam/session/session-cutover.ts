import { createHash, randomUUID } from "node:crypto";
import type { AuthorizationSessionV2 } from "../authorization-runtime/session-v2.js";

export type SessionCutoverMode = "legacy" | "shadow" | "enforce";
export type SessionMismatchArea = "tenant" | "principal" | "binding" | "catalog" | "scope" | "permission";

export interface CanonicalSessionResolver<TInput> {
  resolve(input: TInput): Promise<AuthorizationSessionV2>;
}

export interface SessionShadowRecord {
  tenantId: string;
  principalId: string;
  plane: "admin" | "neon" | "mesh";
  requestId: string;
  status: "match" | "mismatch" | "candidate_error";
  mismatchAreas: readonly SessionMismatchArea[];
  legacyResult: Record<string, unknown>;
  candidateResult?: Record<string, unknown>;
  candidateError?: string;
  legacyFingerprint: string;
  candidateFingerprint?: string;
  resolverRevision: string;
}

export interface SessionShadowSink {
  append(record: SessionShadowRecord): Promise<void>;
}

export function sessionCutoverMode(): SessionCutoverMode {
  const value = process.env["IAM_CANONICAL_SESSION_CUTOVER_MODE"]?.trim().toLowerCase();
  if (value === "legacy" || value === "shadow") return value;
  return "enforce";
}

export class SessionCutoverResolver<TInput extends {
  tenantId: string;
  plane: "admin" | "neon" | "mesh";
}> implements CanonicalSessionResolver<TInput> {
  constructor(
    private readonly legacy: CanonicalSessionResolver<TInput> | undefined,
    private readonly candidate: CanonicalSessionResolver<TInput>,
    private readonly mode: SessionCutoverMode,
    private readonly sink?: SessionShadowSink,
    private readonly revision = process.env["IAM_SESSION_RESOLVER_REVISION"] ?? "unpublished",
  ) {
    if ((mode === "legacy" || mode === "shadow") && !legacy) {
      throw new Error("LEGACY_SESSION_RESOLVER_REQUIRED_FOR_NON_ENFORCE_MODE");
    }
    if (legacy === candidate) throw new Error("SESSION_SHADOW_RESOLVERS_MUST_BE_INDEPENDENT");
  }

  async resolve(input: TInput): Promise<AuthorizationSessionV2> {
    if (this.mode === "enforce") return this.candidate.resolve(input);
    const legacy = await this.legacy!.resolve(input);
    if (this.mode === "legacy") return legacy;
    const requestId = randomUUID();
    try {
      const candidate = await this.candidate.resolve(input);
      const areas = compareSessions(legacy, candidate);
      await this.sink?.append(record(input, requestId, legacy, candidate, areas, this.revision));
    } catch (error) {
      const normalized = normalizeSession(legacy);
      await this.sink?.append({
        tenantId: input.tenantId,
        principalId: legacy.principalId,
        plane: input.plane,
        requestId,
        status: "candidate_error",
        mismatchAreas: [],
        legacyResult: normalized,
        candidateError: safeError(error),
        legacyFingerprint: fingerprint(normalized),
        resolverRevision: this.revision,
      });
    }
    return legacy;
  }
}

export function compareSessions(a: AuthorizationSessionV2, b: AuthorizationSessionV2): SessionMismatchArea[] {
  const areas = new Set<SessionMismatchArea>();
  if (a.plane !== b.plane || a.tenantOrAccountId !== b.tenantOrAccountId) areas.add("tenant");
  if (a.principalId !== b.principalId) areas.add("principal");
  if (a.identityBindingId !== b.identityBindingId) areas.add("binding");
  if (a.catalogVersion !== b.catalogVersion || stable(a.policyVersions) !== stable(b.policyVersions)) areas.add("catalog");
  const left = decisionMap(a);
  const right = decisionMap(b);
  for (const code of new Set([...left.keys(), ...right.keys()])) {
    const l = left.get(code);
    const r = right.get(code);
    if (!l || !r || l.decision !== r.decision || l.available !== r.available || l.reason !== r.reason) areas.add("permission");
    if (!l || !r || stable(l.organizationalScope ?? null) !== stable(r.organizationalScope ?? null)) areas.add("scope");
  }
  return [...areas];
}

function decisionMap(session: AuthorizationSessionV2) {
  return new Map(session.decisions.map((item) => [item.canonicalCode, item]));
}

function normalizeSession(session: AuthorizationSessionV2): Record<string, unknown> {
  return {
    contractVersion: session.contractVersion,
    evaluatorContractVersion: session.evaluatorContractVersion,
    plane: session.plane,
    tenantOrAccountId: session.tenantOrAccountId,
    principalId: session.principalId,
    identityBindingId: session.identityBindingId,
    catalogVersion: session.catalogVersion,
    policyVersions: [...session.policyVersions].sort(),
    decisions: [...session.decisions].map((item) => ({
      canonicalCode: item.canonicalCode,
      available: item.available,
      decision: item.decision,
      reason: item.reason,
      organizationalScope: item.organizationalScope ?? null,
      authorizationFingerprint: item.authorizationFingerprint,
    })).sort((a, b) => a.canonicalCode.localeCompare(b.canonicalCode)),
  };
}

function record<TInput extends { tenantId: string; plane: "admin" | "neon" | "mesh" }>(
  input: TInput,
  requestId: string,
  legacy: AuthorizationSessionV2,
  candidate: AuthorizationSessionV2,
  mismatchAreas: readonly SessionMismatchArea[],
  resolverRevision: string,
): SessionShadowRecord {
  const legacyResult = normalizeSession(legacy);
  const candidateResult = normalizeSession(candidate);
  return {
    tenantId: input.tenantId,
    principalId: legacy.principalId,
    plane: input.plane,
    requestId,
    status: mismatchAreas.length ? "mismatch" : "match",
    mismatchAreas,
    legacyResult,
    candidateResult,
    legacyFingerprint: fingerprint(legacyResult),
    candidateFingerprint: fingerprint(candidateResult),
    resolverRevision,
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).sort().join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]/g, " ").slice(0, 1000);
}
