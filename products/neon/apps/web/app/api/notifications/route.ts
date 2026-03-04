/**
 * GET /api/notifications
 *
 * Lists notifications for the authenticated user with pagination and filters.
 */

import { InAppNotificationRepo } from "@athyper/runtime/services/platform-services/notification/persistence/InAppNotificationRepo";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";



import { getApiContext, resolveTenantUuid, unauthorizedResponse, successResponse, errorResponse } from "@/lib/api-context";

function isStubMode(): boolean {
    return !process.env.DATABASE_URL && process.env.ENABLE_DEV_STUBS === "true";
}

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

export async function GET(req: Request) {
    if (isStubMode()) {
        return successResponse({ items: [], pagination: { limit: 50, offset: 0, count: 0 } });
    }

    const { context, redis } = await getApiContext();

    try {
        if (!context) {
            return unauthorizedResponse();
        }

        // Parse query parameters
        const url = new URL(req.url);
        const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
        const offset = Number(url.searchParams.get("offset")) || 0;
        const unreadOnly = url.searchParams.get("unreadOnly") === "true";
        const category = url.searchParams.get("category") || undefined;

        // Initialize repo
        const db = await getDbClient();
        const tenantUuid = await resolveTenantUuid(db, context.tenantId);
        const repo = new InAppNotificationRepo(db);

        // Fetch notifications
        const items = await repo.listForRecipient(tenantUuid, context.userId, {
            unreadOnly,
            category,
            limit,
            offset,
        });

        // Clean up
        await db.destroy();

        return successResponse({
            items,
            pagination: {
                limit,
                offset,
                count: items.length,
            },
        });
    } catch (err) {
        console.error("[GET /api/notifications] Error:", err);
        return errorResponse("INTERNAL_ERROR", "Failed to fetch notifications");
    } finally {
        await redis.quit();
    }
}
