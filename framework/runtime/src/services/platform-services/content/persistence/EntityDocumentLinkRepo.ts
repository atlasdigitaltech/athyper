/**
 * EntityDocumentLinkRepo - Repository for entity-document many-to-many relationships
 *
 * Handles:
 * - Linking documents to entities (cross-entity references)
 * - Link kinds (primary, related, supporting, compliance, audit)
 * - Display ordering
 * - Metadata storage (JSONB)
 */

import type { Kysely } from "kysely";

export interface CreateLinkParams {
  tenantId: string;
  entityType: string;
  entityId: string;
  attachmentId: string;
  linkKind: string;
  displayOrder?: number;
  metadata?: Record<string, unknown>;
  createdBy: string;
}

export interface EntityDocumentLink {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  attachmentId: string;
  linkKind: string;
  displayOrder: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  createdBy: string;
}

export class EntityDocumentLinkRepo {
  constructor(private db: Kysely<any>) {}

  /**
   * Create a link between document and entity
   */
  async create(params: CreateLinkParams): Promise<EntityDocumentLink> {
    const result = await this.db
      .insertInto("core.entity_document_link as link")
      .values({
        tenant_id: params.tenantId,
        entity_type: params.entityType,
        entity_id: params.entityId,
        attachment_id: params.attachmentId,
        link_kind: params.linkKind,
        display_order: params.displayOrder ?? 0,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        created_by: params.createdBy,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToLink(result);
  }

  /**
   * Get link by ID
   */
  async getById(id: string, tenantId: string): Promise<EntityDocumentLink | null> {
    const result = await this.db
      .selectFrom("core.entity_document_link as link")
      .selectAll()
      .where("link.id", "=", id)
      .where("link.tenant_id", "=", tenantId)
      .executeTakeFirst();

    return result ? this.mapToLink(result) : null;
  }

  /**
   * Delete link
   */
  async delete(id: string, tenantId: string): Promise<void> {
    await this.db
      .deleteFrom("core.entity_document_link as link")
      .where("link.id", "=", id)
      .where("link.tenant_id", "=", tenantId)
      .execute();
  }

  /**
   * List all links for a specific entity
   * Returns documents linked to this entity
   */
  async listByEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
    options?: { linkKind?: string },
  ): Promise<EntityDocumentLink[]> {
    let query = this.db
      .selectFrom("core.entity_document_link as link")
      .selectAll()
      .where("link.tenant_id", "=", tenantId)
      .where("link.entity_type", "=", entityType)
      .where("link.entity_id", "=", entityId);

    if (options?.linkKind) {
      query = query.where("link.link_kind", "=", options.linkKind);
    }

    query = query
      .orderBy("link.display_order", "asc")
      .orderBy("link.created_at", "desc");

    const results = await query.execute();
    return results.map((r) => this.mapToLink(r));
  }

  /**
   * List all entities linked to a specific document
   * Returns entities this document is linked to
   */
  async listByAttachment(
    tenantId: string,
    attachmentId: string,
  ): Promise<EntityDocumentLink[]> {
    const results = await this.db
      .selectFrom("core.entity_document_link as link")
      .selectAll()
      .where("link.tenant_id", "=", tenantId)
      .where("link.attachment_id", "=", attachmentId)
      .orderBy("link.created_at", "desc")
      .execute();

    return results.map((r) => this.mapToLink(r));
  }

  /**
   * Check if link already exists
   */
  async exists(
    tenantId: string,
    entityType: string,
    entityId: string,
    attachmentId: string,
  ): Promise<boolean> {
    const result = await this.db
      .selectFrom("core.entity_document_link as link")
      .select("link.id")
      .where("link.tenant_id", "=", tenantId)
      .where("link.entity_type", "=", entityType)
      .where("link.entity_id", "=", entityId)
      .where("link.attachment_id", "=", attachmentId)
      .executeTakeFirst();

    return result !== undefined;
  }

  /**
   * Update link metadata or display order
   */
  async update(
    id: string,
    tenantId: string,
    params: { displayOrder?: number; metadata?: Record<string, unknown> },
  ): Promise<EntityDocumentLink> {
    const updateData: any = {};

    if (params.displayOrder !== undefined) {
      updateData.display_order = params.displayOrder;
    }

    if (params.metadata !== undefined) {
      updateData.metadata = JSON.stringify(params.metadata);
    }

    const result = await this.db
      .updateTable("core.entity_document_link as link")
      .set(updateData)
      .where("link.id", "=", id)
      .where("link.tenant_id", "=", tenantId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToLink(result);
  }

  /**
   * Delete all links for an attachment (when deleting document)
   */
  async deleteByAttachment(tenantId: string, attachmentId: string): Promise<void> {
    await this.db
      .deleteFrom("core.entity_document_link as link")
      .where("link.tenant_id", "=", tenantId)
      .where("link.attachment_id", "=", attachmentId)
      .execute();
  }

  /**
   * Count links for an entity
   */
  async countByEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<number> {
    const result = await this.db
      .selectFrom("core.entity_document_link as link")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("link.tenant_id", "=", tenantId)
      .where("link.entity_type", "=", entityType)
      .where("link.entity_id", "=", entityId)
      .executeTakeFirst();

    return result?.count ?? 0;
  }

  /**
   * Map database row to EntityDocumentLink domain object
   */
  private mapToLink(row: any): EntityDocumentLink {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      attachmentId: row.attachment_id,
      linkKind: row.link_kind,
      displayOrder: row.display_order,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
    };
  }
}
