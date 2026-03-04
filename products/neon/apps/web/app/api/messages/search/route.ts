/**
 * GET /api/messages/search - Search messages using full-text search
 */

import { MessageService } from "@athyper/runtime/services/enterprise-services/in-app-messaging/domain/services/MessageService";

import type { DB } from "@athyper/adapter-db";
import type { ConversationId } from "@athyper/runtime/services/enterprise-services/in-app-messaging/domain/types";
import type { Kysely } from "kysely";

import {
  getApiContext,
  unauthorizedResponse,
  successResponse,
  errorResponse,
} from "@/lib/api-context";

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

export async function GET(req: Request): Promise<Response> {
  const { context, redis } = await getApiContext();

  try {
    if (!context) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") ?? "";
    const conversationId = searchParams.get("conversationId");
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    if (!query || query.trim().length === 0) {
      return successResponse({ results: [], count: 0 });
    }

    // Initialize service
    const db = await getDbClient();
    const service = new MessageService(db);

    // Search messages
    const results = await service.searchMessages(
      context.tenantId,
      context.userId,
      query,
      {
        conversationId: conversationId as ConversationId | undefined,
        limit,
        offset,
      },
    );

    // Get count
    const count = await service.countSearchResults(
      context.tenantId,
      context.userId,
      query,
      {
        conversationId: conversationId as ConversationId | undefined,
      },
    );

    // Clean up
    await db.destroy();

    return successResponse({ results, count });
  } catch (err: unknown) {
    console.error("[GET /api/messages/search] Error:", err);
    const errObj = err instanceof Error ? err : undefined;
    const message = errObj?.message ?? "Unknown error";

    // Handle access denied errors
    if (errObj?.name === "AccessDeniedError") {
      return errorResponse("ACCESS_DENIED", message, 403);
    }

    if (message === "Conversation not found") {
      return errorResponse("NOT_FOUND", message, 404);
    }

    return errorResponse("INTERNAL_ERROR", "Failed to search messages");
  } finally {
    await redis.quit();
  }
}
