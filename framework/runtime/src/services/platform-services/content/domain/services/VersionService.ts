/**
 * VersionService - Document version management
 *
 * Responsibilities:
 * - Create new versions (upload new file, link to parent, mark old as not current)
 * - Get version history (traverse version chain)
 * - Restore previous version (create new version from old content)
 */

import { randomUUID } from "node:crypto";

import {
  storageKeyForDocument,
  calculateShard,
} from "../../storage/storage-key-builder.js";

import type { ContentAuditEmitter } from "./ContentAuditEmitter.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { DocumentKindType } from "../../domain/content-taxonomy.js";
import type { AttachmentRepo } from "../../persistence/AttachmentRepo.js";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";

export interface CreateVersionParams {
  documentId: string;
  tenantId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  actorId: string;
}

export interface RestoreVersionParams {
  documentId: string;
  versionNo: number;
  tenantId: string;
  actorId: string;
}

export class VersionService {
  private readonly bucket: string;
  private readonly presignedUrlExpiry: number;

  constructor(
    private attachmentRepo: AttachmentRepo,
    private storage: ObjectStorageAdapter,
    private audit: ContentAuditEmitter,
    private logger: Logger,
    config: {
      bucket: string;
      presignedUrlExpiry?: number;
    },
  ) {
    this.bucket = config.bucket;
    this.presignedUrlExpiry = config.presignedUrlExpiry ?? 3600;
  }

  /**
   * Initiate new version upload
   *
   * Flow:
   * 1. Get current version
   * 2. Calculate next version number
   * 3. Create new attachment record with parent_attachment_id
   * 4. Mark old version as not current
   * 5. Generate presigned URL for upload
   * 6. Emit audit event
   */
  async initiateNewVersion(params: CreateVersionParams) {
    this.logger.debug(
      { documentId: params.documentId },
      "[version:service] Initiating new version",
    );

    // 1. Get current version
    const currentVersion = await this.attachmentRepo.getById(
      params.documentId,
      params.tenantId,
    );
    if (!currentVersion) {
      throw new Error(`Document ${params.documentId} not found`);
    }

    // 2. Calculate next version number
    const versionChain = await this.attachmentRepo.getVersionChain(
      params.documentId,
      params.tenantId,
    );
    const maxVersionNo = Math.max(...versionChain.map((v) => v.versionNo));
    const nextVersionNo = maxVersionNo + 1;

    // Determine parent ID (root of chain)
    const parentId = currentVersion.parentAttachmentId ?? currentVersion.id;

    // 3. Create new attachment record
    const newVersionId = randomUUID();
    const createdAt = new Date();

    const storageKey = storageKeyForDocument({
      tenantId: params.tenantId,
      entity: currentVersion.ownerEntity,
      entityId: currentVersion.ownerEntityId,
      kind: currentVersion.kind as DocumentKindType,
      createdAt,
      fileId: newVersionId,
    });

    const shard = calculateShard(newVersionId);

    await this.attachmentRepo.create({
      id: newVersionId,
      tenantId: params.tenantId,
      ownerEntity: currentVersion.ownerEntity,
      ownerEntityId: currentVersion.ownerEntityId,
      kind: currentVersion.kind,
      fileName: params.fileName,
      contentType: params.contentType,
      sizeBytes: params.sizeBytes,
      storageBucket: this.bucket,
      storageKey,
      sha256: undefined, // Set on completion
      originalFilename: params.fileName,
      uploadedBy: params.actorId,
      shard,
      versionNo: nextVersionNo,
      isCurrent: true,
      parentAttachmentId: parentId,
    });

    // 4. Mark old version as not current
    await this.attachmentRepo.markNotCurrent(
      currentVersion.id,
      params.tenantId,
      params.actorId,
    );

    // 5. Generate presigned URL
    const presignedUrl = await (this.storage as any).generatePresignedPutUrl(
      this.bucket,
      storageKey,
      this.presignedUrlExpiry,
      {
        contentType: params.contentType,
        contentLength: params.sizeBytes,
      },
    );

    const expiresAt = new Date(Date.now() + this.presignedUrlExpiry * 1000);

    // 6. Emit audit event
    await this.audit.versionCreated({
      tenantId: params.tenantId,
      actorId: params.actorId,
      attachmentId: newVersionId,
      fileName: params.fileName,
      versionNo: nextVersionNo,
    });

    this.logger.info(
      { documentId: params.documentId, newVersionId, versionNo: nextVersionNo },
      "[version:service] New version initiated",
    );

    return {
      uploadId: newVersionId,
      attachmentId: newVersionId,
      versionNo: nextVersionNo,
      presignedUrl,
      expiresAt,
    };
  }

