/**
 * Comment Draft Repository
 *
 * Kysely-based repository for collab.comment_draft table.
 * Handles auto-save draft operations.
 */

import type {
  CommentDraft,
  SaveDraftRequest,
  LoadDraftRequest,
} from "../types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Database row type (snake_case)
 */
interface CommentDraftRow {
  id: string;
  tenant_id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  parent_comment_id: string | null;
  draft_text: string;
  visibility: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Comment Draft Repository
 */
export class CommentDraftRepository {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Save or update a draft (upsert)
   *
   * Uses ON CONFLICT to update existing draft or insert new one.
   */
  async save(req: SaveDraftRequest): Promise<CommentDraft> {
    const now = new Date();
    const id = crypto.randomUUID();

    const row = await this.db
      .insertInto("collab.comment_draft")
      .values({
        id,
        tenant_id: req.tenantId,
        user_id: req.userId,
        entity_type: req.entityType,
        entity_id: req.entityId,
        parent_comment_id: req.parentCommentId ?? null,
        draft_text: req.draftText,
        visibility: req.visibility ?? "public",
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc
          .columns([
            "tenant_id",
            "user_id",
            "entity_type",
            "entity_id",
            "parent_comment_id",
          ])
          .doUpdateSet({
            draft_text: req.draftText,
            visibility: req.visibility ?? "public",
            updated_at: now,
          }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(row as CommentDraftRow);
  }

  /**
   * Load a draft
   */
  async load(req: LoadDraftRequest): Promise<CommentDraft | undefined> {
    const row = await this.db
      .selectFrom("collab.comment_draft")
      .selectAll()
      .where("tenant_id", "=", req.tenantId)
      .where("user_id", "=", req.userId)
      .where("entity_type", "=", req.entityType)
      .where("entity_id", "=", req.entityId)
      .where((eb) =>
        req.parentCommentId
          ? eb("parent_comment_id", "=", req.parentCommentId)
          : eb("parent_comment_id", "is", null),
      )
      .executeTakeFirst();

    if (!row) return undefined;

    return this.mapRow(row as CommentDraftRow);
  }

  /**
   * Delete a draft
   */
  async delete(req: LoadDraftRequest): Promise<void> {
    await this.db
      .deleteFrom("collab.comment_draft")
      .where("tenant_id", "=", req.tenantId)
      .where("user_id", "=", req.userId)
      .where("entity_type", "=", req.entityType)
      .where("entity_id", "=", req.entityId)
      .where((eb) =>
        req.parentCommentId
          ? eb("parent_comment_id", "=", req.parentCommentId)
          : eb("parent_comment_id", "is", null),
      )
      .execute();
  }

  /**
   * List user's recent drafts
   */
  async listByUser(
    tenantId: string,
    userId: string,
    limit: number = 10,
  ): Promise<CommentDraft[]> {
    const rows = await this.db
      .selectFrom("collab.comment_draft")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("user_id", "=", userId)
      .orderBy("updated_at", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => this.mapRow(row as CommentDraftRow));
  }

  /**
   * Delete old drafts (cleanup job)
   *
   * Deletes drafts older than the specified number of days.
   */
  async deleteOldDrafts(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.db
      .deleteFrom("collab.comment_draft")
      .where("updated_at", "<", cutoffDate)
      .execute();

    // Return number of deleted rows
    return Number(result[0]?.numDeletedRows ?? 0);
  }

  /**
   * Map database row to domain model
   */
  private mapRow(row: CommentDraftRow): CommentDraft {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      parentCommentId: row.parent_comment_id ?? undefined,
      draftText: row.draft_text,
      visibility: row.visibility as "public" | "internal" | "private",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
