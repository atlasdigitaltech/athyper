/**
 * AttachmentRepo - Repository for attachment CRUD operations
 *
 * Handles:
 * - Basic CRUD with tenant isolation
 * - Version chain management (self-referential FK)
 * - SHA-256 deduplication checks
 * - Current version marking
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "doc.attachment" as keyof DB & string;

export interface CreateAttachmentParams {
  id: string;
  tenantId: string;
  ownerEntity: string;
  ownerEntityId: string;
  kind: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageBucket: string;
  storageKey: string;
  sha256?: string;
  originalFilename?: string;
  uploadedBy: string;
  shard?: number;
  versionNo?: number;
  isCurrent?: boolean;
  parentAttachmentId?: string;
}

export interface UpdateAttachmentParams {
  sha256?: string;
  replacedAt?: Date;
  replacedBy?: string;
  isCurrent?: boolean;
}

export interface Attachment {
  id: string;
  tenantId: string;
  ownerEntity: string;
  ownerEntityId: string;
  kind: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageBucket: string;
  storageKey: string;
  sha256: string | null;
  originalFilename: string | null;
  uploadedBy: string | null;
  shard: number | null;
  versionNo: number;
  isCurrent: boolean;
  parentAttachmentId: string | null;
  replacedAt: Date | null;
  replacedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AttachmentRepo {
  constructor(private db: Kysely<DB>) {}

  /**
   * Create new attachment record
   */
  async create(params: CreateAttachmentParams): Promise<Attachment> {
    const now = new Date();

    const result = await this.db
      .insertInto(TABLE as any)
      .values({
        id: params.id,
        tenant_id: params.tenantId,
        owner_entity: params.ownerEntity,
        owner_entity_id: params.ownerEntityId,
        kind: params.kind,
        file_name: params.fileName,
        content_type: params.contentType,
        size_bytes: String(params.sizeBytes),
        storage_bucket: params.storageBucket,
        storage_key: params.storageKey,
        sha256: params.sha256 ?? null,
        original_filename: params.originalFilename ?? params.fileName,
        uploaded_by: params.uploadedBy,
        shard: params.shard ?? null,
        version_no: params.versionNo ?? 1,
        is_current: params.isCurrent ?? true,
        parent_attachment_id: params.parentAttachmentId ?? null,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToAttachment(result);
  }

  /**
   * Get attachment by ID with tenant isolation
   */
  async getById(id: string, tenantId: string): Promise<Attachment | null> {
    const result = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    return result ? this.mapToAttachment(result) : null;
  }

  /**
   * Update attachment (typically for completing upload or versioning)
   */
  async update(
    id: string,
    tenantId: string,
    params: UpdateAttachmentParams,
  ): Promise<Attachment> {
    const updateData: any = {
      updated_at: new Date(),
    };

    if (params.sha256 !== undefined) updateData.sha256 = params.sha256;
    if (params.replacedAt !== undefined)
      updateData.replaced_at = params.replacedAt;
    if (params.replacedBy !== undefined)
      updateData.replaced_by = params.replacedBy;
    if (params.isCurrent !== undefined)
      updateData.is_current = params.isCurrent;

    const result = await this.db
      .updateTable(TABLE as any)
      .set(updateData)
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToAttachment(result);
  }

  /**
   * Delete attachment (soft delete by marking replaced)
   */
  async delete(id: string, tenantId: string, deletedBy: string): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set({
        is_current: false,
        replaced_at: new Date(),
        replaced_by: deletedBy,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .execute();
  }

  /**
   * Hard delete attachment (for cleanup)
   */
  async hardDelete(id: string, tenantId: string): Promise<void> {
    await this.db
      .deleteFrom(TABLE as any)
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .execute();
  }

  /**
   * List attachments for entity
   */
  async listByEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
    options?: { kind?: string; currentOnly?: boolean },
  ): Promise<Attachment[]> {
    let query = this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("owner_entity", "=", entityType)
      .where("owner_entity_id", "=", entityId);

    if (options?.kind) {
      query = query.where("kind", "=", options.kind);
    }

    if (options?.currentOnly !== false) {
      query = query.where("is_current", "=", true);
    }

    query = query.orderBy("created_at", "desc");

    const results = await query.execute();
    return results.map((r) => this.mapToAttachment(r));
  }

  /**
   * Get version chain for an attachment
   * Returns all versions (parent and all children) sorted by version number
   */
  async getVersionChain(
    documentId: string,
    tenantId: string,
  ): Promise<Attachment[]> {
    // First, get the document to check if it's a parent or child
    const doc = await this.getById(documentId, tenantId);
    if (!doc) return [];

    // Determine the root parent ID
    const rootId = doc.parentAttachmentId ?? doc.id;

    // Get all versions in the chain
    const results = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where((eb) =>
        eb.or([eb("id", "=", rootId), eb("parent_attachment_id", "=", rootId)]),
      )
      .orderBy("version_no", "asc")
      .execute();

    return results.map((r) => this.mapToAttachment(r));
  }

  /**
   * Check if SHA-256 hash already exists (for deduplication)
   */
  async findBySha256(
    sha256: string,
    tenantId: string,
  ): Promise<Attachment | null> {
    const result = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("sha256", "=", sha256)
      .where("is_current", "=", true)
      .executeTakeFirst();

    return result ? this.mapToAttachment(result) : null;
  }

  /**
   * Mark old version as not current
   */
  async markNotCurrent(
    id: string,
    tenantId: string,
    replacedBy: string,
  ): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set({
        is_current: false,
        replaced_at: new Date(),
        replaced_by: replacedBy,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .execute();
  }

  /**
   * Get current version of a document
   */
  async getCurrentVersion(
    documentId: string,
    tenantId: string,
  ): Promise<Attachment | null> {
    const doc = await this.getById(documentId, tenantId);
    if (!doc) return null;

    // If this document has no parent, check if it's current
    if (!doc.parentAttachmentId) {
      return doc.isCurrent ? doc : null;
    }

    // Find the current version in the chain
    const rootId = doc.parentAttachmentId;
    const result = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where((eb) =>
        eb.or([eb("id", "=", rootId), eb("parent_attachment_id", "=", rootId)]),
      )
      .where("is_current", "=", true)
      .executeTakeFirst();

    return result ? this.mapToAttachment(result) : null;
  }

  /**
   * List incomplete uploads (sha256 is null) older than threshold
   */
  async listIncompleteUploads(
    tenantId: string,
    olderThan: Date,
    limit: number,
  ): Promise<Attachment[]> {
    const results = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("sha256", "is", null)
      .where("created_at", "<", olderThan)
      .limit(limit)
      .execute();

    return results.map((r) => this.mapToAttachment(r));
  }

  /**
   * Map database row to Attachment domain object
   */
  private mapToAttachment(row: any): Attachment {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      ownerEntity: row.owner_entity,
      ownerEntityId: row.owner_entity_id,
      kind: row.kind,
      fileName: row.file_name,
      contentType: row.content_type,
      sizeBytes: Number(row.size_bytes),
      storageBucket: row.storage_bucket,
      storageKey: row.storage_key,
      sha256: row.sha256,
      originalFilename: row.original_filename,
      uploadedBy: row.uploaded_by,
      shard: row.shard,
      versionNo: row.version_no,
      isCurrent: row.is_current,
      parentAttachmentId: row.parent_attachment_id,
      replacedAt: row.replaced_at ? new Date(row.replaced_at) : null,
      replacedBy: row.replaced_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
