// framework/adapters/db/src/kysely/db.ts
import { Kysely } from "kysely";

import { createPostgresDialect } from "./dialect.js";
import { closePool, createPool, healthCheck, type PoolConfig } from "./pool.js";

import type { DB } from "../generated/kysely/types.js";
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
   * Statement timeout in milliseconds
   * @default 30000
   */
  statementTimeout?: number;
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
      statement_timeout: config.statementTimeout ?? 30000,
    };

    this.pool = createPool(poolConfig);

    // Create Kysely instance
    const dialect = createPostgresDialect(this.pool);
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