  /**
   * Get version history for a document
   */
  async getVersionHistory(documentId: string, tenantId: string) {
    this.logger.debug(
      { documentId },
      "[version:service] Getting version history",
    );

    const versions = await this.attachmentRepo.getVersionChain(
      documentId,
      tenantId,
    );

    return versions.map((v) => ({
      id: v.id,
      versionNo: v.versionNo,
      fileName: v.fileName,
      sizeBytes: v.sizeBytes,
      contentType: v.contentType,
      isCurrent: v.isCurrent,
      uploadedBy: v.uploadedBy,
      createdAt: v.createdAt,
      replacedAt: v.replacedAt,
      replacedBy: v.replacedBy,
      sha256: v.sha256,
    }));
  }

  /**
   * Restore previous version
   *
   * Flow:
   * 1. Get version chain
   * 2. Find version to restore
   * 3. Copy S3 object to new key
   * 4. Create new attachment record (new version) with copied content
   * 5. Mark current version as not current
   * 6. Emit audit event
   */
  async restoreVersion(params: RestoreVersionParams) {
    this.logger.debug(
      { documentId: params.documentId, versionNo: params.versionNo },
      "[version:service] Restoring version",
    );

    // 1. Get version chain
    const versions = await this.attachmentRepo.getVersionChain(
      params.documentId,
      params.tenantId,
    );
    if (versions.length === 0) {
      throw new Error(`Document ${params.documentId} not found`);
    }

    // 2. Find version to restore
    const versionToRestore = versions.find(
      (v) => v.versionNo === params.versionNo,
    );
    if (!versionToRestore) {
      throw new Error(`Version ${params.versionNo} not found`);
    }

    if (!versionToRestore.sha256) {
      throw new Error("Cannot restore incomplete version");
    }

    // Find current version
    const currentVersion = versions.find((v) => v.isCurrent);
    if (!currentVersion) {
      throw new Error("No current version found");
    }

    // 3. Calculate next version number
    const maxVersionNo = Math.max(...versions.map((v) => v.versionNo));
    const nextVersionNo = maxVersionNo + 1;

    // 4. Copy S3 object
    const newVersionId = randomUUID();
    const createdAt = new Date();

    const newStorageKey = storageKeyForDocument({
      tenantId: params.tenantId,
      entity: currentVersion.ownerEntity,
      entityId: currentVersion.ownerEntityId,
      kind: currentVersion.kind as DocumentKindType,
      createdAt,
      fileId: newVersionId,
    });

    await (this.storage as any).copy(
      versionToRestore.storageBucket,
      versionToRestore.storageKey,
      this.bucket,
      newStorageKey,
    );

    const shard = calculateShard(newVersionId);
    const parentId = currentVersion.parentAttachmentId ?? currentVersion.id;

    // 5. Create new attachment record
    await this.attachmentRepo.create({
      id: newVersionId,
      tenantId: params.tenantId,
      ownerEntity: currentVersion.ownerEntity,
      ownerEntityId: currentVersion.ownerEntityId,
      kind: currentVersion.kind,
      fileName: versionToRestore.fileName,
      contentType: versionToRestore.contentType,
      sizeBytes: versionToRestore.sizeBytes,
      storageBucket: this.bucket,
      storageKey: newStorageKey,
      sha256: versionToRestore.sha256 ?? undefined,
      originalFilename: versionToRestore.originalFilename ?? undefined,
      uploadedBy: params.actorId,
      shard,
      versionNo: nextVersionNo,
      isCurrent: true,
      parentAttachmentId: parentId,
    });

    // 6. Mark old current as not current
    await this.attachmentRepo.markNotCurrent(
      currentVersion.id,
      params.tenantId,
      params.actorId,
    );

    // 7. Emit audit event
    await this.audit.versionRestored({
      tenantId: params.tenantId,
      actorId: params.actorId,
      attachmentId: newVersionId,
      fileName: versionToRestore.fileName,
      versionNo: nextVersionNo,
      fromVersionNo: params.versionNo,
    } as any);

    this.logger.info(
      {
        documentId: params.documentId,
        restoredVersionNo: params.versionNo,
        newVersionNo: nextVersionNo,
      },
      "[version:service] Version restored",
    );

    return {
      attachmentId: newVersionId,
      versionNo: nextVersionNo,
    };
  }

  /**
   * Complete version upload (update SHA-256)
   */
  async completeVersionUpload(
    uploadId: string,
    tenantId: string,
    sha256: string,
    actorId: string,
  ) {
    const attachment = await this.attachmentRepo.getById(uploadId, tenantId);
    if (!attachment) {
      throw new Error(`Attachment ${uploadId} not found`);
    }

    if (attachment.sha256) {
      this.logger.warn({ uploadId }, "Version upload already completed");
      return;
    }

    await this.attachmentRepo.update(uploadId, tenantId, { sha256 });

    this.logger.info(
      { uploadId, sha256 },
      "[version:service] Version upload completed",
    );
  }
}
