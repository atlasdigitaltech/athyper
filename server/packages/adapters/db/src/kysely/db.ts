// server/packages/adapters/db/src/kysely/db.ts
import { Kysely } from "kysely";

import { createPostgresDialect } from "./dialect.js";
import { closePool, createPool, healthCheck, type PoolConfig } from "./pool.js";
import { TenantStampDialect } from "./tenant-stamp-driver.js";

import type { DB } from "../generated/kysely/types.js";
import type { TenantIdProvider } from "./tx.js";
import type pg from "pg";

export type DbClientConfig = {
  /**
   * Connection string for application queries (should point to PgBouncer)
   */
  connectionString: string;

  /**
   * Maximum pool size
   * @default 10
   */
  poolMax?: number;

  /**
   * Optional tenant-id provider. When set, queries on this client are routed
   * through the TenantStampDriver, which wraps tenant-scoped queries in an
   * implicit `BEGIN; SET LOCAL app.current_tenant_id = $1; <query>; COMMIT`.
   * Leave unset for tools that connect as a migration/admin role where RLS
   * bypass is desired (seed scripts, CLI utilities).
   *
   * The runtime bootstrap passes `() => tryGetContext()?.tenantId` so the
   * stamp is derived from the authenticated session, not service arguments.
   */
  tenantIdProvider?: TenantIdProvider;
};

export interface DbPoolStats {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  max: number;
}

/**
 * Database client wrapper with Kysely instance and management methods.
 */
export class DbClient {
  public readonly kysely: Kysely<DB>;
  private readonly pool: pg.Pool;
  private readonly poolMax: number;

  constructor(config: DbClientConfig) {
    this.poolMax = config.poolMax ?? 10;

    // Create pool
    const poolConfig: PoolConfig = {
      connectionString: config.connectionString,
      max: this.poolMax,
    };

    this.pool = createPool(poolConfig);

    // Create Kysely instance. When a tenantIdProvider is supplied, wrap the
    // base Postgres dialect with the TenantStampDialect so every query runs
    // with `app.current_tenant_id` stamped on its session GUC (required for
    // RLS policies that read `shared.current_tenant_id_soft()`).
    const baseDialect = createPostgresDialect(this.pool);
    const dialect =
      config.tenantIdProvider !== undefined
        ? new TenantStampDialect({
            base: baseDialect,
            tenantIdProvider: config.tenantIdProvider,
          })
        : baseDialect;
    this.kysely = new Kysely<DB>({
      dialect,
    });
  }

  /**
   * Gracefully close the database connection pool.
   */
  async close(): Promise<void> {
    await this.kysely.destroy();
    await closePool(this.pool);
  }

  /**
   * Health check: verify database connectivity.
   */
  async health(): Promise<{ healthy: boolean; message?: string }> {
    return healthCheck(this.pool);
  }

  /**
   * Get pool statistics for health monitoring.
   */
  getPoolStats(): DbPoolStats {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      max: this.poolMax,
    };
  }

  /**
   * Get the underlying pg.Pool (for advanced use cases).
   */
  getPool(): pg.Pool {
    return this.pool;
  }
}

/**
 * Creates a new database client instance.
 */
export function createDbClient(config: DbClientConfig): DbClient {
  return new DbClient(config);
}
