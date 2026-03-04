// framework/adapters/db/src/kysely/dialect.ts
import { PostgresDialect } from "kysely";

import type pg from "pg";

/**
 * Creates a Kysely PostgresDialect configured for PgBouncer transaction mode.
 *
 * This dialect uses a pg.Pool and is optimized for:
 * - PgBouncer transaction mode compatibility
 * - Proper connection pooling
 * - No prepared statements (PgBouncer limitation)
 */
export function createPostgresDialect(pool: pg.Pool): PostgresDialect {
    return new PostgresDialect({
        pool: pool as any, // Kysely expects any for pool
    });
}
