import { AthyperDbClient, type AthyperDbClientConfig, type AthyperDB } from "./db-athyper.js";
import type { Kysely } from "kysely";
import type pg from "pg";
import type { DbPoolStats } from "@athyper/adapter-db-core";

export type { AthyperDB };
export type AthyperDatabase = AthyperDB;

export interface AthyperDbAdapter {
  readonly kysely: Kysely<AthyperDatabase>;
  close(): Promise<void>;
  health(): Promise<{ healthy: boolean; message?: string }>;
  getPoolStats(): DbPoolStats;
  getPool(): pg.Pool;
}

export function createAthyperDbAdapter(config: AthyperDbClientConfig): AthyperDbAdapter {
  const client = new AthyperDbClient(config);
  return {
    kysely: client.kysely,
    close: () => client.close(),
    health: () => client.health(),
    getPoolStats: () => client.getPoolStats(),
    getPool: () => client.getPool(),
  };
}
