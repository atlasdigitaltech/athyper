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
import { isTenantId } from "@athyper/server-foundation/tenancy";
import type {
  TransactionActor,
  TransactionRunner,
} from "@athyper/server-foundation/transaction";
import { Kysely, type Transaction } from "kysely";

import type { DB } from "./generated/kysely/types.js";
export type NeonDatabase = DB;
export type NeonActorProvider = () => TransactionActor | null | undefined;

declare const tenantTransactionBrand: unique symbol;
declare const systemTransactionBrand: unique symbol;

export type NeonTenantTransaction<Database> = Transaction<Database> & {
  readonly [tenantTransactionBrand]: "neon-tenant";
};

export type NeonSystemTransaction<Database> = Transaction<Database> & {
  readonly [systemTransactionBrand]: "neon-system";
};

export interface NeonDatabaseAdapterConfig extends PostgresPoolConfig {
  readonly actorProvider?: NeonActorProvider;
  readonly observer?: PostgresPoolObserver;
}

export interface NeonDatabaseAdapter<Database = NeonDatabase> {
  /** System-level query builder. Tenant mutations must use withTenantTransaction. */
  readonly database: Kysely<Database>;
  withTenantTransaction<Result>(
    work: (transaction: NeonTenantTransaction<Database>, signal?: AbortSignal) => Promise<Result>,
    signal?: AbortSignal,
  ): Promise<Result>;
  withSystemTransaction<Result>(
    work: (transaction: NeonSystemTransaction<Database>, signal?: AbortSignal) => Promise<Result>,
    signal?: AbortSignal,
  ): Promise<Result>;
  health(): Promise<DatabaseHealth>;
  poolStats(): PostgresPoolStats;
  close(): Promise<void>;
}

export function createNeonDatabaseAdapter<Database = NeonDatabase>(
  config: NeonDatabaseAdapterConfig,
): NeonDatabaseAdapter<Database> {
  const pool = createPostgresPool(config, config.observer);
  const database = new Kysely<Database>({ dialect: createPostgresDialect(pool) });
  const runner = new KyselyTransactionRunner(database);

  return createNeonAdapterRuntime({
    database,
    pool,
    poolMax: config.max ?? 10,
    runner,
    actorProvider: config.actorProvider,
  });
}

interface NeonAdapterRuntimeDependencies<Database> {
  readonly database: Kysely<Database>;
  readonly pool: PostgresPool;
  readonly poolMax: number;
  readonly runner: TransactionRunner<Transaction<Database>>;
  readonly actorProvider?: NeonActorProvider;
}

export function createNeonAdapterRuntime<Database>(
  dependencies: NeonAdapterRuntimeDependencies<Database>,
): NeonDatabaseAdapter<Database> {
  let closePromise: Promise<void> | undefined;

  return {
    database: dependencies.database,

    async withTenantTransaction(work, signal) {
      const actor = requireActor(dependencies.actorProvider);
      const runWork = (transaction: Transaction<Database>, propagatedSignal?: AbortSignal) => work(
        transaction as NeonTenantTransaction<Database>,
        propagatedSignal ?? signal,
      );
      return signal
        ? dependencies.runner.run(runWork, actor, signal)
        : dependencies.runner.run(runWork, actor);
    },

    async withSystemTransaction(work, signal) {
      const runWork = (transaction: Transaction<Database>, propagatedSignal?: AbortSignal) => work(
        transaction as NeonSystemTransaction<Database>,
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

function requireActor(provider: NeonActorProvider | undefined): TransactionActor {
  if (!provider) {
    throw new Error(
      "Neon tenant transaction requires an actor provider configured by the host",
    );
  }

  const actor = provider();
  if (!actor) {
    throw new Error("Neon tenant transaction requires an authenticated actor");
  }
  if (!isTenantId(actor.tenantId)) {
    throw new TypeError("Neon tenant transaction requires a valid tenant ID");
  }
  if (!actor.principalId.trim()) {
    throw new TypeError("Neon tenant transaction requires a principal ID");
  }
  return actor;
}
