// framework/adapters/db/src/adapter.ts

import {
  DbClient,
  type DbClientConfig,
  type DbPoolStats,
} from "./kysely/db.js";
import { withTx, withTxIsolation } from "./kysely/tx.js";

import type { DB } from "./generated/kysely/types.js";
import type { Kysely } from "kysely";

export type { DbPoolStats } from "./kysely/db.js";

/**
 * Database adapter interface for the runtime.
 *
 * Provides access to:
 * - Kysely query builder (primary interface)
 * - Transaction helpers
 * - Connection management
 * - Health checks
 */
export interface DbAdapter {
  /**
   * Kysely instance for type-safe queries
   */
  readonly kysely: Kysely<DB>;

  /**
   * Execute function within a transaction
   */
  withTx: typeof withTx;

  /**
   * Execute function within a transaction with isolation level
   */
  withTxIsolation: typeof withTxIsolation;

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
}

/**
 * Creates a database adapter instance.
 *
 * This is the primary way to create a database connection for the runtime.
 *
 * Example:
 * ```typescript
 * const dbAdapter = createDbAdapter({
 *   connectionString: config.db.url,
 *   poolMax: config.db.poolMax,
 * });
 *
 * // Use Kysely for queries
 * const tenants = await dbAdapter.kysely
 *   .selectFrom('tenant')
 *   .selectAll()
 *   .execute();
 *
 * // Use transactions
 * await dbAdapter.withTx(dbAdapter.kysely, async (trx) => {
 *   await trx.insertInto('tenant').values({ ... }).execute();
 * });
 * ```
 */
export function createDbAdapter(config: DbClientConfig): DbAdapter {
  const client = new DbClient(config);

  return {
    kysely: client.kysely,
    withTx,
    withTxIsolation,
    close: () => client.close(),
    health: () => client.health(),
    getPoolStats: () => client.getPoolStats(),
  };
}
