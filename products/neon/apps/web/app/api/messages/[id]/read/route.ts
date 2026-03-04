/**
 * POST /api/messages/[id]/read - Mark message as read
 */

import { MessageService } from "@athyper/runtime/services/enterprise-services/in-app-messaging/domain/services/MessageService";

import type { DB } from "@athyper/adapter-db";
import type {
  MessageId,
  ConversationId,
} from "@athyper/runtime/services/enterprise-services/in-app-messaging/domain/types";
import type { Kysely } from "kysely";

import {
  getApiContext,
  unauthorizedResponse,
  successResponse,
  errorResponse,
} from "@/lib/api-context";
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { context, redis } = await getApiContext();

  try {
    if (!context) {
      return unauthorizedResponse();
    }

    const { id } = await params;
    const body = await req.json();
    const { conversationId } = body;

    if (!conversationId) {
      return errorResponse(
        "MISSING_CONVERSATION_ID",
        "conversationId is required",
        400,
      );
    }

    // Initialize service
    const db = await getDbClient();
    const service = new MessageService(db);

    // Mark as read
    await service.markAsRead({
      tenantId: context.tenantId,
      conversationId: conversationId as ConversationId,
      userId: context.userId,
      messageId: id as MessageId,
    });

    // Broadcast event to SSE clients
    broadcastMessagingEvent(
      "message.read",
      context.tenantId,
      conversationId,
      context.userId,
      {
        messageId: id as MessageId,
      },
    );

    // Clean up
    await db.destroy();

    return successResponse({ ok: true });
  } catch (err: unknown) {
    console.error("[POST /api/messages/[id]/read] Error:", err);
    const errObj = err instanceof Error ? err : undefined;
    const message = errObj?.message ?? "Unknown error";

    // Handle access denied errors
    if (errObj?.name === "AccessDeniedError") {
      return errorResponse("ACCESS_DENIED", message, 403);
    }

    if (message === "Conversation not found") {
      return errorResponse("NOT_FOUND", "Conversation not found", 404);
    }

    return errorResponse("INTERNAL_ERROR", "Failed to mark message as read");
  } finally {
    await redis.quit();
  }
}
