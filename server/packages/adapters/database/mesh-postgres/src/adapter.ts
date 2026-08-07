import { MeshDbClient, type MeshDbClientConfig } from "./db-mesh.js";
import type { DB as MeshDB } from "./generated/kysely-mesh/types.js";
import type { Kysely } from "kysely";
import type pg from "pg";
import type { DbPoolStats } from "@athyper/adapter-db-core";

export type MeshDatabase = MeshDB;

export interface MeshDbAdapter {
  readonly kysely: Kysely<MeshDatabase>;
  close(): Promise<void>;
  health(): Promise<{ healthy: boolean; message?: string }>;
  getPoolStats(): DbPoolStats;
  getPool(): pg.Pool;
}

export function createMeshDbAdapter(config: MeshDbClientConfig): MeshDbAdapter {
  const client = new MeshDbClient(config);
  return {
    kysely: client.kysely,
    close: () => client.close(),
    health: () => client.health(),
    getPoolStats: () => client.getPoolStats(),
    getPool: () => client.getPool(),
  };
}
