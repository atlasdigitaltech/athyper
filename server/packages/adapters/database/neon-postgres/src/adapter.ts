import { DbClient, type DbClientConfig } from "./db.js";
import { setTenantIdProvider, withTenantTx, withTenantTxIsolation, withSystemTx, withSystemTxIsolation, withTx, withTxIsolation, type TenantIdProvider } from "./tx.js";
import type { DB as NeonDB } from "./generated/kysely/types.js";
import type { Kysely } from "kysely";
import type pg from "pg";

export type { DbPoolStats } from "@athyper/adapter-db-core";
export type { SystemTransaction, TenantIdProvider, TenantTransaction } from "./tx.js";

export type NeonDatabase = NeonDB;
export type DbAdapterConfig = DbClientConfig;

export interface NeonDbAdapter {
  readonly kysely: Kysely<NeonDatabase>;
  withSystemTx: typeof withSystemTx;
  withSystemTxIsolation: typeof withSystemTxIsolation;
  withTx: typeof withTx;
  withTxIsolation: typeof withTxIsolation;
  withTenantTx: typeof withTenantTx;
  withTenantTxIsolation: typeof withTenantTxIsolation;
  close(): Promise<void>;
  health(): Promise<{ healthy: boolean; message?: string }>;
  getPoolStats(): import("@athyper/adapter-db-core").DbPoolStats;
  getPool(): pg.Pool;
}

export type DbAdapter = NeonDbAdapter;

export function createNeonDbAdapter(config: DbAdapterConfig): NeonDbAdapter {
  const client = new DbClient(config);
  if (config.tenantIdProvider !== undefined) {
    setTenantIdProvider(client.kysely, config.tenantIdProvider);
  }
  return {
    kysely: client.kysely as Kysely<NeonDatabase>,
    withSystemTx, withSystemTxIsolation, withTx, withTxIsolation, withTenantTx, withTenantTxIsolation,
    close: () => client.close(),
    health: () => client.health(),
    getPoolStats: () => client.getPoolStats(),
    getPool: () => client.getPool(),
  };
}

/** @deprecated Use createNeonDbAdapter */
export function createDbAdapter(config: DbAdapterConfig): NeonDbAdapter {
  return createNeonDbAdapter(config);
}
