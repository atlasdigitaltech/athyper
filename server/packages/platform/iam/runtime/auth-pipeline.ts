// Runtime authorization enforcement pipeline owned by platform IAM.
//
// Phase B — Shared auth-enforcement pipeline.
//
// Single source of truth for the per-request authorization checks that today
// are duplicated across:
//   - verifyTokenForCurrentContext()          (api.ts)
//   - requirePlatformContext middleware       (require-platform-context.ts)
//   - /api/auth/verify handler                (api.ts)
//
// Each step is a pure (or pure-on-fixed-deps) function so call sites can pick
// only what they need — e.g. /api/auth/verify uses every step including
// required-actions; the legacy verifyToken path uses only the claim cross-
// checks. The combined `enforceAuthPipeline` wraps them in the canonical order:
//
//   1. crossCheckClaimsAgainstContext  iss/azp/tenant vs header-derived ctx
//   2. resolveCanonicalTenant          one master.tenant lookup; compare to claim
//   3. enforceAuthorizedRole           AUTHORIZED on `${plane}-web`
//   4. enforceRequiredActions          KC required_actions vs route matrix
//
// The pipeline does NOT call any metrics or logger directly. Callers wire a
// CrossCheckReporter so the module stays decoupled from metrics.ts.

import type { Kysely } from "kysely";

import {
  derivePlaneFromAzp,
  deriveRealmFromIss,
  type RuntimePlaneKey as PlaneKey,
} from "@athyper/server-foundation/context";
import {
  clientHasRole,
  extractRequiredActionsFromClaims,
  loadMatrixFromEnv,
  matchRequiredActions,
} from "@athyper/platform-iam-auth-common";

// Re-export shared primitives so existing consumers don't have to update
// import paths — the server pipeline is still the single import surface
// they know.
export {
  extractRequiredActionsFromClaims,
  isMutatingMethod,
} from "@athyper/platform-iam-auth-common";

// ─── Error model ─────────────────────────────────────────────────────────────

export type AuthPipelineErrorCode =
  | "AUTH_CONTEXT_MISMATCH"
  | "TENANT_MISMATCH"
  | "TENANT_NOT_FOUND"
  | "TENANT_LOOKUP_FAILED"
  | "NO_PLATFORM_ACCESS"
  | "REQUIRED_ACTION_PENDING";

export type AuthPipelineCheck = "realm" | "plane" | "tenant" | "azp";

export interface AuthPipelineError {
  readonly code: AuthPipelineErrorCode;
  readonly status: number;
  readonly message: string;
  readonly check?: AuthPipelineCheck;
  readonly detail?: Record<string, unknown>;
  readonly blockingAction?: string;
}

// ─── Reporter (metrics + logger sink, injected by caller) ────────────────────

export interface CrossCheckReporter {
  /** Called every time a mismatch is detected. */
  recordMismatch(check: AuthPipelineCheck, mode: "shadow" | "enforced"): void;
  /** Structured log emitter for the pipeline. */
  log(event: string, fields: Record<string, unknown>): void;
}

export type AuthPipelineMode = "off" | "shadow" | "on";

// ─── Pipeline context (loose subset of RequestContext) ───────────────────────

export interface PipelineCtx {
  readonly requestId?: string;
  readonly planeKey?: PlaneKey;
  readonly realmKey?: string;
  readonly realm?: string;
  readonly tenantId?: string;
  readonly orgKey?: string;
}

// ─── Step 1: claim-vs-context cross-checks ───────────────────────────────────

export interface CrossCheckInput {
  readonly claims: Record<string, unknown>;
  readonly ctx?: PipelineCtx;
  readonly allowedAzp?: readonly string[];
}

export interface CrossCheckMismatch {
  readonly check: AuthPipelineCheck;
  readonly detail: Record<string, unknown>;
}

export interface CrossCheckResult {
  readonly ok: boolean;
  readonly mismatches: readonly CrossCheckMismatch[];
}

