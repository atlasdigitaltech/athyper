// server/packages/adapters/database/neon-postgres/src/tx.ts

import type { DB } from "./generated/kysely/types.js";
import type { Kysely, Transaction } from "kysely";

declare const tenantTransactionBrand: unique symbol;
declare const systemTransactionBrand: unique symbol;

export type TenantTransaction = Transaction<DB> & {
  readonly [tenantTransactionBrand]: "tenant";
};

export type SystemTransaction = Transaction<DB> & {
  readonly [systemTransactionBrand]: "system";
};

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

// WeakMap keyed on the Kysely instance so each DB adapter instance owns its
// own tenant provider. A module-level singleton would be overwritten by the
// last adapter created (wrong with three simultaneous DB clients: Neon,
// Athyper, Mesh) and would leak cross-adapter state in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _tenantProviders = new WeakMap<Kysely<any>, TenantIdProvider>();

export function setTenantIdProvider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  provider: TenantIdProvider | null,
): void {
  if (provider) {
    _tenantProviders.set(db, provider);
  } else {
    _tenantProviders.delete(db);
  }
}

/**
 * Execute tenant-agnostic system/admin work within a database transaction.
 *
 * When the client has a tenant-id provider registered, the TenantStampDriver
 * automatically stamps `app.current_tenant_id` at BEGIN, so transactions
 * opened while a tenant context exists carry the tenant GUC for the whole
 * scope. This helper deliberately does not require a tenant context. Use it
 * only for migrations, seed, health/bootstrap, and cross-tenant admin tools.
 * Use `withTenantTx` when tenant-scoped atomic work is required.
 */
export async function withSystemTx<T>(
  db: Kysely<DB>,
  fn: (trx: SystemTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction().execute((trx) => fn(trx as SystemTransaction));
}

/**
 * Execute tenant-agnostic system/admin work within a database transaction with
 * an explicit isolation level.
 */
export async function withSystemTxIsolation<T>(
  db: Kysely<DB>,
  isolationLevel:
    | "read uncommitted"
    | "read committed"
    | "repeatable read"
    | "serializable",
  fn: (trx: SystemTransaction) => Promise<T>,
): Promise<T> {
  return db
    .transaction()
    .setIsolationLevel(isolationLevel)
    .execute((trx) => fn(trx as SystemTransaction));
}

/**
 * @deprecated Use `withSystemTx` for tenant-agnostic work or `withTenantTx`
 * for tenant-scoped work. This alias remains for compatibility.
 */
export async function withTx<T>(
  db: Kysely<DB>,
  fn: (trx: SystemTransaction) => Promise<T>,
): Promise<T> {
  return withSystemTx(db, fn);
}

/**
 * @deprecated Use `withSystemTxIsolation` for tenant-agnostic work or
 * `withTenantTxIsolation` for tenant-scoped work.
 */
export async function withTxIsolation<T>(
  db: Kysely<DB>,
  isolationLevel:
    | "read uncommitted"
    | "read committed"
    | "repeatable read"
    | "serializable",
  fn: (trx: SystemTransaction) => Promise<T>,
): Promise<T> {
  return withSystemTxIsolation(db, isolationLevel, fn);
}

/**
 * Execute tenant-scoped atomic work. Asserts a tenant id is present in the
 * request context; the TenantStampDriver wired into the client stamps
 * `app.current_tenant_id` at BEGIN. The assertion is what makes the helper
 * distinct from `withSystemTx` — system transactions may run without a stamp
 * when no tenant is in context, while `withTenantTx` refuses to proceed.
 */
export async function withTenantTx<T>(
  db: Kysely<DB>,
  fn: (trx: TenantTransaction) => Promise<T>,
): Promise<T> {
  assertTenantInContext(db);
  return db.transaction().execute((trx) => fn(trx as TenantTransaction));
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
  fn: (trx: TenantTransaction) => Promise<T>,
): Promise<T> {
  assertTenantInContext(db);
  return db
    .transaction()
    .setIsolationLevel(isolationLevel)
    .execute((trx) => fn(trx as TenantTransaction));
}

function assertTenantInContext(db: Kysely<DB>): void {
  const provider = _tenantProviders.get(db);
  if (!provider) {
    throw new Error(
      "withTenantTx: no tenant id provider registered for this db instance — pass tenantIdProvider when creating the adapter",
    );
  }
  const tenantId = provider();
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
