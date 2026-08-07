// server/packages/adapters/database/neon-postgres/src/tenant-stamp-driver.ts
//
// Wraps a base Kysely Dialect/Driver so every query executes with
// `app.current_tenant_id` stamped on its session GUC. Without this, RLS
// policies reading `shared.current_tenant_id_soft()` return NULL and every
// tenant-scoped query is filtered to zero rows — the reason P1a alone did
// not close the tenant-isolation gap.
//
// The Kysely plugin API (transformQuery/transformResult) is AST-only and
// cannot open transactions, so we hook at the Driver layer: every
// `DatabaseConnection` handed out by the base driver is wrapped so that
// `executeQuery` runs inside an implicit transaction that prefixes the stamp.
//
// Behavior matrix:
//   - ALS tenant present, connection NOT in an explicit tx:
//       BEGIN; SET LOCAL …; <query>; COMMIT  (4 round-trips on PgBouncer tx pool,
//       correct-by-construction — the bench script measures actual overhead).
//   - ALS tenant present, connection IS in an explicit tx:
//       stamp was already issued in beginTransaction() — delegate directly.
//   - ALS tenant absent (bootstrap, health probes, migrations, shared-schema reads):
//       delegate directly. No-op preserves every existing call site that doesn't
//       run under a request context.
//
// PgBouncer transaction-pool safety: `SET LOCAL` resets at COMMIT/ROLLBACK, and
// the entire BEGIN…COMMIT block executes on a single server connection in
// transaction-pool mode, so no leak across clients.

import type {
  DatabaseConnection,
  Driver,
  QueryResult,
  TransactionSettings,
} from "kysely";
import type { CompiledQuery } from "kysely";
import type { Dialect } from "kysely";
import type { Kysely } from "kysely";
import type { DialectAdapter } from "kysely";
import type { DatabaseIntrospector } from "kysely";
import type { QueryCompiler } from "kysely";

import type { TenantIdProvider } from "./tx.js";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const SET_TENANT_SQL =
  "SELECT set_config('app.current_tenant_id', $1, true)";
const BEGIN_SQL = "BEGIN";
const COMMIT_SQL = "COMMIT";
const ROLLBACK_SQL = "ROLLBACK";

type CompiledQueryShape = Pick<CompiledQuery, "sql" | "parameters" | "query" | "queryId">;

// We can't call `CompiledQuery.raw()` from here without importing kysely at
// runtime (which breaks the adapter-db tsup external boundary). Build the
// shape by hand using the same fields the driver actually reads.
function rawQuery(sql: string, parameters: ReadonlyArray<unknown>): CompiledQueryShape {
  return {
    sql,
    parameters,
    // queryId/query are tagged fields Kysely doesn't use inside a DatabaseConnection —
    // we only need sql + parameters for the PG driver.
    queryId: { queryId: "tenant-stamp" } as unknown as CompiledQuery["queryId"],
    query: { kind: "RawNode" } as unknown as CompiledQuery["query"],
  };
}

export interface TenantStampDialectOptions {
  readonly base: Dialect;
  readonly tenantIdProvider: TenantIdProvider;
  /**
   * Called when the driver would have stamped but the tenant id returned by
   * the provider is missing or malformed. Default: no-op. Tests pass a spy.
   */
  readonly onSkippedStamp?: (reason: "no-tenant" | "invalid-uuid", value: unknown) => void;
  /**
   * Called when the implicit transaction rollback fails after a query error.
   * The original query error is still rethrown, but this hook makes the
   * potentially dirty connection state visible to logs/metrics.
   */
  readonly onRollbackFailure?: (error: unknown, originalError: unknown) => void;
}

/**
 * Wraps a base Kysely Dialect with tenant-stamping behavior.
 *
 * The wrapped dialect forwards every method to the base except `createDriver`,
 * which returns a `TenantStampDriver`. The base dialect's query compiler,
 * adapter, and introspector are unchanged — this avoids touching SQL
 * generation or schema introspection.
 */
export class TenantStampDialect implements Dialect {
  readonly #opts: TenantStampDialectOptions;

  constructor(opts: TenantStampDialectOptions) {
    this.#opts = opts;
  }

  createDriver(): Driver {
    return new TenantStampDriver(this.#opts.base.createDriver(), this.#opts);
  }

  createQueryCompiler(): QueryCompiler {
    return this.#opts.base.createQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return this.#opts.base.createAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return this.#opts.base.createIntrospector(db as Kysely<Record<string, never>>);
  }
}

/**
 * Driver that intercepts connection acquisition so every `executeQuery` on
 * that connection is stamped. State per connection is tracked on a WeakMap
 * keyed by the wrapped object, not the raw base connection, so consumers
 * can only read state through the wrapped surface and can't accidentally
 * bypass the stamp by holding a reference to the inner connection.
 */
export class TenantStampDriver implements Driver {
  readonly #base: Driver;
  readonly #opts: TenantStampDialectOptions;
  readonly #wrapState = new WeakMap<DatabaseConnection, ConnectionState>();
  readonly #baseToWrapped = new WeakMap<DatabaseConnection, DatabaseConnection>();

  constructor(base: Driver, opts: TenantStampDialectOptions) {
    this.#base = base;
    this.#opts = opts;
  }

  async init(): Promise<void> {
    await this.#base.init();
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    const base = await this.#base.acquireConnection();
    const wrapped = this.#wrap(base);
    this.#baseToWrapped.set(base, wrapped);
    return wrapped;
  }

