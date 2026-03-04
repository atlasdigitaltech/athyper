/**
 * cleanupExpired.worker — BullMQ job handler for TTL cleanup.
 *
 * Removes old notify.message and notify.delivery rows
 * past their retention period. Also cleans expired suppressions.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { CleanupExpiredPayload } from "../../domain/services/NotificationOrchestrator.js";
import type { NotificationSuppressionRepo } from "../../persistence/NotificationSuppressionRepo.js";
import type { DB } from "@athyper/adapter-db";
import type { Job, JobHandler } from "@athyper/core";
import type { Kysely } from "kysely";

const MESSAGE_TABLE = "notify.message" as keyof DB & string;
const DELIVERY_TABLE = "notify.delivery" as keyof DB & string;

export interface RetentionDefaults {
    messageDays: number;
    deliveryDays: number;
}

export function createCleanupExpiredHandler(
    db: Kysely<DB>,
    suppressionRepo: NotificationSuppressionRepo,
    logger: Logger,
    defaultRetention: RetentionDefaults = { messageDays: 90, deliveryDays: 30 },
): JobHandler<CleanupExpiredPayload, void> {
    return async (job: Job<CleanupExpiredPayload>): Promise<void> => {
        const { payload } = job.data;
        const messageDays = payload.messageDays ?? defaultRetention.messageDays;
        const deliveryDays = payload.deliveryDays ?? defaultRetention.deliveryDays;

        logger.info(
            {
                jobId: job.id,
                messageDays,
                deliveryDays,
            },
            "[notify:worker:cleanup] Starting cleanup",
        );

        try {
            // 1. Delete old delivery rows
            const deliveryCutoff = new Date();
            deliveryCutoff.setDate(deliveryCutoff.getDate() - deliveryDays);

            const deliveryResult = await db
                .deleteFrom(DELIVERY_TABLE as any)
                .where("created_at", "<", deliveryCutoff)
                .where("status", "in", ["sent", "delivered", "failed", "bounced", "cancelled"])
                .execute();

            const deliveriesDeleted = Number((deliveryResult as any)[0]?.numDeletedRows ?? 0);

            // 2. Delete old message rows (only completed/failed)
            const messageCutoff = new Date();
            messageCutoff.setDate(messageCutoff.getDate() - messageDays);

            const messageResult = await db
                .deleteFrom(MESSAGE_TABLE as any)
                .where("created_at", "<", messageCutoff)
                .where("status", "in", ["completed", "failed", "partial"])
                .execute();

            const messagesDeleted = Number((messageResult as any)[0]?.numDeletedRows ?? 0);

            // 3. Clean up expired suppressions
            const suppressionsRemoved = await suppressionRepo.cleanupExpired();

            logger.info(
                {
                    jobId: job.id,
                    deliveriesDeleted,
                    messagesDeleted,
                    suppressionsRemoved,
                },
                "[notify:worker:cleanup] Cleanup complete",
            );
        } catch (err) {
            logger.error(
                { jobId: job.id, error: String(err) },
                "[notify:worker:cleanup] Cleanup failed",
            );
            throw err;
        }
    };
}
