/**
 * GET /api/conversations/[id]/participants - List participants
 * POST /api/conversations/[id]/participants - Add participants
 * DELETE /api/conversations/[id]/participants - Remove participant
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

        // Get participants
        const participants = await service.getParticipants(
            context.tenantId,
            id as ConversationId,
            context.userId
        );

        // Clean up
        await db.destroy();

        return successResponse({ participants });
    } catch (err: any) {
        console.error("[GET /api/conversations/[id]/participants] Error:", err);

        // Handle access denied errors
        if (err.name === "AccessDeniedError") {
            return errorResponse("ACCESS_DENIED", err.message, 403);
        }

        if (err.message === "Conversation not found") {
            return errorResponse("NOT_FOUND", "Conversation not found", 404);
        }

        return errorResponse("INTERNAL_ERROR", "Failed to get participants");
    } finally {
        await redis.quit();
    }
}

export async function POST(
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
        const { participantIds } = body;

        if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
            return errorResponse("INVALID_INPUT", "participantIds must be a non-empty array", 400);
        }

        // Initialize service
        const db = await getDbClient();
        const service = new ConversationService(db);

        // Add participants
        const participants = await service.addParticipants({
            tenantId: context.tenantId,
            conversationId: id as ConversationId,
            requesterId: context.userId,
            participantIds,
        });

        // Clean up
        await db.destroy();

        return successResponse({ participants });
    } catch (err: any) {
        console.error("[POST /api/conversations/[id]/participants] Error:", err);

        // Handle access denied errors
        if (err.name === "AccessDeniedError") {
            return errorResponse("ACCESS_DENIED", err.message, 403);
        }

        if (err.message === "Conversation not found") {
            return errorResponse("NOT_FOUND", "Conversation not found", 404);
        }

        return errorResponse("INTERNAL_ERROR", "Failed to add participants");
    } finally {
        await redis.quit();
    }
}

export async function DELETE(
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
        const participantId = searchParams.get("userId");

        if (!participantId) {
            return errorResponse("MISSING_USER_ID", "userId query parameter is required", 400);
        }

        // Initialize service
        const db = await getDbClient();
        const service = new ConversationService(db);

        // Remove participant
        await service.removeParticipant({
            tenantId: context.tenantId,
            conversationId: id as ConversationId,
            requesterId: context.userId,
            participantId,
        });

        // Clean up
        await db.destroy();

        return successResponse({ ok: true });
    } catch (err: any) {
        console.error("[DELETE /api/conversations/[id]/participants] Error:", err);

        // Handle access denied errors
        if (err.name === "AccessDeniedError") {
            return errorResponse("ACCESS_DENIED", err.message, 403);
        }

        if (err.message === "Conversation not found") {
            return errorResponse("NOT_FOUND", "Conversation not found", 404);
        }

        return errorResponse("INTERNAL_ERROR", "Failed to remove participant");
    } finally {
        await redis.quit();
    }
}
