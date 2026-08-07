// server/src/kernel/request-context.ts
//
// AsyncLocalStorage-based request context for the Athyper runtime.
//
// Design rules:
//   - getContext() throws if called outside a request/job context.
//   - tryGetContext() returns undefined safely for optional enrichment.
//   - runWithContext() is for Express middleware: wraps next() so the
//     downstream async chain inherits the context automatically.
//   - runWithJobContext() is for BullMQ workers: synthesizes a context from job
//     payload fields so handlers can call getContext().

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { VerifiedRequestContext } from "@athyper/svc-iam";

export type PlaneKey = "neon" | "mesh" | "admin";

export interface RequestContext {
  /** Unique identifier for this request or job invocation. Always present. */
  requestId: string;
  /**
   * Correlation ID for distributed tracing and support lookups.
   * Resolved in priority order: X-Correlation-ID header → OTel traceId (when
   * sampled) → requestId. Always set; surfaces in PlatformErrorResponse as requestId.
   */
  correlationId?: string;
  /** Product plane for this request. Used as a trust boundary, not a backend silo. */
  planeKey?: PlaneKey;
  /** Keycloak realm key for this request. */
  realmKey?: string;
  /** Legacy alias for realmKey while older callers still read `realm`. */
  realm?: string;
  /** Authenticated user ID, usually the JWT subject. */
  userId?: string;
  /** Application principal UUID after token-to-principal resolution. */
  principalId?: string;
  /** Tenant UUID resolved from org/realm or token context. */
  tenantId?: string;
  /** Tenant/org key from X-Org before it is resolved to tenantId. */
  orgKey?: string;
  /** Company code key from X-Org when present as {tenant}--{companyCode}. */
  companyCodeKey?: string;
  /**
   * Canonical authority context for Neon/Admin. Mesh uses its local repository
   * and never falls back to Neon authority.
   * Populated by the permission-context middleware after token verification.
   */
  /**
   * Active mesh.account_grant id when planeKey === 'mesh'. Pairs with the
   * fingerprint stored on the grant row; used in the descriptor cache key.
   */
  /**
   * Stable fingerprint of the authority binding for the active plane that
   * identifies *this* principal scope. Goes into the descriptor cache key
   * so authority changes and binding revocations invalidate the cache.
   */
  principalFingerprint?: string;
  /**
   * Composite hash of (principalFingerprint, allowed permission codes,
   * planVersionId). The descriptor cache key v4 includes this so plan
   * upgrades and grant changes bust the cache automatically.
   */
  profileHash?: string;
  /** Current principal security epoch from the verified identity boundary. */
  authEpoch?: number;
  /** Exact immutable IAM context shared with the route boundary. */
  verified?: VerifiedRequestContext;
}

export function normalizePlaneKey(value: unknown): PlaneKey | undefined {
  const key = Array.isArray(value) ? value[0] : value;
  if (key === "neon" || key === "mesh" || key === "admin") return key;
  return undefined;
}

/**
 * Derive the plane key from a Keycloak token's `azp` claim.
 * Maps the per-plane web client ids (`neon-web`, `mesh-web`, `admin-web`) to
 * their plane. Returns null for service tokens or unknown `azp` so callers can
 * skip plane cross-checks instead of mis-rejecting them.
 */
export function derivePlaneFromAzp(value: unknown): PlaneKey | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  if (raw === "neon-web") return "neon";
  if (raw === "mesh-web") return "mesh";
  if (raw === "admin-web") return "admin";
  return null;
}

/**
 * Derive the realm key from a Keycloak token's `iss` claim.
 * Pulls the last path segment after `/realms/`. Used to cross-check
 * header-derived `x-realm` against the actual token issuer so a header cannot
 * pick a different verifier than the one that issued the token.
 */
export function deriveRealmFromIss(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /\/realms\/([^/]+)\/?$/.exec(value);
  return match?.[1] ?? null;
}

export function parseOrgHeader(value: unknown): Pick<RequestContext, "orgKey" | "companyCodeKey"> {
  const header = Array.isArray(value) ? value[0] : value;
  if (typeof header !== "string" || header.trim().length === 0) return {};

  const [orgKey, companyCodeKey] = header.split("--").map((part) => part.trim());
  return {
    ...(orgKey ? { orgKey } : {}),
    ...(companyCodeKey ? { companyCodeKey } : {}),
  };
}

const store = new AsyncLocalStorage<RequestContext>();

/**
 * Returns the current context, or undefined when called outside a request/job
 * scope. Prefer getContext() where context is always required.
 */
export function tryGetContext(): RequestContext | undefined {
  return store.getStore();
}

/**
 * Returns the current context. Throws when called outside a request/job context.
 */
export function getContext(): RequestContext {
  const ctx = store.getStore();
  if (!ctx) {
    throw new Error(
      "getContext() called outside request scope; use runWithContext() or runWithJobContext()",
    );
  }
  return ctx;
}

/** Attach the exact frozen IAM object to the active request ALS context. */
export function bindVerifiedRequestContext(context: VerifiedRequestContext): void {
  const current = getContext();
  current.verified = context;
  current.requestId = context.requestId;
  current.planeKey = context.planeKey;
  current.realmKey = context.realmKey;
  current.realm = context.realmKey;
  current.tenantId = context.tenantId;
  current.principalId = context.principalId;
  current.profileHash = context.profileHash;
  current.authEpoch = context.authEpoch;
  current.principalFingerprint = context.permissions.principalFingerprint;
}

/**
 * Runs fn within the given request context.
 *
 * Pass directly as the Express next callback to capture the full async chain:
 *   runWithContext({ requestId }, next);
 */
export function runWithContext<T>(
  ctx: RequestContext,
  fn: (...args: unknown[]) => T,
): T {
  return store.run(ctx, fn);
}

/**
 * Runs an async handler within a synthesized context built from job payload
 * fields. Generates a fresh requestId when the payload does not carry one.
 */
export async function runWithJobContext<T>(
  payloadCtx: Partial<RequestContext>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const realmKey = payloadCtx.realmKey ?? payloadCtx.realm;
  const ctx: RequestContext = {
    requestId: payloadCtx.requestId ?? randomUUID(),
    planeKey: payloadCtx.planeKey,
    realmKey,
    realm: realmKey,
    userId: payloadCtx.userId,
    principalId: payloadCtx.principalId,
    tenantId: payloadCtx.tenantId,
    orgKey: payloadCtx.orgKey,
    companyCodeKey: payloadCtx.companyCodeKey,
    principalFingerprint: payloadCtx.principalFingerprint,
    profileHash: payloadCtx.profileHash,
    authEpoch: payloadCtx.authEpoch,
    verified: payloadCtx.verified,
  };
  return store.run(ctx, () => Promise.resolve(fn()));
}
