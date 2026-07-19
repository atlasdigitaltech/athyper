// server/packages/adapters/db/src/kysely/pool.ts
import pg from "pg";

const { Pool } = pg;

export type PoolConfig = {
  /**
   * Connection string (should point to PgBouncer in transaction mode)
   */
  connectionString: string;

  /**
   * Maximum number of connections in the pool
   * @default 10
   */
  max?: number;

  /**
   * Idle timeout in milliseconds
   * @default 30000 (30 seconds)
   */
  idleTimeoutMillis?: number;

  /**
   * Connection timeout in milliseconds
   * @default 10000 (10 seconds)
   */
  connectionTimeoutMillis?: number;

  // NOTE: statement_timeout is intentionally omitted.
  // PgBouncer in transaction mode rejects it as an unsupported startup parameter.
  // Set query-level timeouts via SET LOCAL statement_timeout inside transactions instead.
};

/**
 * Creates a PostgreSQL connection pool optimized for PgBouncer transaction mode.
 *
 * IMPORTANT: PgBouncer transaction mode constraints:
 * - No prepared statements (SET is allowed but scoped to transaction)
 * - No LISTEN/NOTIFY
 * - No WITH HOLD cursors
 * - No advisory locks
 *
 * This pool is configured to work safely with these constraints.
 */
export function createPool(config: PoolConfig): pg.Pool {
  // Normalize before pg/libpq reads process settings while constructing a
  // connection. Windows commonly exposes TZ as "GMT+0800", which PostgreSQL
  // does not recognize. The connect-event SET below is only a secondary guard:
  // EventEmitter does not await its promise before the pool leases the client.
  process.env["TZ"] = "UTC";
  process.env["PGTZ"] = "UTC";

  const pool = new Pool({
    connectionString: config.connectionString,
    max: config.max ?? 10,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 30000,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 10000,
    // Disable application_name to avoid PgBouncer issues
    application_name: undefined,
  });

  // pg-pool removes its idle-client error listener while a client is checked
  // out. If PgBouncer expires that client between protocol messages (for
  // example with client_idle_timeout), pg emits a second socket error before
  // Kysely can release the failed query. Without a client-level listener that
  // event becomes an uncaught exception and terminates the process.
  const checkedOutClients = new WeakSet<pg.PoolClient>();

  pool.on("acquire", (client) => {
    checkedOutClients.add(client);
  });

  pool.on("release", (_err, client) => {
    checkedOutClients.delete(client);
  });

  // Error handling
  pool.on("error", (err: Error) => {
    console.error(
      JSON.stringify({
        msg: "postgres_pool_error",
        err: err.message,
        stack: err.stack,
      }),
    );
  });

  pool.on("connect", (client) => {
    // Keep a listener installed while pg-pool temporarily removes its own.
    // Query promises still reject normally; this only handles the subsequent
    // connection-level event that otherwise has no listener.
    client.on("error", (err: Error) => {
      if (!checkedOutClients.has(client)) return;
      console.error(
        JSON.stringify({
          msg: "postgres_checked_out_client_error",
          err: err.message,
          stack: err.stack,
        }),
      );
    });

    // Force UTC on every new connection so PgBouncer tracks 'UTC' rather than
    // whatever PGTZ / system timezone the process inherits (e.g. 'gmt+0800' on
    // Windows is not a valid PostgreSQL timezone name and causes ERRORs when
    // PgBouncer replays it to a backend in transaction-pool mode).
    void client.query("SET TIME ZONE 'UTC'").catch((err: unknown) => {
      // The connect event cannot await this guard query. Never allow a failed
      // session-initialization promise to escape as an unhandled rejection.
      console.error(
        JSON.stringify({
          msg: "postgres_session_initialization_failed",
          err: err instanceof Error ? err.message : String(err),
        }),
      );
    });
    console.log(
      JSON.stringify({
        msg: "postgres_pool_connected",
        max: config.max ?? 10,
      }),
    );
  });

  return pool;
}

/**
 * Gracefully closes the pool, waiting for active connections to finish.
 */
export async function closePool(pool: pg.Pool): Promise<void> {
  try {
    await pool.end();
    console.log(JSON.stringify({ msg: "postgres_pool_closed" }));
  } catch (err) {
    console.error(
      JSON.stringify({
        msg: "postgres_pool_close_error",
        err: String(err),
      }),
    );
    throw err;
  }
}

/**
 * Health check: verifies pool can connect and execute a simple query.
 */
export async function healthCheck(
  pool: pg.Pool,
): Promise<{ healthy: boolean; message?: string }> {
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      return { healthy: true };
    } finally {
      client.release();
    }
  } catch (err) {
    return {
      healthy: false,
      message: `Pool health check failed: ${String(err)}`,
    };
  }
}
