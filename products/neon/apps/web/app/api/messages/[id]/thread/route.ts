/**
 * GET /api/messages/[id]/thread - Get thread replies for a message
 */

import { MessageService } from "@athyper/runtime/services/enterprise-services/in-app-messaging/domain/services/MessageService";


import type { DB } from "@athyper/adapter-db";
import type { MessageId } from "@athyper/runtime/services/enterprise-services/in-app-messaging/domain/types";
import type { Kysely } from "kysely";

import { getApiContext, unauthorizedResponse, successResponse, errorResponse } from "@/lib/api-context";

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

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { context, redis } = await getApiContext();

    try {
        if (!context) {
            return unauthorizedResponse();
        }

        const { id } = await params;
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get("limit") ?? "100");

        // Initialize service
        const db = await getDbClient();
        const service = new MessageService(db);

        // Get thread replies
        const replies = await service.listThreadReplies(
            context.tenantId,
            id as MessageId,
            context.userId,
            { limit }
        );

        // Get thread count
        const count = await service.countThreadReplies(
            context.tenantId,
            id as MessageId,
            context.userId
        );

        // Clean up
        await db.destroy();

        return successResponse({ replies, count });
    } catch (err: any) {
        console.error("[GET /api/messages/[id]/thread] Error:", err);

        // Handle access denied errors
        if (err.name === "AccessDeniedError") {
            return errorResponse("ACCESS_DENIED", err.message, 403);
        }

        if (err.message === "Parent message not found" || err.message === "Conversation not found") {
            return errorResponse("NOT_FOUND", err.message, 404);
        }

        return errorResponse("INTERNAL_ERROR", "Failed to get thread replies");
    } finally {
        await redis.quit();
    }
}
