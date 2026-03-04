/**
 * Attachment Link Service
 *
 * Handles linking file attachments to comments.
 * Updates doc.attachment table with comment_type and comment_id.
 */

import type { Logger } from "../../../../kernel/logger.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Attachment record from doc.attachment table
 */
export interface Attachment {
  id: string;
  tenantId: string;
  ownerEntity?: string;
  ownerEntityId?: string;
  fileName: string;
  contentType?: string;
  sizeBytes?: number;
  storageBucket: string;
  storageKey: string;
  isVirusScanned: boolean;
  retentionUntil?: string;
  metadata?: Record<string, unknown>;
  commentType?: string;
  commentId?: string;
  createdAt: string;
  createdBy: string;
}

/**
 * Raw database row type
 */
interface AttachmentRow {
  id: string;
  tenant_id: string;
  owner_entity?: string;
  owner_entity_id?: string;
  file_name: string;
  content_type?: string;
  size_bytes?: number;
  storage_bucket: string;
  storage_key: string;
  is_virus_scanned: boolean;
  retention_until?: string;
  metadata?: Record<string, unknown>;
  comment_type?: string;
  comment_id?: string;
  created_at: string;
  created_by: string;
}

/**
 * Valid comment types that can have attachments
 */
const VALID_COMMENT_TYPES = ["entity_comment", "approval_comment"] as const;
type CommentType = (typeof VALID_COMMENT_TYPES)[number];

/**
 * Attachment Link Service
 */
export class AttachmentLinkService {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly logger: Logger,
  ) {}

  /**
   * Link an attachment to a comment
   *
   * @param tenantId - Tenant ID
   * @param attachmentId - Attachment UUID
   * @param commentType - Type of comment (entity_comment or approval_comment)
   * @param commentId - Comment UUID
   * @throws Error if attachment not found or belongs to different tenant
   */
  async linkToComment(
    tenantId: string,
    attachmentId: string,
    commentType: CommentType,
    commentId: string,
  ): Promise<void> {
    // Validate comment type
    if (!VALID_COMMENT_TYPES.includes(commentType)) {
      throw new Error(
        `Invalid comment type: ${commentType}. Must be one of: ${VALID_COMMENT_TYPES.join(", ")}`,
      );
    }

    // Check if attachment exists and belongs to tenant
    const existing = await this.db
      .selectFrom("doc.attachment")
      .select(["id", "tenant_id"])
      .where("id", "=", attachmentId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!existing) {
      throw new Error(`Attachment ${attachmentId} not found or access denied`);
    }

    // Update attachment with comment link
    await this.db
      .updateTable("doc.attachment")
      .set({
        comment_type: commentType,
        comment_id: commentId,
      })
      .where("id", "=", attachmentId)
      .where("tenant_id", "=", tenantId)
      .execute();

    this.logger.info(
      {
        attachmentId,
        commentType,
        commentId,
        tenantId,
      },
      "[collab] Attachment linked to comment",
    );
  }

  /**
   * List attachments for a comment
   *
   * @param tenantId - Tenant ID
   * @param commentType - Type of comment
   * @param commentId - Comment UUID
   * @returns Array of attachments
   */
  async listByComment(
    tenantId: string,
    commentType: CommentType,
    commentId: string,
  ): Promise<Attachment[]> {
    const rows = await this.db
      .selectFrom("doc.attachment")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("comment_type", "=", commentType)
      .where("comment_id", "=", commentId)
      .orderBy("created_at", "asc")
      .execute();

    return rows.map((row) => this.mapRow(row as unknown as AttachmentRow));
  }

  /**
   * Unlink an attachment from a comment
   *
   * This sets comment_type and comment_id to null, effectively detaching
   * the file from the comment while preserving the attachment record.
   *
   * @param tenantId - Tenant ID
   * @param attachmentId - Attachment UUID
   */
  async unlinkFromComment(
    tenantId: string,
    attachmentId: string,
  ): Promise<void> {
    await this.db
      .updateTable("doc.attachment")
      .set({
        comment_type: null,
        comment_id: null,
      })
      .where("id", "=", attachmentId)
      .where("tenant_id", "=", tenantId)
      .execute();

    this.logger.info(
      {
        attachmentId,
        tenantId,
      },
      "[collab] Attachment unlinked from comment",
    );
  }

  /**
   * Get a single attachment by ID
   *
   * @param tenantId - Tenant ID
   * @param attachmentId - Attachment UUID
   * @returns Attachment or undefined if not found
   */
  async getById(
    tenantId: string,
    attachmentId: string,
  ): Promise<Attachment | undefined> {
    const row = await this.db
      .selectFrom("doc.attachment")
      .selectAll()
      .where("id", "=", attachmentId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    return row ? this.mapRow(row as unknown as AttachmentRow) : undefined;
  }

  /**
   * Map database row to domain object
   */
  private mapRow(row: AttachmentRow): Attachment {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      ownerEntity: row.owner_entity,
      ownerEntityId: row.owner_entity_id,
      fileName: row.file_name,
      contentType: row.content_type,
      sizeBytes: row.size_bytes ? Number(row.size_bytes) : undefined,
      storageBucket: row.storage_bucket,
      storageKey: row.storage_key,
      isVirusScanned: row.is_virus_scanned,
      retentionUntil: row.retention_until,
      metadata: row.metadata,
      commentType: row.comment_type,
      commentId: row.comment_id,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }
}
