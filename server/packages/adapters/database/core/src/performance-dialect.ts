import type {
  CompiledQuery,
  DatabaseConnection,
  DatabaseIntrospector,
  Dialect,
  DialectAdapter,
  Driver,
  Kysely,
  QueryCompiler,
  QueryResult,
  TransactionSettings,
} from "kysely";

export interface DatabasePerformanceObserver {
  onPoolAcquire?(durationMs: number): void;
  onQuery?(durationMs: number): void;
  onTransaction?(durationMs: number): void;
}

/**
 * Observes logical Kysely calls without changing SQL or transaction behavior.
 * When this wraps TenantStampDialect, the tenant-stamp BEGIN/SET/COMMIT calls
 * stay implementation details and one application query is counted once.
 */
export class PerformanceDialect implements Dialect {
  constructor(
    private readonly base: Dialect,
    private readonly observer: DatabasePerformanceObserver,
  ) {}

  createDriver(): Driver {
    return new PerformanceDriver(this.base.createDriver(), this.observer);
  }

  createQueryCompiler(): QueryCompiler {
    return this.base.createQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return this.base.createAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return this.base.createIntrospector(db as Kysely<Record<string, never>>);
  }
}

class PerformanceDriver implements Driver {
  private readonly transactions = new WeakMap<DatabaseConnection, bigint>();
  private readonly connections = new WeakMap<DatabaseConnection, DatabaseConnection>();

  constructor(
    private readonly base: Driver,
    private readonly observer: DatabasePerformanceObserver,
  ) {}

  init(): Promise<void> {
    return this.base.init();
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    const startedAt = process.hrtime.bigint();
    try {
      const baseConnection = await this.base.acquireConnection();
      const wrapped = this.wrap(baseConnection);
      this.connections.set(wrapped, baseConnection);
      return wrapped;
    } finally {
      this.observer.onPoolAcquire?.(elapsedMs(startedAt));
    }
  }

  async beginTransaction(connection: DatabaseConnection, settings: TransactionSettings): Promise<void> {
    const baseConnection = this.unwrap(connection);
    await this.base.beginTransaction(baseConnection, settings);
    this.transactions.set(connection, process.hrtime.bigint());
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    try {
      await this.base.commitTransaction(this.unwrap(connection));
    } finally {
      this.finishTransaction(connection);
    }
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    try {
      await this.base.rollbackTransaction(this.unwrap(connection));
    } finally {
      this.finishTransaction(connection);
    }
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    const baseConnection = this.unwrap(connection);
    this.transactions.delete(connection);
    this.connections.delete(connection);
    await this.base.releaseConnection(baseConnection);
  }

  destroy(): Promise<void> {
    return this.base.destroy();
  }

  private wrap(baseConnection: DatabaseConnection): DatabaseConnection {
    const observer = this.observer;
    return {
      async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
        const startedAt = process.hrtime.bigint();
        try {
          return await baseConnection.executeQuery<R>(query);
        } finally {
          observer.onQuery?.(elapsedMs(startedAt));
        }
      },
      async *streamQuery<R>(
        query: CompiledQuery,
        chunkSize?: number,
      ): AsyncIterableIterator<QueryResult<R>> {
        const startedAt = process.hrtime.bigint();
        try {
          yield* baseConnection.streamQuery<R>(query, chunkSize);
        } finally {
          observer.onQuery?.(elapsedMs(startedAt));
        }
      },
    };
  }

  private unwrap(connection: DatabaseConnection): DatabaseConnection {
    return this.connections.get(connection) ?? connection;
  }

  private finishTransaction(connection: DatabaseConnection): void {
    const startedAt = this.transactions.get(connection);
    this.transactions.delete(connection);
    if (startedAt) this.observer.onTransaction?.(elapsedMs(startedAt));
  }
}

function elapsedMs(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}
