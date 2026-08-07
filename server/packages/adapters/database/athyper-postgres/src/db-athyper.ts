// server/packages/adapters/database/athyper-postgres/src/db-athyper.ts
//
// Athyper (admin/platform) database client — typed against the shared admin schema.
// Deliberately does NOT use TenantStampDriver: the admin plane reads cross-tenant
// data and operates under a different RLS posture than the Neon tenant plane.

import { Kysely } from "kysely";

import { createPostgresDialect } from "@athyper/adapter-db-core";
import { closePool, createPool, healthCheck, type PoolConfig } from "@athyper/adapter-db-core";
import { PerformanceDialect, type DatabasePerformanceObserver } from "@athyper/adapter-db-core";
import type { DbPoolStats } from "@athyper/adapter-db-core";
import type pg from "pg";

import type { DB as AthyperDB } from "./generated/kysely-admin/types.js";

export type { DbPoolStats as AthyperDbPoolStats };
export type { AthyperDB };

export type AthyperDbClientConfig = {
  /**
   * Connection string for Athyper/admin application queries.
   * Defaults to ATHYPER_DATABASE_URL when omitted.
   */
  connectionString?: string;

  /**
   * Maximum pool size.
   * @default 5
   */
  poolMax?: number;

  /** Optional logical-query, pool-wait, and transaction observer. */
  performanceObserver?: DatabasePerformanceObserver;
};

/**
 * Athyper platform / admin database client.
 *
 * Operates against the shared administrative schema (address, auth, control,
 * log, master, shared tables). Does not apply tenant-scoped RLS: the admin
 * plane reads across all tenants and must not be accidentally constrained by
 * a Neon-realm session GUC.
 */
export class AthyperDbClient {
  public readonly kysely: Kysely<AthyperDB>;
  private readonly pool: pg.Pool;
  private readonly poolMax: number;

  constructor(config: AthyperDbClientConfig = {}) {
    this.poolMax = config.poolMax ?? 5;

    const connectionString =
      config.connectionString ?? process.env.ATHYPER_DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        "AthyperDbClient requires connectionString or ATHYPER_DATABASE_URL",
      );
    }

    const poolConfig: PoolConfig = {
      connectionString,
      max: this.poolMax,
    };

    this.pool = createPool(poolConfig);

    const baseDialect = createPostgresDialect(this.pool);
    const dialect = config.performanceObserver
      ? new PerformanceDialect(baseDialect, config.performanceObserver)
      : baseDialect;

    this.kysely = new Kysely<AthyperDB>({ dialect });
  }

  async close(): Promise<void> {
    await this.kysely.destroy();
    await closePool(this.pool);
  }

  async health(): Promise<{ healthy: boolean; message?: string }> {
    return healthCheck(this.pool);
  }

  getPoolStats(): DbPoolStats {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      max: this.poolMax,
    };
  }

  getPool(): pg.Pool {
    return this.pool;
  }
}

export function createAthyperDbClient(
  config: AthyperDbClientConfig = {},
): AthyperDbClient {
  return new AthyperDbClient(config);
}
