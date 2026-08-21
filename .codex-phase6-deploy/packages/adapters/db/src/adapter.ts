// server/packages/adapters/db/src/adapter.ts

import {
  DbClient,
  type DbClientConfig,
  type DbPoolStats,
} from "./kysely/db.js";
import type pg from "pg";
import {
  setTenantIdProvider,
  withTenantTx,
  withTenantTxIsolation,
  withSystemTx,
  withSystemTxIsolation,
  withTx,
  withTxIsolation,
  type TenantIdProvider,
} from "./kysely/tx.js";

import type { DB } from "./generated/kysely/types.js";
import type { Kysely } from "kysely";

export type { DbPoolStats } from "./kysely/db.js";
export type {
  SystemTransaction,
  TenantIdProvider,
  TenantTransaction,
} from "./kysely/tx.js";

/**
 * Database adapter config.
 *
 * `tenantIdProvider` is required for tenant-scoped queries to work correctly
 * under a non-superuser DB role: the TenantStampDriver reads it on every
 * `executeQuery` to stamp `app.current_tenant_id`. The runtime bootstrap
 * passes `() => tryGetContext()?.tenantId`. Adapter-db stays decoupled from
 * the kernel; the kernel supplies the reader.
 *
 * Alias of DbClientConfig retained for callers that imported DbAdapterConfig.
 */
export type DbAdapterConfig = DbClientConfig;

/**
 * Database adapter interface for the runtime.
 *
 * Provides access to:
 * - Kysely query builder (primary interface)
 * - Transaction helpers (tenant-aware and tenant-agnostic)
 * - Connection management
 * - Health checks
 */
export interface DbAdapter {
  /**
   * Kysely instance for type-safe queries
   */
  readonly kysely: Kysely<DB>;

  /**
   * Execute function within a transaction without requiring tenant context.
   * Use for tenant-agnostic work (auth bootstrap, cross-tenant admin ops).
   */
  withSystemTx: typeof withSystemTx;

  /**
   * Execute function within a transaction with isolation level and without
   * requiring tenant context.
   */
  withSystemTxIsolation: typeof withSystemTxIsolation;

  /**
   * @deprecated Use `withSystemTx` for tenant-agnostic work or `withTenantTx`
   * for tenant-scoped work.
   */
  withTx: typeof withTx;

  /**
   * @deprecated Use `withSystemTxIsolation` for tenant-agnostic work or
   * `withTenantTxIsolation` for tenant-scoped work.
   */
  withTxIsolation: typeof withTxIsolation;

  /**
   * Execute function within a transaction that has `app.current_tenant_id`
   * stamped from the registered tenant-id provider. REQUIRED for any query
   * that touches a tenant-scoped table — without the GUC, RLS policies
   * reading `shared.current_tenant_id_soft()` return zero rows.
   */
  withTenantTx: typeof withTenantTx;

  /**
   * Variant of `withTenantTx` with an explicit isolation level.
   */
  withTenantTxIsolation: typeof withTenantTxIsolation;

  /**
   * Close database connections
   */
  close(): Promise<void>;

  /**
   * Health check
   */
  health(): Promise<{ healthy: boolean; message?: string }>;

  /**
   * Pool statistics for health monitoring
   */
  getPoolStats(): DbPoolStats;

  /**
   * Underlying pg.Pool. Used by descriptor-cache LISTEN/NOTIFY consumers
   * that need session-mode connections (PgBouncer transaction-mode pools
   * disallow LISTEN). Avoid for query work — use kysely + withTenantTx.
   */
  getPool(): pg.Pool;
}

/**
 * Creates a database adapter instance.
 *
 * Example:
 * ```typescript
 * const dbAdapter = createDbAdapter({
 *   connectionString: config.db.url,
 *   poolMax: config.db.poolMax,
 *   tenantIdProvider: () => tryGetContext()?.tenantId,
 * });
 *
 * await dbAdapter.withTenantTx(dbAdapter.kysely, async (trx) => {
 *   return trx.selectFrom("ledger.journal").selectAll().execute();
 * });
 * ```
 */
export function createDbAdapter(config: DbAdapterConfig): DbAdapter {
  const client = new DbClient(config);

  if (config.tenantIdProvider !== undefined) {
    setTenantIdProvider(config.tenantIdProvider);
  }

  return {
    kysely: client.kysely,
    withSystemTx,
    withSystemTxIsolation,
    withTx,
    withTxIsolation,
    withTenantTx,
    withTenantTxIsolation,
    close: () => client.close(),
    health: () => client.health(),
    getPoolStats: () => client.getPoolStats(),
    getPool: () => client.getPool(),
  };
}
