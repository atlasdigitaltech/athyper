// server/packages/adapters/db/src/kysely/db-mesh.ts
import { Kysely } from "kysely";

import { createPostgresDialect } from "./dialect.js";
import { closePool, createPool, healthCheck, type PoolConfig } from "./pool.js";
import type { DbPoolStats } from "./db.js";

import type { DB as MeshDB } from "../generated/kysely-mesh/types.js";
import type pg from "pg";

export type { DbPoolStats as MeshDbPoolStats };

export type MeshDbClientConfig = {
  /**
   * Connection string for Mesh application queries. Defaults to
   * MESH_DATABASE_URL and should point at the athyper_mesh app pool.
   */
  connectionString?: string;

  /**
   * Maximum pool size.
   * @default 10
   */
  poolMax?: number;
};

/**
 * Mesh database client.
 *
 * This deliberately does not use TenantStampDriver: Mesh is scoped by network
 * account codes and its own policies/helpers, not Neon tenant UUID RLS.
 */
export class MeshDbClient {
  public readonly kysely: Kysely<MeshDB>;
  private readonly pool: pg.Pool;
  private readonly poolMax: number;

  constructor(config: MeshDbClientConfig = {}) {
    this.poolMax = config.poolMax ?? 10;

    const connectionString =
      config.connectionString ?? process.env.MESH_DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        "MeshDbClient requires connectionString or MESH_DATABASE_URL",
      );
    }

    const poolConfig: PoolConfig = {
      connectionString,
      max: this.poolMax,
    };

    this.pool = createPool(poolConfig);
    this.kysely = new Kysely<MeshDB>({
      dialect: createPostgresDialect(this.pool),
    });
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

export function createMeshDbClient(
  config: MeshDbClientConfig = {},
): MeshDbClient {
  return new MeshDbClient(config);
}
