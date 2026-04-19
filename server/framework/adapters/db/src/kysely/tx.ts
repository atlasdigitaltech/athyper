// server/framework/adapters/db/src/kysely/tx.ts

import type { DB } from "../generated/kysely/types.js";
import type { Kysely, Transaction } from "kysely";

/**
 * Provider that resolves the tenant id for the currently-executing request.
 *
 * In the runtime this is bound to `tryGetContext()?.tenantId` — a read from
 * the AsyncLocalStorage context populated by the auth middleware. The value
 * is derived from the authenticated session, never from business-code
 * arguments, so a bug in a service cannot stamp the wrong tenant.
 *
 * Returns:
 *   - string: the tenant UUID
 *   - null / undefined: no tenant in context — TenantStampDriver will no-op
 *     (preserving bootstrap, health probes, migrations); `withTenantTx`
 *     throws because tenant-scoped atomic work requires a tenant.
 */
export type TenantIdProvider = () => string | null | undefined;

// Kept as a module-level slot so `withTenantTx` can assert a tenant is present
// without reaching into the dialect. `createDbAdapter` registers the provider
// at construction; the TenantStampDriver reads the same provider through its
// config, so the two paths share a single source of truth.
let _tenantIdProvider: TenantIdProvider | null = null;

export function setTenantIdProvider(provider: TenantIdProvider | null): void {
  _tenantIdProvider = provider;
}

/**
 * Execute a function within a database transaction.
 *
 * When the client has a tenant-id provider registered, the TenantStampDriver
 * automatically stamps `app.current_tenant_id` at BEGIN, so transactions
 * opened through this helper carry the tenant GUC for the whole scope. Use
 * `withTx` when you want a transaction regardless of tenant context
 * (migrations, seed, admin tools). Use `withTenantTx` when tenant-scoped
 * atomic work is required and the absence of a tenant context should fail
 * loud rather than silently execute under admin privileges.
 */
export async function withTx<T>(
  db: Kysely<DB>,
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(fn);
}

/**
 * Execute a function within a database transaction with isolation level.
 */
export async function withTxIsolation<T>(
  db: Kysely<DB>,
  isolationLevel:
    | "read uncommitted"
    | "read committed"
    | "repeatable read"
    | "serializable",
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  return db.transaction().setIsolationLevel(isolationLevel).execute(fn);
}

/**
 * Execute tenant-scoped atomic work. Asserts a tenant id is present in the
 * request context; the TenantStampDriver wired into the client stamps
 * `app.current_tenant_id` at BEGIN. The assertion is what makes the helper
 * distinct from `withTx` — `withTx` silently runs without a stamp if no
 * tenant is in context, `withTenantTx` refuses to proceed.
 */
export async function withTenantTx<T>(
  db: Kysely<DB>,
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  assertTenantInContext();
  return db.transaction().execute(fn);
}

/**
 * Variant of `withTenantTx` with an explicit isolation level.
 */
export async function withTenantTxIsolation<T>(
  db: Kysely<DB>,
  isolationLevel:
    | "read uncommitted"
    | "read committed"
    | "repeatable read"
    | "serializable",
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  assertTenantInContext();
  return db.transaction().setIsolationLevel(isolationLevel).execute(fn);
}

function assertTenantInContext(): void {
  if (_tenantIdProvider === null) {
    throw new Error(
      "withTenantTx: no tenant id provider registered — call setTenantIdProvider during bootstrap (createDbAdapter does this automatically when tenantIdProvider is passed)",
    );
  }
  const tenantId = _tenantIdProvider();
  if (!tenantId) {
    throw new Error(
      "withTenantTx: no tenant id in request context — tenant-scoped atomic work must run inside an authenticated request or a runWithJobContext with tenantId",
    );
  }
  if (!UUID_RE.test(tenantId)) {
    throw new Error(
      `withTenantTx: tenant id "${tenantId}" is not a valid UUID`,
    );
  }
}

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
