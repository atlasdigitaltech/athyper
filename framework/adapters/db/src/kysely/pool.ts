// framework/adapters/db/src/kysely/pool.ts
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

    /**
     * Statement timeout in milliseconds (PgBouncer transaction mode compatible)
     * @default 30000 (30 seconds)
     */
    statement_timeout?: number;
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
    const pool = new Pool({
        connectionString: config.connectionString,
        max: config.max ?? 10,
        idleTimeoutMillis: config.idleTimeoutMillis ?? 30000,
        connectionTimeoutMillis: config.connectionTimeoutMillis ?? 10000,
        // PgBouncer transaction mode: statement_timeout is safe as it's per-transaction
        statement_timeout: config.statement_timeout ?? 30000,
        // Disable application_name to avoid PgBouncer issues
        application_name: undefined,
    });

    // Error handling
    pool.on("error", (err: Error) => {
        console.error(JSON.stringify({
            msg: "postgres_pool_error",
            err: err.message,
            stack: err.stack,
        }));
    });

    pool.on("connect", () => {
        console.log(JSON.stringify({
            msg: "postgres_pool_connected",
            max: config.max ?? 10,
        }));
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
        console.error(JSON.stringify({
            msg: "postgres_pool_close_error",
            err: String(err),
        }));
        throw err;
    }
}

/**
 * Health check: verifies pool can connect and execute a simple query.
 */
export async function healthCheck(pool: pg.Pool): Promise<{ healthy: boolean; message?: string }> {
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
