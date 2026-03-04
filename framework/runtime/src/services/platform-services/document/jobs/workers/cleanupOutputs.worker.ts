/**
 * Cleanup Outputs Worker — Archives/purges expired document outputs.
 *
 * Job type: "cleanup-doc-outputs"
 * Runs daily; applies retention rules.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

export interface CleanupConfig {
    archiveAfterDays: number;
    defaultRetentionDays: number;
}

export function createCleanupOutputsHandler(
    db: Kysely<DB>,
    config: CleanupConfig,
    logger: Logger,
) {
    const TABLE = "doc.render_output" as keyof DB & string;

    return async (): Promise<void> => {
        const now = new Date();

        // Archive rendered outputs older than archiveAfterDays
        const archiveCutoff = new Date(now.getTime() - config.archiveAfterDays * 86_400_000);

        try {
            const archiveResult = await db
                .updateTable(TABLE as any)
                .set({
                    status: "ARCHIVED",
                    archived_at: now,
                })
                .where("status", "in", ["RENDERED", "DELIVERED"])
                .where("created_at", "<", archiveCutoff)
                .execute();

            const archivedCount = archiveResult.length > 0 ? (archiveResult[0] as any).numUpdatedRows ?? 0 : 0;

            if (archivedCount > 0) {
                logger.info(
                    { archivedCount, cutoff: archiveCutoff.toISOString() },
                    "[doc:worker:cleanup] Archived old outputs",
                );
            }
        } catch (error) {
            logger.error(
                { error: String(error) },
                "[doc:worker:cleanup] Archive operation failed",
            );
        }

        // Clean up failed outputs older than retention period
        const retentionCutoff = new Date(now.getTime() - config.defaultRetentionDays * 86_400_000);

        try {
            const deleteResult = await db
                .deleteFrom(TABLE as any)
                .where("status", "=", "FAILED")
                .where("created_at", "<", retentionCutoff)
                .execute();

            const deletedCount = deleteResult.length > 0 ? (deleteResult[0] as any).numDeletedRows ?? 0 : 0;

            if (deletedCount > 0) {
                logger.info(
                    { deletedCount, cutoff: retentionCutoff.toISOString() },
                    "[doc:worker:cleanup] Purged expired failed outputs",
                );
            }
        } catch (error) {
            logger.error(
                { error: String(error) },
                "[doc:worker:cleanup] Purge operation failed",
            );
        }
    };
}
