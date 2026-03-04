/**
 * GET /api/conversations - List conversations for current user
 * POST /api/conversations - Create a new conversation (direct or group)
 */

import { ConversationService } from "@athyper/runtime/services/enterprise-services/in-app-messaging/domain/services/ConversationService";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

import { getApiContext, unauthorizedResponse, successResponse, errorResponse } from "@/lib/api-context";
import { broadcastMessagingEvent } from "@/lib/realtime/broadcast-messaging-event";


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
    const { context, redis } = await getApiContext();

    try {
        if (!context) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(req.url);
        const type = searchParams.get("type") as "direct" | "group" | null;
        const limit = parseInt(searchParams.get("limit") ?? "50");
        const offset = parseInt(searchParams.get("offset") ?? "0");

        // Initialize service
        const db = await getDbClient();
        const service = new ConversationService(db);

        // List conversations
        const conversations = await service.listForUser(context.tenantId, context.userId, {
            type: type ?? undefined,
            limit,
            offset,
        });

        // Clean up
        await db.destroy();

        return successResponse({ conversations });
    } catch (err) {
        console.error("[GET /api/conversations] Error:", err);
        return errorResponse("INTERNAL_ERROR", "Failed to list conversations");
    } finally {
        await redis.quit();
    }
}

export async function POST(req: Request) {
    const { context, redis } = await getApiContext();

    try {
        if (!context) {
            return unauthorizedResponse();
        }

        const body = await req.json();
        const { type, participantIds, title, adminIds } = body;

        // Validate input
        if (!type || !participantIds || !Array.isArray(participantIds)) {
            return errorResponse("INVALID_INPUT", "Missing or invalid fields", 400);
        }

        if (type !== "direct" && type !== "group") {
            return errorResponse("INVALID_TYPE", "Type must be 'direct' or 'group'", 400);
        }

        // Initialize service
        const db = await getDbClient();
        const service = new ConversationService(db);

        let result;

        if (type === "direct") {
            // Create direct conversation
            if (participantIds.length !== 2) {
                await db.destroy();
                return errorResponse("INVALID_PARTICIPANTS", "Direct conversations must have exactly 2 participants", 400);
            }

            result = await service.createDirect({
                tenantId: context.tenantId,
                createdBy: context.userId,
                participantIds: [participantIds[0], participantIds[1]],
            });
        } else {
            // Create group conversation
            if (!title || title.trim().length === 0) {
                await db.destroy();
                return errorResponse("MISSING_TITLE", "Group conversations must have a title", 400);
            }

            result = await service.createGroup({
                tenantId: context.tenantId,
                createdBy: context.userId,
                title,
                participantIds,
                adminIds,
            });
        }

        // Broadcast event to all participants
        const allParticipantIds = result.participants.map(p => p.userId);
        broadcastMessagingEvent(
            "conversation.created",
            context.tenantId,
            result.conversation.id,
            context.userId,
            {
                participantIds: allParticipantIds,
            }
        );

        // Clean up
        await db.destroy();

        return successResponse(result);
    } catch (err: any) {
        console.error("[POST /api/conversations] Error:", err);

        // Handle domain validation errors
        if (err.name === "ConversationValidationError") {
            return errorResponse("VALIDATION_ERROR", err.message, 400);
        }

        return errorResponse("INTERNAL_ERROR", "Failed to create conversation");
    } finally {
        await redis.quit();
    }
}
