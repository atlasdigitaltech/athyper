import {
  KyselyTransactionRunner,
  checkPostgresPoolHealth,
  createPostgresDialect,
  createPostgresPool,
  getPostgresPoolStats,
  type DatabaseHealth,
  type PostgresPool,
  type PostgresPoolConfig,
  type PostgresPoolObserver,
  type PostgresPoolStats,
} from "@athyper/server-adapter-db-core";
import type { TransactionRunner } from "@athyper/server-foundation/transaction";
import type { TransactionActor } from "@athyper/server-foundation/transaction";
import { isTenantId } from "@athyper/server-foundation/tenancy";
import { Kysely, type Transaction } from "kysely";

import type { DB } from "./generated/kysely-mesh/types.js";
export type MeshDatabase = DB;

declare const systemTransactionBrand: unique symbol;
declare const tenantTransactionBrand: unique symbol;

export type MeshSystemTransaction<Database> = Transaction<Database> & {
  readonly [systemTransactionBrand]: "mesh-system";
};
export type MeshTenantTransaction<Database> = Transaction<Database> & {
  readonly [tenantTransactionBrand]: "mesh-tenant";
};
export type MeshActorProvider = () => TransactionActor | null | undefined;

export interface MeshDatabaseAdapterConfig extends PostgresPoolConfig {
  readonly observer?: PostgresPoolObserver;
  readonly actorProvider?: MeshActorProvider;
}

export interface MeshDatabaseAdapter<Database = MeshDatabase> {
  /** Mesh query builder; network/account scoping belongs to Mesh capabilities. */
  readonly database: Kysely<Database>;
  withTenantTransaction<Result>(
    work: (transaction: MeshTenantTransaction<Database>, signal?: AbortSignal) => Promise<Result>,
    signal?: AbortSignal,
  ): Promise<Result>;
  withSystemTransaction<Result>(
    work: (transaction: MeshSystemTransaction<Database>, signal?: AbortSignal) => Promise<Result>,
    signal?: AbortSignal,
  ): Promise<Result>;
  health(): Promise<DatabaseHealth>;
  poolStats(): PostgresPoolStats;
  close(): Promise<void>;
}

export function createMeshDatabaseAdapter<Database = MeshDatabase>(
  config: MeshDatabaseAdapterConfig,
): MeshDatabaseAdapter<Database> {
  const poolMax = config.max ?? 10;
  const pool = createPostgresPool({ ...config, max: poolMax }, config.observer);
  const database = new Kysely<Database>({ dialect: createPostgresDialect(pool) });

  return createMeshAdapterRuntime({
    database,
    pool,
    poolMax,
    runner: new KyselyTransactionRunner(database),
    actorProvider: config.actorProvider,
  });
}

interface MeshAdapterRuntimeDependencies<Database> {
  readonly database: Kysely<Database>;
  readonly pool: PostgresPool;
  readonly poolMax: number;
  readonly runner: TransactionRunner<Transaction<Database>>;
  readonly actorProvider?: MeshActorProvider;
}

export function createMeshAdapterRuntime<Database>(
  dependencies: MeshAdapterRuntimeDependencies<Database>,
): MeshDatabaseAdapter<Database> {
  let closePromise: Promise<void> | undefined;

  return {
    database: dependencies.database,
    withTenantTransaction: (work, signal) => {
      const runWork = (transaction: Transaction<Database>, propagatedSignal?: AbortSignal) => work(
        transaction as MeshTenantTransaction<Database>,
        propagatedSignal ?? signal,
      );
      const actor = requireActor(dependencies.actorProvider);
      return signal
        ? dependencies.runner.run(runWork, actor, signal)
        : dependencies.runner.run(runWork, actor);
    },
    withSystemTransaction: (work, signal) => {
      const runWork = (transaction: Transaction<Database>, propagatedSignal?: AbortSignal) => work(
        transaction as MeshSystemTransaction<Database>,
        propagatedSignal ?? signal,
      );
      return signal
        ? dependencies.runner.run(runWork, undefined, signal)
        : dependencies.runner.run(runWork);
    },
    health: () => checkPostgresPoolHealth(dependencies.pool),
    poolStats: () =>
      getPostgresPoolStats(dependencies.pool, dependencies.poolMax),
    close() {
      closePromise ??= dependencies.database.destroy();
      return closePromise;
    },
  };
}

function requireActor(provider: MeshActorProvider | undefined): TransactionActor {
  const actor = provider?.();
  if (!actor) throw new Error("Mesh tenant transaction requires an authenticated actor");
  if (!isTenantId(actor.tenantId)) throw new TypeError("Mesh tenant transaction requires a valid tenant ID");
  if (!actor.principalId.trim()) throw new TypeError("Mesh tenant transaction requires a principal ID");
  return actor;
}
