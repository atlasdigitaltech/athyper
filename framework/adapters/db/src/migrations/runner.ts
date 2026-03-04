// framework/adapters/db/src/migrations/runner.ts
import pg from "pg";

import { getMigrationRegistry, type Migration } from "./registry.js";

const { Client } = pg;

export type MigrationRunnerConfig = {
    /**
     * Admin connection string (direct Postgres connection, NOT PgBouncer)
     * This should point to DATABASE_ADMIN_URL
     */
    adminConnectionString: string;
};

export type MigrationResult = {
    id: string;
    name: string;
    executedAt: Date;
    durationMs: number;
};

export type MigrationStatus = {
    total: number;
    executed: number;
    pending: number;
    pendingMigrations: Migration[];
};

/**
 * Migration runner that executes SQL migrations against the database.
 *
 * IMPORTANT: Always use DATABASE_ADMIN_URL (direct Postgres connection)
 * for migrations, NOT the PgBouncer connection (DATABASE_URL).
 *
 * PgBouncer transaction mode does not support:
 * - CREATE/DROP SCHEMA statements
 * - CREATE EXTENSION statements
 * - Other DDL operations
 */
export class MigrationRunner {
    private registry = getMigrationRegistry();
    private config: MigrationRunnerConfig;

    constructor(config: MigrationRunnerConfig) {
        this.config = config;
    }

    /**
     * Get migration status (executed vs pending).
     */
    async getStatus(): Promise<MigrationStatus> {
        const client = new Client({
            connectionString: this.config.adminConnectionString,
        });

        try {
            await client.connect();
            await this.ensureMigrationsTable(client);

            const result = await client.query<{ migration_id: string }>(
                "SELECT migration_id FROM public.migrations ORDER BY executed_at"
            );

            const executedIds = new Set(result.rows.map((r) => r.migration_id));
            const allMigrations = this.registry.getAllMigrations();
            const pendingMigrations = allMigrations.filter((m) => !executedIds.has(m.id));

            return {
                total: allMigrations.length,
                executed: executedIds.size,
                pending: pendingMigrations.length,
                pendingMigrations,
            };
        } finally {
            await client.end();
        }
    }

    /**
     * Run all pending migrations.
     */
    async migrate(): Promise<MigrationResult[]> {
        const client = new Client({
            connectionString: this.config.adminConnectionString,
        });

        const results: MigrationResult[] = [];

        try {
            await client.connect();
            await this.ensureMigrationsTable(client);

            const status = await this.getStatus();

            console.log(JSON.stringify({
                msg: "migration_start",
                total: status.total,
                executed: status.executed,
                pending: status.pending,
            }));

            for (const migration of status.pendingMigrations) {
                const startTime = Date.now();

                console.log(JSON.stringify({
                    msg: "migration_executing",
                    id: migration.id,
                    name: migration.name,
                }));

                try {
                    // Execute migration in a transaction
                    await client.query("BEGIN");

                    await client.query(migration.sql);

                    await client.query(
                        "INSERT INTO public.migrations (migration_id, name, executed_at) VALUES ($1, $2, NOW())",
                        [migration.id, migration.name]
                    );

                    await client.query("COMMIT");

                    const durationMs = Date.now() - startTime;

                    results.push({
                        id: migration.id,
                        name: migration.name,
                        executedAt: new Date(),
                        durationMs,
                    });

                    console.log(JSON.stringify({
                        msg: "migration_success",
                        id: migration.id,
                        durationMs,
                    }));
                } catch (err) {
                    await client.query("ROLLBACK");

                    console.error(JSON.stringify({
                        msg: "migration_failed",
                        id: migration.id,
                        error: String(err),
                    }));

                    throw new Error(`Migration failed: ${migration.id} - ${String(err)}`);
                }
            }

            console.log(JSON.stringify({
                msg: "migration_complete",
                count: results.length,
            }));

            return results;
        } finally {
            await client.end();
        }
    }

    /**
     * Reset database by dropping and recreating all schemas.
     * WARNING: This will destroy all data!
     */
    async reset(): Promise<void> {
        const client = new Client({
            connectionString: this.config.adminConnectionString,
        });

        try {
            await client.connect();

            console.log(JSON.stringify({ msg: "migration_reset_start" }));

            // Drop schemas (in reverse order of dependencies)
            const schemas = ["notify", "ui", "collab", "doc", "ent", "wf", "sec", "audit", "meta", "ref", "core"];
            for (const schema of schemas) {
                await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
            }

            // Drop migrations table
            await client.query("DROP TABLE IF EXISTS public.migrations CASCADE");

            console.log(JSON.stringify({ msg: "migration_reset_complete" }));
        } finally {
            await client.end();
        }
    }

    /**
     * Ensure migrations tracking table exists.
     */
    private async ensureMigrationsTable(client: pg.Client): Promise<void> {
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.migrations (
                id SERIAL PRIMARY KEY,
                migration_id TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                executed_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);
    }
}

/**
 * Create a migration runner instance.
 */
export function createMigrationRunner(config: MigrationRunnerConfig): MigrationRunner {
    return new MigrationRunner(config);
}
