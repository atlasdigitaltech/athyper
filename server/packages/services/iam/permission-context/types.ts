// Three-plane permission stack — Phase 2.
//
// Two distinct "permission context" concepts exist in this codebase. Be careful
// not to conflate them:
//
//   1. `PermissionContext` in iam/permission/permission.types.ts is OPTIONAL
//      AUDIT metadata that a caller can pass through to checkPermission() so
//      the row written to log.permission_decision_log can carry entity / company
//      code / delegation references. It does NOT influence the decision.
//
//   2. `EffectivePermissionContext` (this file) is a REQUEST-SCOPED DTO that
//      a per-plane resolver constructs from token claims + DB queries. It IS
//      the input to descriptor compilation and operation filtering: which
//      permissions the principal has, which planes those permissions cover,
//      which fingerprint identifies the principal/grant for cache keying.
//
// The two are wired together at the route boundary: TenantResolver builds the
// EffectivePermissionContext; downstream calls into checkPermission() pass the
// (separate) audit PermissionContext when they want to enrich the log row.

import type { PlaneKey } from "./plane-key.js";

// ─── Decision per code (mirrors PermissionDecisionOutcome but trimmed) ──────────

/**
 * Per-code grant status as seen by the resolver. Distinct from
 * PermissionDecisionOutcome which is the runtime check result; here we only
 * carry what the descriptor compiler needs.
 */
export type EffectiveGrantStatus =
  | "allow"
  | "deny"
  | "not_in_plan"
  | "missing";

/**
 * One row in the resolved permission matrix. The resolver stores allowed,
 * denied, and plan-gated codes so the compiler can emit precise
 * `disabledReason` values without re-running the resolver.
 */
export interface EffectivePermissionEntry {
  /** Permission code as defined in shared.permission. */
  code: string;
  /** Resolved grant state. */
  status: EffectiveGrantStatus;
  /** Why — drives descriptor `disabledReason`. */
  reason:
    | "allowed"
    | "missing_permission"
    | "denied_by_grant"
    | "plan_locked"
    | "module_disabled"
    | "feature_disabled"
    | "plane_excluded";
}

// ─── Effective context DTO ──────────────────────────────────────────────────────

/**
 * Request-scoped, immutable snapshot of the principal's authorization surface
 * for the active tenant + plane. Constructed once per HTTP request by a
 * PermissionResolver and threaded through:
 *
 *   route entry  →  EffectivePermissionContext  →  descriptor compiler
 *                                              →  operation filter
 *                                              →  cache key inputs
 *
 * Never serialize this whole object to the client; only emit per-operation
 * `disabledReason` derived from it.
 */
export interface EffectivePermissionContext {
  /** Plane this context was built for. Drives plane_eligibility filtering. */
  readonly planeKey: PlaneKey;
  /** Tenant whose `entity` / `entity_operation` rows this context governs. */
  readonly tenantId: string;
  /** Active principal — neon/admin uses master.principal; mesh uses mesh.principal. */
  readonly principalId: string;
  /**
   * Active persona for neon/admin contexts. Undefined for mesh
   * (mesh authorization flows through account_grant, not persona_permission).
   */
  readonly personaId?: string;
  /**
   * Active mesh.account_grant id when planeKey === 'mesh'. Undefined for
   * neon/admin. Pairs with `bindingFingerprint` for cache keying.
   */
  readonly accountGrantId?: string;
  /**
   * Stable fingerprint identifying the binding/persona for cache key v4.
   * Neon/admin: persona fingerprint (hash of persona+roles+groups).
   * Mesh: `mesh.account_grant.fingerprint` (computed by trigger).
   */
  readonly principalFingerprint: string;
  /**
   * Active subscription plan version. Drives plan-gate filtering on neon.
   * Undefined for admin and mesh (admin is plan-free; mesh inherits the
   * inviting tenant's plan implicitly via the binding).
   */
  readonly planVersionId?: string;
  /** Network account id when planeKey === 'mesh'. */
  readonly networkAccountId?: string;

  /** All permissions allowed for this principal × tenant × plane × plan. */
  readonly allowed: ReadonlySet<string>;
  /** Permissions explicitly denied (access_grant.effect='deny'). */
  readonly denied: ReadonlySet<string>;
  /** Permissions hidden by plan/module/feature gates. */
  readonly planLocked: ReadonlySet<string>;
  /** Permissions hidden because they don't apply to this plane. */
  readonly planeExcluded: ReadonlySet<string>;
  /** Full per-code matrix. Iterate for descriptor disabledReason mapping. */
  readonly entries: ReadonlyMap<string, EffectivePermissionEntry>;

  /**
   * Composite SHA256 of (principalFingerprint, sorted allowed codes,
   * planVersionId). Goes into descriptor cache key so persona/plan/grant
   * changes invalidate the cache automatically.
   */
  readonly profileHash: string;

  /**
   * Runtime-flag fingerprint. Captures env feature flags, compiler version,
   * runtime contracts version — anything that could change the compiler
   * output for the same DB state. Goes into the cache key.
   */
  readonly schemaHash: string;

  /** Epoch milliseconds when this context was built (for debugging/tracing). */
  readonly resolvedAt: number;
}

// ─── Resolver interface ────────────────────────────────────────────────────────

/**
 * Inputs every resolver needs from the request layer. The middleware fills
 * these in after token verification + tenant resolution.
 */
export interface ResolverInput {
  readonly planeKey: PlaneKey;
  readonly tenantId: string;
  readonly principalId: string;
  /** Mesh only: which account_grant the partner is acting through. */
  readonly accountGrantId?: string;
  /** Optional schema-fingerprint override (defaults to env-driven). */
  readonly schemaHash?: string;
}

/**
 * Each plane gets its own resolver. The middleware looks up the resolver via
 * resolver-registry and calls build() to produce the context for the request.
 */
export interface PermissionResolver {
  readonly planeKey: PlaneKey;
  build(input: ResolverInput): Promise<EffectivePermissionContext>;
}

// Re-export for downstream consumers that only need the plane type.
export type { PlaneKey };
