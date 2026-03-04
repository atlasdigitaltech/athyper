/**
 * GET /api/conversations/[id]/messages - List messages in conversation
 * POST /api/conversations/[id]/messages - Send a message
 */

import { MessageService } from "@athyper/runtime/services/enterprise-services/in-app-messaging/domain/services/MessageService";

import type { DB } from "@athyper/adapter-db";
import type {
  ConversationId,
  MessageId,
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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { context, redis } = await getApiContext();

  try {
    if (!context) {
      return unauthorizedResponse();
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const beforeMessageId = searchParams.get("before") as MessageId | null;

    // Initialize service
    const db = await getDbClient();
    const service = new MessageService(db);

    // List messages
    const messages = await service.listForConversation(
      context.tenantId,
      id as ConversationId,
      context.userId,
      {
        limit,
        beforeMessageId: beforeMessageId ?? undefined,
      },
    );

    // Clean up
    await db.destroy();

    return successResponse({ messages });
  } catch (err: unknown) {
    console.error("[GET /api/conversations/[id]/messages] Error:", err);
    const errObj = err instanceof Error ? err : undefined;
    const message = errObj?.message ?? "Unknown error";

    // Handle access denied errors
    if (errObj?.name === "AccessDeniedError") {
      return errorResponse("ACCESS_DENIED", message, 403);
    }

    if (message === "Conversation not found") {
      return errorResponse("NOT_FOUND", "Conversation not found", 404);
    }

    return errorResponse("INTERNAL_ERROR", "Failed to list messages");
  } finally {
    await redis.quit();
  }
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
    const { body: messageBody, bodyFormat, clientMessageId } = body;

    if (!messageBody || messageBody.trim().length === 0) {
      return errorResponse("MISSING_BODY", "Message body is required", 400);
    }

    // Initialize service
    const db = await getDbClient();
    const service = new MessageService(db);

    // Send message
    const result = await service.sendMessage({
      tenantId: context.tenantId,
      conversationId: id as ConversationId,
      senderId: context.userId,
      body: messageBody,
      bodyFormat: bodyFormat ?? "plain",
      clientMessageId,
    });

    // Broadcast event to SSE clients
    broadcastMessagingEvent(
      "message.sent",
      context.tenantId,
      id,
      context.userId,
      {
        messageId: result.message.id,
      },
    );

    // Clean up
    await db.destroy();

    return successResponse(result);
  } catch (err: unknown) {
    console.error("[POST /api/conversations/[id]/messages] Error:", err);
    const errObj = err instanceof Error ? err : undefined;
    const message = errObj?.message ?? "Unknown error";

    // Handle domain validation errors
    if (errObj?.name === "MessageValidationError") {
      return errorResponse("VALIDATION_ERROR", message, 400);
    }

    // Handle access denied errors
    if (errObj?.name === "AccessDeniedError") {
      return errorResponse("ACCESS_DENIED", message, 403);
    }

    if (message === "Conversation not found") {
      return errorResponse("NOT_FOUND", "Conversation not found", 404);
    }

    return errorResponse("INTERNAL_ERROR", "Failed to send message");
  } finally {
    await redis.quit();
  }
}
