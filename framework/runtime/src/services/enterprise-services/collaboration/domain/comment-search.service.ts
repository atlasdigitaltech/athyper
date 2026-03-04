/**
 * Comment Search Service
 *
 * Provides full-text search across entity comments and approval comments.
 * Uses PostgreSQL ILIKE for simple text matching.
 */

import type { Logger } from "../../../../kernel/logger.js";
import type { EntityComment } from "../types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Search options
 */
export interface CommentSearchOptions {
  entityType?: string;
  entityId?: string;
  commenterId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Search result
 */
export interface CommentSearchResult {
  comments: EntityComment[];
  total: number;
  query: string;
}

/**
 * Comment Search Service
 */
export class CommentSearchService {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly logger: Logger,
  ) {}

  /**
   * Search comments by text query
   *
   * Uses ILIKE for case-insensitive substring matching.
   *
   * @param tenantId - Tenant ID
   * @param query - Search query string
   * @param options - Search options
   * @returns Search results
   */
  async searchComments(
    tenantId: string,
    query: string,
    options?: CommentSearchOptions,
  ): Promise<CommentSearchResult> {
    const {
      limit = 50,
      offset = 0,
      entityType,
      entityId,
      commenterId,
    } = options ?? {};

    // Sanitize query (basic protection)
    const sanitizedQuery = query.trim();
    if (sanitizedQuery.length === 0) {
      return { comments: [], total: 0, query };
    }

    if (sanitizedQuery.length < 2) {
      throw new Error("Search query must be at least 2 characters");
    }

    const searchPattern = `%${sanitizedQuery}%`;

    // Build base query
    let selectQuery = this.db
      .selectFrom("collab.entity_comment")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("comment_text", "ilike", searchPattern)
      .where("deleted_at", "is", null);

    // Apply filters
    if (entityType) {
      selectQuery = selectQuery.where("entity_type", "=", entityType);
    }
    if (entityId) {
      selectQuery = selectQuery.where("entity_id", "=", entityId);
    }
    if (commenterId) {
      selectQuery = selectQuery.where("commenter_id", "=", commenterId);
    }

    // Get total count
    let countQuery = this.db
      .selectFrom("collab.entity_comment")
      .select(({ fn }) => fn.count<number>("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .where("comment_text", "ilike", searchPattern)
      .where("deleted_at", "is", null);

    if (entityType) {
      countQuery = countQuery.where("entity_type", "=", entityType);
    }
    if (entityId) {
      countQuery = countQuery.where("entity_id", "=", entityId);
    }
    if (commenterId) {
      countQuery = countQuery.where("commenter_id", "=", commenterId);
    }

    const [rows, countResult] = await Promise.all([
      selectQuery
        .orderBy("created_at", "desc")
        .limit(limit)
        .offset(offset)
        .execute(),
      countQuery.executeTakeFirst(),
    ]);

    const total = Number(countResult?.count ?? 0);

    const comments: EntityComment[] = rows.map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      commenterId: row.commenter_id,
      commentText: row.comment_text,
      parentCommentId: row.parent_comment_id ?? undefined,
      threadDepth: row.thread_depth,
      visibility: (row.visibility ?? "public") as
        | "public"
        | "internal"
        | "private",
      deletedAt: row.deleted_at ?? undefined,
      deletedBy: row.deleted_by ?? undefined,
      createdAt: row.created_at,
      createdBy: row.created_by,
      updatedAt: row.updated_at ?? undefined,
      updatedBy: row.updated_by ?? undefined,
    }));

    this.logger.info(
      {
        tenantId,
        query: sanitizedQuery,
        resultsFound: total,
      },
      "[collab] Comment search executed",
    );

    return {
      comments,
      total,
      query: sanitizedQuery,
    };
  }
}
