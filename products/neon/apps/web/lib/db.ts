/**
 * Shared Kysely DB Client for BFF Routes
 *
 * Lazy singleton — connection pool is created on first use and reused
 * across all API route handlers in the same process.
 *
 * Uses DATABASE_URL from environment (PgBouncer endpoint).
 */

import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import type { DB } from "@athyper/adapter-db";

let _db: Kysely<DB> | null = null;

/**
 * Get the shared Kysely database client.
 * Returns null if DATABASE_URL is not configured.
 */
export function getDb(): Kysely<DB> | null {
  if (!process.env.DATABASE_URL) return null;

  if (!_db) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
    });

    // Prevent uncaughtException on idle client errors (e.g. client_idle_timeout)
    pool.on("error", (err) => {
      console.warn(
        "[db] Pool idle client error (connection recycled):",
        err.message,
      );
    });

    _db = new Kysely<DB>({
      dialect: new PostgresDialect({ pool }),
    });
  }

  return _db;
}

/**
 * Check if the database is available (DATABASE_URL is set).
 */
export function isDbAvailable(): boolean {
  return !!process.env.DATABASE_URL;
}

// ============================================================================
// Column existence check (cached per process lifetime)
// ============================================================================

const columnExistsCache = new Map<string, boolean>();

/**
 * Check whether a table has a specific column.
 * Result is cached for the lifetime of the process.
 */
export async function tableHasColumn(
  db: Kysely<DB>,
  tableSchema: string,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const cacheKey = `${tableSchema}.${tableName}.${columnName}`;
  const cached = columnExistsCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const result = await sql<{ cnt: string }>`
        SELECT COUNT(*)::text as cnt
        FROM information_schema.columns
        WHERE table_schema = ${tableSchema}
          AND table_name = ${tableName}
          AND column_name = ${columnName}
    `.execute(db);

  const exists = Number(result.rows[0]?.cnt ?? 0) > 0;
  columnExistsCache.set(cacheKey, exists);
  return exists;
}