/**
 * Step 1 — verify the validated token's claims agree with the ALS/header-
 * derived request context. Detects realm/plane/tenant/azp drift. In `shadow`
 * mode mismatches are reported but `ok` stays true; in `on` mode the first
 * mismatch flips `ok` to false. The caller decides what HTTP status to emit.
 */
/**
 * Stable, low-cardinality bucketing key for the `iss` claim. Used by the
 * Phase F log sampler so two realms under the same tenant don't merge.
 * Not a security primitive — purely for forensic-clarity grouping.
 *
 * Uses Java string-hash semantics (32-bit folding) so we don't need crypto
 * imports here and the output is stable across process restarts. 8-char
 * hex output keeps Prometheus / log indexes bounded.
 */
function hashIssForBucketing(iss: unknown): string | undefined {
  if (typeof iss !== "string" || iss.length === 0) return undefined;
  let h = 0;
  for (let i = 0; i < iss.length; i++) {
    h = (Math.imul(h, 31) + iss.charCodeAt(i)) | 0;
  }
  // Convert to unsigned then to fixed-width hex.
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function crossCheckClaimsAgainstContext(
  input: CrossCheckInput,
  mode: AuthPipelineMode,
  reporter: CrossCheckReporter,
): CrossCheckResult {
  if (mode === "off") return { ok: true, mismatches: [] };

  const mismatches: CrossCheckMismatch[] = [];
  const ctx = input.ctx;
  const requestedRealmKey = ctx?.realmKey ?? ctx?.realm;
  const enforced = mode === "on";

  // realm ← iss path segment
  const realmFromIss = deriveRealmFromIss(input.claims["iss"]);
  if (realmFromIss && requestedRealmKey && realmFromIss !== requestedRealmKey) {
    const detail = {
      requestId: ctx?.requestId,
      requestedRealmKey,
      realmFromIss,
      // Phase H/F4: include realm + iss-hash so the log sampler can bucket
      // mismatches per-realm. The sampler reads these from the log fields.
      ctxRealmKey: requestedRealmKey,
      issHash: hashIssForBucketing(input.claims["iss"]),
    };
    mismatches.push({ check: "realm", detail });
    reporter.recordMismatch("realm", enforced ? "enforced" : "shadow");
    reporter.log("auth_context_mismatch", { check: "realm", mode, ...detail });
  }

  // plane ← azp → web-client mapping
  const planeFromAzp = derivePlaneFromAzp(input.claims["azp"]);
  if (planeFromAzp && ctx?.planeKey && planeFromAzp !== ctx.planeKey) {
    const detail = {
      requestId: ctx.requestId,
      ctxPlaneKey: ctx.planeKey,
      planeFromAzp,
      azp: input.claims["azp"],
      ctxRealmKey: requestedRealmKey,
      issHash: hashIssForBucketing(input.claims["iss"]),
    };
    mismatches.push({ check: "plane", detail });
    reporter.recordMismatch("plane", enforced ? "enforced" : "shadow");
    reporter.log("auth_context_mismatch", { check: "plane", mode, ...detail });
  }

  // tenant ← claim vs header-derived ctx.tenantId
  const tenantIdClaim = typeof input.claims["tenant_id"] === "string"
    ? (input.claims["tenant_id"] as string)
    : null;
  if (tenantIdClaim && ctx?.tenantId && tenantIdClaim !== ctx.tenantId) {
    const detail = {
      requestId: ctx.requestId,
      ctxTenantId: ctx.tenantId,
      tenantIdClaim,
      orgKey: ctx.orgKey,
      ctxRealmKey: requestedRealmKey,
      issHash: hashIssForBucketing(input.claims["iss"]),
    };
    mismatches.push({ check: "tenant", detail });
    reporter.recordMismatch("tenant", enforced ? "enforced" : "shadow");
    reporter.log("auth_context_mismatch", { check: "tenant", mode, ...detail });
  }

  // azp ∉ allowedAzp (only reportable when both sides are present and the
  // token's azp wasn't one we map to a plane — covers service tokens that
  // shouldn't be reaching plane-scoped endpoints).
  const allowedAzp = input.allowedAzp ?? [];
  if (
    ctx?.planeKey
    && typeof input.claims["azp"] === "string"
    && planeFromAzp === null
    && allowedAzp.length > 0
    && !allowedAzp.includes(input.claims["azp"] as string)
  ) {
    const detail = {
      requestId: ctx.requestId,
      azp: input.claims["azp"],
      allowedAzp,
      ctxRealmKey: requestedRealmKey,
      issHash: hashIssForBucketing(input.claims["iss"]),
    };
    mismatches.push({ check: "azp", detail });
    reporter.recordMismatch("azp", enforced ? "enforced" : "shadow");
    reporter.log("auth_context_mismatch", { check: "azp", mode, ...detail });
  }

  return { ok: !enforced || mismatches.length === 0, mismatches };
}

// ─── Step 2: tenant resolution + cross-check ─────────────────────────────────

export interface TenantResolveInput {
  readonly xOrg: string;
  readonly realmKey: string;
  readonly claimsTenantId: string | null;
}

export interface TenantResolveResult {
  readonly ok: boolean;
  readonly tenantId?: string;
  readonly error?: AuthPipelineError;
}

export interface TenantResolveLogger {
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

/**
 * Step 2 — resolve the canonical tenant UUID for the request:
 *   1. Split `x-org` on `--` to get tenant_code.
 *   2. Look up master.tenant by (code, realm_key).
 *   3. If the token carries a `tenant_id` claim, require the resolved UUID to
 *      match. Cross-claim mismatch returns TENANT_MISMATCH (403).
 * Returns the canonical tenantId so callers can stash it on the request
 * context once, avoiding duplicate lookups downstream.
 */
export async function resolveCanonicalTenant(
  input: TenantResolveInput,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  logger: TenantResolveLogger,
): Promise<TenantResolveResult> {
  if (!input.xOrg) return { ok: true };
  const tenantCode = input.xOrg.split("--")[0];
  if (!tenantCode) return { ok: true };

  let resolvedTenantId: string | null = null;
  try {
    const row = await db
      .selectFrom("master.tenant as t")
      .select("t.id")
      .where("t.code", "=", tenantCode)
      .where("t.realm_key", "=", input.realmKey)
      .executeTakeFirst();
    resolvedTenantId = row ? (row.id as string) : null;
  } catch (err) {
    const detail = {
      tenantCode,
      realmKey: input.realmKey,
      err: err instanceof Error ? err.message : String(err),
    };
    logger.error("auth_pipeline_tenant_lookup_failed", detail);
    return {
      ok: false,
      error: {
        code: "TENANT_LOOKUP_FAILED",
        status: 500,
        message: "Tenant resolution failed.",
        detail,
      },
    };
  }

  if (!resolvedTenantId) {
    const detail = { tenantCode, realmKey: input.realmKey };
    logger.warn("auth_pipeline_tenant_not_found", detail);
    return {
      ok: false,
      error: {
        code: "TENANT_NOT_FOUND",
        status: 404,
        message: "x-org tenant code does not exist in this realm.",
        detail,
      },
    };
  }

  if (input.claimsTenantId && resolvedTenantId !== input.claimsTenantId) {
    return {
      ok: false,
      error: {
        code: "TENANT_MISMATCH",
        status: 403,
        message: "Token tenant does not match the requested tenant.",
        check: "tenant",
        detail: {
          resolvedTenantId,
          claimsTenantId: input.claimsTenantId,
          tenantCode,
          realmKey: input.realmKey,
        },
      },
    };
  }

  return { ok: true, tenantId: resolvedTenantId };
}

// ─── Step 3: AUTHORIZED role check ───────────────────────────────────────────

/**
 * Step 3 — assert the token's resource_access carries `AUTHORIZED` on the
 * `${planeKey}-web` client. Login enforces this once; the gate must re-assert
 * because KC may have revoked the role since the token was issued.
 */
export function enforceAuthorizedRole(
  claims: Record<string, unknown>,
  planeKey: PlaneKey,
): { ok: boolean; error?: AuthPipelineError } {
  const clientId = `${planeKey}-web`;
  if (clientHasRole(claims["resource_access"], clientId, "AUTHORIZED")) {
    return { ok: true };
  }
  return {
    ok: false,
    error: {
      code: "NO_PLATFORM_ACCESS",
      status: 403,
      message: "Your account is not authorized for this plane.",
      detail: { planeKey, clientId },
    },
  };
}

// ─── Step 4: required-actions matrix ─────────────────────────────────────────

export interface RequiredActionsInput {
  readonly claims: Record<string, unknown>;
  readonly route?: { readonly path: string; readonly method: string };
  readonly matrix: Record<string, readonly string[]>;
}

/**
 * Step 4 — block routes that match a pending KC required-action's prefix.
 *
 * Phase G: the matching algorithm lives in @athyper/platform-iam-auth-common so the BFF
 * pipeline runs the same code. This wrapper translates the generic
 * MatrixMatch result into the server's AuthPipelineError shape.
 */
export function enforceRequiredActions(
  input: RequiredActionsInput,
): { ok: boolean; error?: AuthPipelineError } {
  const required = extractRequiredActionsFromClaims(input.claims);
  const match = matchRequiredActions({
    requiredActions: required,
    ...(input.route ? { route: input.route } : {}),
    matrix: input.matrix,
  });
  if (!match.blocked) return { ok: true };
  return {
    ok: false,
    error: {
      code: "REQUIRED_ACTION_PENDING",
      status: 403,
      message: "Complete the pending account action before continuing.",
      ...(match.blockingAction ? { blockingAction: match.blockingAction } : {}),
      ...(match.detail ? { detail: match.detail } : {}),
    },
  };
}

// ─── Default required-actions matrix + env override loader ───────────────────

export const DEFAULT_REQUIRED_ACTION_MATRIX: Record<string, readonly string[]> = {
  UPDATE_PASSWORD: ["/api/"],
  VERIFY_EMAIL: [
    "/api/finance/",
    "/api/ap/",
    "/api/ar/",
    // Journal entries and invoices land in the GL — caller's email must be verified.
    "/api/runtime/v1/entities/journal_entry",
    "/api/runtime/v1/entities/invoice",
  ],
  CONFIGURE_TOTP: [
    "/api/workflow/",
    "/api/iam/grants",
    "/api/iam/groups",
    "/api/iam/roles",
  ],
};

export function loadRequiredActionMatrix(): Record<string, readonly string[]> {
  // Phase G: shared parse logic. Surface-specific matrix env name + default
  // stays here so the server / BFF can evolve independently.
  return loadMatrixFromEnv("AUTH_REQUIRED_ACTIONS_MATRIX", DEFAULT_REQUIRED_ACTION_MATRIX);
}

// ─── Full pipeline ───────────────────────────────────────────────────────────

export interface EnforceAuthPipelineInput {
  readonly claims: Record<string, unknown>;
  readonly ctx?: PipelineCtx;
  readonly headers: { readonly xOrg?: string; readonly xRealm?: string };
  readonly route?: { readonly path: string; readonly method: string };
  readonly allowedAzp?: readonly string[];
}

export interface EnforceAuthPipelineOptions {
  /** Cross-check enforcement mode. Off, log-only (shadow), or block (on). */
  readonly mode: AuthPipelineMode;
  /** Skip the tenant lookup (e.g. /api/auth/verify in legacy mode). */
  readonly resolveTenant?: boolean;
  /** Skip the AUTHORIZED check (e.g. for tests). */
  readonly enforceAuthorized?: boolean;
  /** Skip required-actions enforcement. */
  readonly enforceRequiredActions?: boolean;
  /** Override matrix; default loaded from env. */
  readonly requiredActionsMatrix?: Record<string, readonly string[]>;
}

export interface EnforceAuthPipelineDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly db: Kysely<any>;
  readonly defaultRealmKey: string;
  readonly logger: TenantResolveLogger & {
    info(event: string, fields?: Record<string, unknown>): void;
  };
  readonly reporter: CrossCheckReporter;
}

export interface EnforceAuthPipelineResult {
  readonly ok: boolean;
  readonly canonical?: {
    readonly tenantId?: string;
    readonly realmKey: string;
    readonly planeKey?: PlaneKey;
  };
  readonly error?: AuthPipelineError;
}

/**
 * Run the full pipeline. Composes the four steps in canonical order; the
 * first failing step short-circuits the rest. Returns the canonical tenant
 * id so the caller can stash it on ALS / req for downstream reuse.
 */
export async function enforceAuthPipeline(
  input: EnforceAuthPipelineInput,
  options: EnforceAuthPipelineOptions,
  deps: EnforceAuthPipelineDeps,
): Promise<EnforceAuthPipelineResult> {
  const realmKey = input.headers.xRealm
    ?? input.ctx?.realmKey
    ?? input.ctx?.realm
    ?? deps.defaultRealmKey;
  const planeKey = input.ctx?.planeKey
    ?? derivePlaneFromAzp(input.claims["azp"])
    ?? undefined;

  // Step 1 — claim cross-checks
  const crossCheck = crossCheckClaimsAgainstContext(
    { claims: input.claims, ctx: input.ctx, allowedAzp: input.allowedAzp },
    options.mode,
    deps.reporter,
  );
  if (!crossCheck.ok) {
    const first = crossCheck.mismatches[0];
    return {
      ok: false,
      error: {
        code: "AUTH_CONTEXT_MISMATCH",
        status: 403,
        message: `auth_context_mismatch:${first?.check ?? "unknown"}`,
        ...(first?.check ? { check: first.check } : {}),
        ...(first?.detail ? { detail: first.detail } : {}),
      },
    };
  }

  // Step 2 — tenant resolution + cross-check
  let resolvedTenantId: string | undefined;
  if (options.resolveTenant !== false && input.headers.xOrg) {
    const tenantResult = await resolveCanonicalTenant(
      {
        xOrg: input.headers.xOrg,
        realmKey,
        claimsTenantId: typeof input.claims["tenant_id"] === "string"
          ? (input.claims["tenant_id"] as string)
          : null,
      },
      deps.db,
      deps.logger,
    );
    if (!tenantResult.ok) {
      return { ok: false, ...(tenantResult.error ? { error: tenantResult.error } : {}) };
    }
    resolvedTenantId = tenantResult.tenantId;
  }

  // Step 3 — AUTHORIZED role
  if (options.enforceAuthorized !== false && planeKey) {
    const authorized = enforceAuthorizedRole(input.claims, planeKey);
    if (!authorized.ok) return { ok: false, ...(authorized.error ? { error: authorized.error } : {}) };
  }

  // Step 4 — required actions matrix
  if (options.enforceRequiredActions !== false) {
    const matrix = options.requiredActionsMatrix ?? loadRequiredActionMatrix();
    const ra = enforceRequiredActions({
      claims: input.claims,
      ...(input.route ? { route: input.route } : {}),
      matrix,
    });
    if (!ra.ok) return { ok: false, ...(ra.error ? { error: ra.error } : {}) };
  }

  return {
    ok: true,
    canonical: {
      realmKey,
      ...(resolvedTenantId !== undefined ? { tenantId: resolvedTenantId } : {}),
      ...(planeKey ? { planeKey } : {}),
    },
  };
}
