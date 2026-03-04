/**
 * POST /api/notifications/[id]/dismiss
 *
 * Dismisses (soft-deletes) a notification.
 */

import { InAppNotificationRepo } from "@athyper/runtime/services/platform-services/notification/persistence/InAppNotificationRepo";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";


import { getApiContext, resolveTenantUuid, unauthorizedResponse, successResponse, errorResponse } from "@/lib/api-context";
import { broadcastNotificationEvent } from "@/lib/realtime/broadcast-notification-event";

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

export async function POST(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { context, redis } = await getApiContext();

    try {
        if (!context) {
            return unauthorizedResponse();
        }

        const { id } = await params;

        if (!id) {
            return errorResponse("MISSING_ID", "Notification ID required", 400);
        }

        // Initialize repo
        const db = await getDbClient();
        const tenantUuid = await resolveTenantUuid(db, context.tenantId);
        const repo = new InAppNotificationRepo(db);

        // Dismiss
        await repo.dismiss(tenantUuid, id);

        // Broadcast event to SSE clients
        broadcastNotificationEvent("notification.dismissed", context.tenantId, context.userId, id);

        // Clean up
        await db.destroy();

        return successResponse({ ok: true });
    } catch (err) {
        console.error("[POST /api/notifications/[id]/dismiss] Error:", err);
        return errorResponse("INTERNAL_ERROR", "Failed to dismiss notification");
    } finally {
        await redis.quit();
    }
}
