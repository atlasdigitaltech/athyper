/**
 * POST /api/notifications/read-all
 *
 * Marks all notifications as read for the authenticated user.
 */

import { InAppNotificationRepo } from "@athyper/runtime/services/platform-services/notification/persistence/InAppNotificationRepo";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";


import { getApiContext, resolveTenantUuid, unauthorizedResponse, successResponse, errorResponse } from "@/lib/api-context";

async function getDbClient(): Promise<Kysely<DB>> {
    const { Pool } = await import("pg");
    const { Kysely, PostgresDialect } = await import("kysely");

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    return new Kysely<DB>({
        dialect: new PostgresDialect({ pool }),
    });
}

export async function POST() {
    const { context, redis } = await getApiContext();

    try {
        if (!context) {
            return unauthorizedResponse();
        }

        // Initialize repo
        const db = await getDbClient();
        const tenantUuid = await resolveTenantUuid(db, context.tenantId);
        const repo = new InAppNotificationRepo(db);

        // Mark all as read
        await repo.markAllAsRead(tenantUuid, context.userId);

        // Clean up
        await db.destroy();

        return successResponse({ ok: true });
    } catch (err) {
        console.error("[POST /api/notifications/read-all] Error:", err);
        return errorResponse("INTERNAL_ERROR", "Failed to mark all notifications as read");
    } finally {
        await redis.quit();
    }
}
