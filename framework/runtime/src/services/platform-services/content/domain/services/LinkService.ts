/**
 * LinkService - Entity-document link management
 *
 * Responsibilities:
 * - Link documents to entities (many-to-many)
 * - Unlink documents from entities
 * - List linked entities for document
 * - List linked documents for entity
 */

import type { ContentAuditEmitter } from "./ContentAuditEmitter.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { AttachmentRepo } from "../../persistence/AttachmentRepo.js";
import type { EntityDocumentLinkRepo } from "../../persistence/EntityDocumentLinkRepo.js";

export interface LinkDocumentParams {
  tenantId: string;
  attachmentId: string;
  entityType: string;
  entityId: string;
  linkKind: string;
  displayOrder?: number;
  metadata?: Record<string, unknown>;
  actorId: string;
}

export interface UnlinkDocumentParams {
  linkId: string;
  tenantId: string;
  actorId: string;
}

export class LinkService {
  constructor(
    private linkRepo: EntityDocumentLinkRepo,
    private attachmentRepo: AttachmentRepo,
    private audit: ContentAuditEmitter,
    private logger: Logger,
  ) {}

  /**
   * Link document to entity
   *
   * Flow:
   * 1. Verify attachment exists
   * 2. Check if link already exists
   * 3. Create link
   * 4. Emit audit event
   */
  async linkDocument(params: LinkDocumentParams) {
    this.logger.debug(
      {
        attachmentId: params.attachmentId,
        entityType: params.entityType,
        entityId: params.entityId,
      },
      "[link:service] Linking document",
    );

    // 1. Verify attachment exists
    const attachment = await this.attachmentRepo.getById(params.attachmentId, params.tenantId);
    if (!attachment) {
      throw new Error(`Attachment ${params.attachmentId} not found`);
    }

    // 2. Check if link already exists
    const exists = await this.linkRepo.exists(
      params.tenantId,
      params.entityType,
      params.entityId,
      params.attachmentId,
    );

    if (exists) {
      throw new Error(
        `Document ${params.attachmentId} already linked to ${params.entityType}:${params.entityId}`,
      );
    }

    // 3. Create link
    const link = await this.linkRepo.create({
      tenantId: params.tenantId,
      entityType: params.entityType,
      entityId: params.entityId,
      attachmentId: params.attachmentId,
      linkKind: params.linkKind,
      displayOrder: params.displayOrder,
      metadata: params.metadata,
      createdBy: params.actorId,
    });

    // 4. Emit audit event
    await this.audit.linkCreated({
      tenantId: params.tenantId,
      actorId: params.actorId,
      attachmentId: params.attachmentId,
      entityType: params.entityType,
      entityId: params.entityId,
      linkKind: params.linkKind,
    } as any);

    this.logger.info(
      { linkId: link.id, attachmentId: params.attachmentId },
      "[link:service] Document linked",
    );

    return link;
  }

  /**
   * Unlink document from entity
   *
   * Flow:
   * 1. Get link
   * 2. Delete link
   * 3. Emit audit event
   */
  async unlinkDocument(params: UnlinkDocumentParams) {
    this.logger.debug({ linkId: params.linkId }, "[link:service] Unlinking document");

    // 1. Get link
    const link = await this.linkRepo.getById(params.linkId, params.tenantId);
    if (!link) {
      throw new Error(`Link ${params.linkId} not found`);
    }

    // 2. Delete link
    await this.linkRepo.delete(params.linkId, params.tenantId);

    // 3. Emit audit event
    await this.audit.linkRemoved({
      tenantId: params.tenantId,
      actorId: params.actorId,
      attachmentId: link.attachmentId,
      entityType: link.entityType,
      entityId: link.entityId,
    });

    this.logger.info(
      { linkId: params.linkId, attachmentId: link.attachmentId },
      "[link:service] Document unlinked",
    );
  }

  /**
   * List entities linked to a document
   */
  async getLinkedEntities(attachmentId: string, tenantId: string) {
    this.logger.debug({ attachmentId }, "[link:service] Getting linked entities");

    return this.linkRepo.listByAttachment(tenantId, attachmentId);
  }

  /**
   * List documents linked to an entity
   */
  async getLinkedDocuments(
    tenantId: string,
    entityType: string,
    entityId: string,
    options?: { linkKind?: string },
  ) {
    this.logger.debug({ entityType, entityId }, "[link:service] Getting linked documents");

    return this.linkRepo.listByEntity(tenantId, entityType, entityId, options);
  }

  /**
   * Update link metadata or display order
   */
  async updateLink(
    linkId: string,
    tenantId: string,
    params: { displayOrder?: number; metadata?: Record<string, unknown> },
  ) {
    return this.linkRepo.update(linkId, tenantId, params);
  }

  /**
   * Count linked documents for an entity
   */
  async countLinkedDocuments(tenantId: string, entityType: string, entityId: string) {
    return this.linkRepo.countByEntity(tenantId, entityType, entityId);
  }
}
