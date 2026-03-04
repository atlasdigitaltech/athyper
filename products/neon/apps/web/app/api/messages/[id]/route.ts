/**
 * GET /api/messages/[id] - Get message details
 * PATCH /api/messages/[id] - Edit message
 * DELETE /api/messages/[id] - Delete message
 */

import { MessageService } from "@athyper/runtime/services/enterprise-services/in-app-messaging/domain/services/MessageService";

import type { DB } from "@athyper/adapter-db";
import type { MessageId } from "@athyper/runtime/services/enterprise-services/in-app-messaging/domain/types";
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
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { context, redis } = await getApiContext();

  try {
    if (!context) {
      return unauthorizedResponse();
    }

    const { id } = await params;

    // Initialize service
    const db = await getDbClient();
    const service = new MessageService(db);

    // Get message
    const message = await service.getById(
      context.tenantId,
      id as MessageId,
      context.userId,
    );

    // Clean up
    await db.destroy();

    if (!message) {
      return errorResponse("NOT_FOUND", "Message not found", 404);
    }

    return successResponse({ message });
  } catch (err: unknown) {
    console.error("[GET /api/messages/[id]] Error:", err);
    const errObj = err instanceof Error ? err : undefined;

    // Handle access denied errors
    if (errObj?.name === "AccessDeniedError") {
      return errorResponse("ACCESS_DENIED", errObj.message, 403);
    }

    return errorResponse("INTERNAL_ERROR", "Failed to get message");
  } finally {
    await redis.quit();
  }
}

export async function PATCH(
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
    const { body: newBody } = body;

    if (!newBody || newBody.trim().length === 0) {
      return errorResponse("MISSING_BODY", "Message body is required", 400);
    }

    // Initialize service
    const db = await getDbClient();
    const service = new MessageService(db);

    // Edit message
    const message = await service.editMessage({
      tenantId: context.tenantId,
      messageId: id as MessageId,
      userId: context.userId,
      body: newBody,
    });

    // Broadcast event to SSE clients
    broadcastMessagingEvent(
      "message.edited",
      context.tenantId,
      message.conversationId,
      context.userId,
      {
        messageId: message.id,
      },
    );

    // Clean up
    await db.destroy();

    return successResponse({ message });
  } catch (err: unknown) {
    console.error("[PATCH /api/messages/[id]] Error:", err);
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

    if (message === "Message not found") {
      return errorResponse("NOT_FOUND", "Message not found", 404);
    }

    return errorResponse("INTERNAL_ERROR", "Failed to edit message");
  } finally {
    await redis.quit();
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { context, redis } = await getApiContext();

  try {
    if (!context) {
      return unauthorizedResponse();
    }

    const { id } = await params;

    // Initialize service
    const db = await getDbClient();
    const service = new MessageService(db);

    // Get message first to get conversationId for broadcasting
    const message = await service.getById(
      context.tenantId,
      id as MessageId,
      context.userId,
    );

    if (!message) {
      await db.destroy();
      return errorResponse("NOT_FOUND", "Message not found", 404);
    }

    // Delete message
    await service.deleteMessage(
      context.tenantId,
      id as MessageId,
      context.userId,
    );

    // Broadcast event to SSE clients
    broadcastMessagingEvent(
      "message.deleted",
      context.tenantId,
      message.conversationId,
      context.userId,
      {
        messageId: id as MessageId,
      },
    );

    // Clean up
    await db.destroy();

    return successResponse({ ok: true });
  } catch (err: unknown) {
    console.error("[DELETE /api/messages/[id]] Error:", err);
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

    if (message === "Message not found") {
      return errorResponse("NOT_FOUND", "Message not found", 404);
    }

    return errorResponse("INTERNAL_ERROR", "Failed to delete message");
  } finally {
    await redis.quit();
  }
}
