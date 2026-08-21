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
import type { TransactionActor, TransactionRunner } from "@athyper/server-foundation/transaction";
import { isTenantId } from "@athyper/server-foundation/tenancy";
import { Kysely, type Transaction } from "kysely";

import type { DB } from "./generated/kysely-studio/types.js";
export type AthyperDatabase = DB;

declare const systemTransactionBrand: unique symbol;
declare const tenantTransactionBrand: unique symbol;

export type AthyperSystemTransaction<Database> = Transaction<Database> & {
  readonly [systemTransactionBrand]: "athyper-system";
};
export type AthyperTenantTransaction<Database> = Transaction<Database> & { readonly [tenantTransactionBrand]: "athyper-tenant" };
export type AthyperActorProvider = () => TransactionActor | null | undefined;

export interface AthyperDatabaseAdapterConfig extends PostgresPoolConfig {
  readonly observer?: PostgresPoolObserver;
  readonly actorProvider?: AthyperActorProvider;
}

export interface AthyperDatabaseAdapter<Database = AthyperDatabase> {
  /** Administrative query builder; this plane intentionally spans tenants. */
  readonly database: Kysely<Database>;
  withTenantTransaction<Result>(
    work: (transaction: AthyperTenantTransaction<Database>, signal?: AbortSignal) => Promise<Result>,
    signal?: AbortSignal,
  ): Promise<Result>;
  withSystemTransaction<Result>(
    work: (transaction: AthyperSystemTransaction<Database>, signal?: AbortSignal) => Promise<Result>,
    signal?: AbortSignal,
  ): Promise<Result>;
  health(): Promise<DatabaseHealth>;
  poolStats(): PostgresPoolStats;
  close(): Promise<void>;
}

export function createAthyperDatabaseAdapter<Database = AthyperDatabase>(
  config: AthyperDatabaseAdapterConfig,
): AthyperDatabaseAdapter<Database> {
  const poolMax = config.max ?? 5;
  const pool = createPostgresPool({ ...config, max: poolMax }, config.observer);
  const database = new Kysely<Database>({ dialect: createPostgresDialect(pool) });

  return createAthyperAdapterRuntime({
    database,
    pool,
    poolMax,
    runner: new KyselyTransactionRunner(database),
    actorProvider: config.actorProvider,
  });
}

interface AthyperAdapterRuntimeDependencies<Database> {
  readonly database: Kysely<Database>;
  readonly pool: PostgresPool;
  readonly poolMax: number;
  readonly runner: TransactionRunner<Transaction<Database>>;
  readonly actorProvider?: AthyperActorProvider;
}

export function createAthyperAdapterRuntime<Database>(
  dependencies: AthyperAdapterRuntimeDependencies<Database>,
): AthyperDatabaseAdapter<Database> {
  let closePromise: Promise<void> | undefined;

  return {
    database: dependencies.database,
    withTenantTransaction: (work, signal) => {
      const runWork = (transaction: Transaction<Database>, propagatedSignal?: AbortSignal) => work(
        transaction as AthyperTenantTransaction<Database>,
        propagatedSignal ?? signal,
      );
      const actor = requireActor(dependencies.actorProvider);
      return signal
        ? dependencies.runner.run(runWork, actor, signal)
        : dependencies.runner.run(runWork, actor);
    },
    withSystemTransaction: (work, signal) => {
      const runWork = (transaction: Transaction<Database>, propagatedSignal?: AbortSignal) => work(
        transaction as AthyperSystemTransaction<Database>,
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

function requireActor(provider: AthyperActorProvider | undefined): TransactionActor {
  const actor = provider?.();
  if (!actor) throw new Error("Athyper tenant transaction requires an authenticated actor");
  if (!isTenantId(actor.tenantId)) throw new TypeError("Athyper tenant transaction requires a valid tenant ID");
  if (!actor.principalId.trim()) throw new TypeError("Athyper tenant transaction requires a principal ID");
  return actor;
}
