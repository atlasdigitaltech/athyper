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

export type PlaneKey = "neon" | "mesh" | "admin";

export interface RequestContext {
  /** Unique identifier for this request or job invocation. Always present. */
  requestId: string;
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
}

export function normalizePlaneKey(value: unknown): PlaneKey | undefined {
  const key = Array.isArray(value) ? value[0] : value;
  if (key === "neon" || key === "mesh" || key === "admin") return key;
  return undefined;
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
  };
  return store.run(ctx, () => Promise.resolve(fn()));
}
