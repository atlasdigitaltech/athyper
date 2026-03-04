/**
 * GET /api/conversations/[id] - Get conversation details with participants
 * PATCH /api/conversations/[id] - Update conversation (e.g., title)
 */


import { ConversationService } from "@athyper/runtime/services/enterprise-services/in-app-messaging/domain/services/ConversationService";


import type { DB } from "@athyper/adapter-db";
import type { ConversationId } from "@athyper/runtime/services/enterprise-services/in-app-messaging/domain/types";
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
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { context, redis } = await getApiContext();

    try {
        if (!context) {
            return unauthorizedResponse();
        }

        const { id } = await params;

        // Initialize service
        const db = await getDbClient();
        const service = new ConversationService(db);

        // Get conversation with participants
        const result = await service.getById(
            context.tenantId,
            id as ConversationId,
            context.userId
        );

        // Clean up
        await db.destroy();

        if (!result) {
            return errorResponse("NOT_FOUND", "Conversation not found", 404);
        }

        return successResponse(result);
    } catch (err: any) {
        console.error("[GET /api/conversations/[id]] Error:", err);

        // Handle access denied errors
        if (err.name === "AccessDeniedError") {
            return errorResponse("ACCESS_DENIED", err.message, 403);
        }

        return errorResponse("INTERNAL_ERROR", "Failed to get conversation");
    } finally {
        await redis.quit();
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { context, redis } = await getApiContext();

    try {
        if (!context) {
            return unauthorizedResponse();
        }

        const { id } = await params;
        const body = await req.json();
        const { title } = body;

        if (!title || title.trim().length === 0) {
            return errorResponse("MISSING_TITLE", "Title is required", 400);
        }

        // Initialize service
        const db = await getDbClient();
        const service = new ConversationService(db);

        // Update title
        await service.updateTitle(
            context.tenantId,
            id as ConversationId,
            title,
            context.userId
        );

        // Clean up
        await db.destroy();

        return successResponse({ ok: true });
    } catch (err: any) {
        console.error("[PATCH /api/conversations/[id]] Error:", err);

        // Handle domain validation errors
        if (err.name === "ConversationValidationError") {
            return errorResponse("VALIDATION_ERROR", err.message, 400);
        }

        // Handle access denied errors
        if (err.name === "AccessDeniedError") {
            return errorResponse("ACCESS_DENIED", err.message, 403);
        }

        if (err.message === "Conversation not found") {
            return errorResponse("NOT_FOUND", "Conversation not found", 404);
        }

        return errorResponse("INTERNAL_ERROR", "Failed to update conversation");
    } finally {
        await redis.quit();
    }
}
