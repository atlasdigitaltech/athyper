import pg from "pg";

const { Pool } = pg;

export type PostgresPool = pg.Pool;

export interface PostgresPoolConfig {
  readonly connectionString: string;
  readonly max?: number;
  readonly idleTimeoutMillis?: number;
  readonly connectionTimeoutMillis?: number;
}

export interface PostgresPoolStats {
  readonly totalCount: number;
  readonly idleCount: number;
  readonly waitingCount: number;
  readonly max: number;
}

export interface DatabaseHealth {
  readonly healthy: boolean;
  readonly message?: string;
}

export interface PostgresPoolObserver {
  onPoolError?(error: Error): void;
  onPoolStats?(stats: PostgresPoolStats): void;
}

const DEFAULT_MAX = 10;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;

/** Creates a PostgreSQL pool without mutating process-wide environment state. */
export function createPostgresPool(
  config: PostgresPoolConfig,
  observer: PostgresPoolObserver = {},
): PostgresPool {
  if (!config.connectionString.trim()) {
    throw new TypeError("PostgreSQL connectionString must not be empty");
  }

  const pool = new Pool({
    connectionString: config.connectionString,
    max: config.max ?? DEFAULT_MAX,
    idleTimeoutMillis: config.idleTimeoutMillis ?? DEFAULT_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis:
      config.connectionTimeoutMillis ?? DEFAULT_CONNECTION_TIMEOUT_MS,
  });

  if (observer.onPoolError) {
    pool.on("error", observer.onPoolError);
  }
  if (observer.onPoolStats) {
    const observe = () => observer.onPoolStats!(getPostgresPoolStats(pool, config.max ?? DEFAULT_MAX));
    pool.on("connect", observe);
    pool.on("acquire", observe);
    pool.on("release", observe);
    pool.on("remove", observe);
    observe();
  }

  return pool;
}

export function getPostgresPoolStats(
  pool: Pick<PostgresPool, "totalCount" | "idleCount" | "waitingCount">,
  max = DEFAULT_MAX,
): PostgresPoolStats {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    max,
  };
}

export async function checkPostgresPoolHealth(
  pool: Pick<PostgresPool, "query">,
): Promise<DatabaseHealth> {
  try {
    await pool.query("select 1");
    return { healthy: true };
  } catch (error) {
    return {
      healthy: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function closePostgresPool(
  pool: Pick<PostgresPool, "end">,
): Promise<void> {
  await pool.end();
}