  async beginTransaction(
    connection: DatabaseConnection,
    settings: TransactionSettings,
  ): Promise<void> {
    // Kysely calls beginTransaction with the SAME connection instance that
    // acquireConnection returned (our wrapped one), so the state lookup
    // always hits. If it ever misses, bail out to the base driver rather
    // than silently skipping the stamp.
    const state = this.#wrapState.get(connection);
    if (state === undefined) {
      return this.#base.beginTransaction(connection, settings);
    }

    await this.#base.beginTransaction(state.base, settings);
    state.inExplicitTx = true;

    const tenantId = this.#resolveTenantId();
    if (tenantId !== null) {
      await state.base.executeQuery(rawQuery(SET_TENANT_SQL, [tenantId]) as CompiledQuery);
      state.stampedTenant = tenantId;
    }
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    const state = this.#wrapState.get(connection);
    if (state === undefined) {
      return this.#base.commitTransaction(connection);
    }
    try {
      await this.#base.commitTransaction(state.base);
    } finally {
      state.inExplicitTx = false;
      state.stampedTenant = null;
    }
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    const state = this.#wrapState.get(connection);
    if (state === undefined) {
      return this.#base.rollbackTransaction(connection);
    }
    try {
      await this.#base.rollbackTransaction(state.base);
    } finally {
      state.inExplicitTx = false;
      state.stampedTenant = null;
    }
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    const state = this.#wrapState.get(connection);
    if (state === undefined) {
      return this.#base.releaseConnection(connection);
    }
    this.#wrapState.delete(connection);
    this.#baseToWrapped.delete(state.base);
    return this.#base.releaseConnection(state.base);
  }

  async destroy(): Promise<void> {
    await this.#base.destroy();
  }

  #resolveTenantId(): string | null {
    const raw = this.#opts.tenantIdProvider();
    if (!raw) {
      this.#opts.onSkippedStamp?.("no-tenant", raw);
      return null;
    }
    if (!UUID_RE.test(raw)) {
      this.#opts.onSkippedStamp?.("invalid-uuid", raw);
      return null;
    }
    return raw;
  }

  #wrap(base: DatabaseConnection): DatabaseConnection {
    const driver = this;
    const state: ConnectionState = {
      base,
      inExplicitTx: false,
      stampedTenant: null,
    };

    const wrapped: DatabaseConnection = {
      async executeQuery<R>(cq: CompiledQuery): Promise<QueryResult<R>> {
        const s = driver.#wrapState.get(wrapped);
        if (s === undefined) {
          // Defensive — state should always be present for a connection we
          // handed out. If a caller cached the reference past releaseConnection,
          // executeQuery on a released connection is a bug; let the base
          // driver surface it rather than silently stamping.
          return base.executeQuery<R>(cq);
        }

        // Already inside an explicit transaction — stamp was issued at BEGIN.
        if (s.inExplicitTx) {
          return s.base.executeQuery<R>(cq);
        }

        const tenantId = driver.#resolveTenantId();
        if (tenantId === null) {
          // No-op path: no tenant context. Preserves bootstrap, health probes,
          // migrations, and shared-schema reads.
          return s.base.executeQuery<R>(cq);
        }

        // Implicit single-query tenant transaction.
        //
        // Correct-by-construction at the cost of 4 round-trips per standalone
        // query against PgBouncer tx pool. See verify-tenant-stamp.ts bench
        // for measured overhead; optimize to simple-query single round-trip
        // only if numbers justify the param-escaping complexity.
        await s.base.executeQuery(rawQuery(BEGIN_SQL, []) as CompiledQuery);
        try {
          await s.base.executeQuery(
            rawQuery(SET_TENANT_SQL, [tenantId]) as CompiledQuery,
          );
          const result = await s.base.executeQuery<R>(cq);
          await s.base.executeQuery(rawQuery(COMMIT_SQL, []) as CompiledQuery);
          return result;
        } catch (err) {
          try {
            await s.base.executeQuery(rawQuery(ROLLBACK_SQL, []) as CompiledQuery);
          } catch (rollbackErr) {
            driver.#reportRollbackFailure(rollbackErr, err);
          }
          throw err;
        }
      },

      async *streamQuery<R>(
        cq: CompiledQuery,
        chunkSize?: number,
      ): AsyncIterableIterator<QueryResult<R>> {
        const s = driver.#wrapState.get(wrapped);
        if (s === undefined || s.inExplicitTx) {
          // Streaming under explicit tx works as-is. Outside an explicit tx
          // we'd need to hold a transaction open for the duration of the
          // async iterator, which changes lifetime semantics meaningfully —
          // refuse rather than fabricate behavior. Callers that stream
          // tenant-scoped data should do so inside withTenantTx.
          yield* (s ?? { base }).base.streamQuery<R>(cq, chunkSize);
          return;
        }
        if (driver.#resolveTenantId() !== null) {
          throw new Error(
            "TenantStampDriver: streamQuery outside an explicit transaction is not supported for tenant-scoped queries — wrap in withTenantTx",
          );
        }
        yield* s.base.streamQuery<R>(cq, chunkSize);
      },
    };

    this.#wrapState.set(wrapped, state);
    return wrapped;
  }

  #reportRollbackFailure(error: unknown, originalError: unknown): void {
    if (this.#opts.onRollbackFailure) {
      this.#opts.onRollbackFailure(error, originalError);
      return;
    }

    console.error(
      JSON.stringify({
        msg: "tenant_stamp_rollback_failed",
        err: String(error),
        originalErr: String(originalError),
      }),
    );
  }
}

interface ConnectionState {
  readonly base: DatabaseConnection;
  inExplicitTx: boolean;
  stampedTenant: string | null;
}
