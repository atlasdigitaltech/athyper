// server/src/kernel/request-context.ts
//
// AsyncLocalStorage-based request context for the athyper runtime.
//
// Design rules:
//   - getContext() throws if called outside a request/job context — fail fast.
//   - tryGetContext() returns undefined safely — for optional enrichment only.
//   - runWithContext() is for Express middleware: wraps the next() call so the
//     full downstream async chain inherits the context automatically.
//   - runWithJobContext() is for BullMQ workers: synthesizes a context from job
//     payload fields so handlers can call getContext() without triggering
//     "outside request scope" errors. Required exit criterion for Phase 3.
//
// Usage in Express middleware (runtimes/api.ts):
//   app.use((req, _res, next) => {
//     const requestId = (req.headers["x-request-id"] as string) ?? crypto.randomUUID();
//     req.headers["x-request-id"] = requestId;
//     runWithContext({ requestId }, next);
//   });
//
// Usage in BullMQ job processor:
//   worker.process("my-queue", async (job) =>
//     runWithJobContext({ requestId: job.data.requestId }, async () => {
//       // getContext() works here
//     })
//   );

import { AsyncLocalStorage } from "node:async_hooks";

// ─── Context shape ────────────────────────────────────────────────────────────

export interface RequestContext {
  /** Unique identifier for this request or job invocation. Always present. */
  requestId: string;
  /** Keycloak realm for this request — populated by auth middleware. */
  realm?: string;
  /** Authenticated user ID — populated by auth middleware. */
  userId?: string;
  /** Tenant ID resolved from the token — populated by auth middleware. */
  tenantId?: string;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const _store = new AsyncLocalStorage<RequestContext>();

// ─── Accessors ────────────────────────────────────────────────────────────────

/**
 * Returns the current context, or `undefined` when called outside a
 * request/job scope. Prefer `getContext()` where context is always required.
 */
export function tryGetContext(): RequestContext | undefined {
  return _store.getStore();
}

/**
 * Returns the current context.
 * Throws when called outside a request/job context scope.
 */
export function getContext(): RequestContext {
  const ctx = _store.getStore();
  if (!ctx) {
    throw new Error(
      "getContext() called outside request scope — use runWithContext() or runWithJobContext()",
    );
  }
  return ctx;
}

// ─── Runners ─────────────────────────────────────────────────────────────────

/**
 * Runs `fn` within the given request context.
 *
 * Pass directly as the Express `next` callback to capture the full async chain:
 *   runWithContext({ requestId }, next);
 *
 * All downstream middleware and route handlers in the same async continuation
 * will see this context via getContext() / tryGetContext().
 */
export function runWithContext<T>(
  ctx: RequestContext,
  fn: (...args: unknown[]) => T,
): T {
  return _store.run(ctx, fn);
}

/**
 * Runs an async handler within a synthesized context built from job payload fields.
 * Generates a fresh `requestId` when the payload does not carry one.
 *
 * Call this at the top of every BullMQ job processor so that domain helpers
 * which use getContext() do not throw "outside request scope" errors.
 */
export async function runWithJobContext<T>(
  payloadCtx: Partial<RequestContext>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const ctx: RequestContext = {
    requestId: payloadCtx.requestId ?? crypto.randomUUID(),
    realm: payloadCtx.realm,
    userId: payloadCtx.userId,
    tenantId: payloadCtx.tenantId,
  };
  return _store.run(ctx, () => Promise.resolve(fn()));
}
