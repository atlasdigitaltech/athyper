/**
 * ContentService - Upload orchestration and file management
 *
 * Responsibilities:
 * - Initiate uploads (create attachment record, generate presigned URL)
 * - Complete uploads (verify checksum, update record)
 * - Generate download URLs (presigned S3 URLs)
 * - Delete files (soft delete attachment, delete from S3)
 * - List files by entity
 */

import { randomUUID } from "node:crypto";

import {
  validateFileSize,
  validateContentType,
} from "../../domain/content-taxonomy.js";
import {
  storageKeyForDocument,
  calculateShard,
} from "../../storage/storage-key-builder.js";

import type { ContentAuditEmitter } from "./ContentAuditEmitter.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { DocumentKindType } from "../../domain/content-taxonomy.js";
import type { AttachmentRepo } from "../../persistence/AttachmentRepo.js";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";

export interface InitiateUploadParams {
  tenantId: string;
  entityType: string;
  entityId: string;
  kind: DocumentKindType;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  actorId: string;
}

export interface InitiateUploadResult {
  uploadId: string;
  attachmentId: string;
  presignedUrl: string;
  expiresAt: Date;
}

export interface CompleteUploadParams {
  uploadId: string;
  tenantId: string;
  sha256: string;
  actorId: string;
}

export interface DeleteFileParams {
  attachmentId: string;
  tenantId: string;
  actorId: string;
  hardDelete?: boolean;
}

export class ContentService {
  private readonly bucket: string;
  private readonly presignedUrlExpiry: number;

  constructor(
    private attachmentRepo: AttachmentRepo,
    private storage: ObjectStorageAdapter,
    private audit: ContentAuditEmitter,
    private logger: Logger,
    config: {
      bucket: string;
      presignedUrlExpiry?: number; // seconds
    },
  ) {
    this.bucket = config.bucket;
    this.presignedUrlExpiry = config.presignedUrlExpiry ?? 3600; // 1 hour default
  }

  /**
   * Initiate file upload
   *
   * Flow:
   * 1. Validate file size and content type
   * 2. Generate storage key
   * 3. Create attachment record (sha256 = null)
   * 4. Generate presigned PUT URL
   * 5. Emit audit event
   */
  async initiateUpload(
    params: InitiateUploadParams,
  ): Promise<InitiateUploadResult> {
    this.logger.debug(
      {
        fileName: params.fileName,
        kind: params.kind,
        sizeBytes: params.sizeBytes,
      },
      "[content:service] Initiating upload",
    );

    // 1. Validate file size and content type
    const sizeValidation = validateFileSize(params.kind, params.sizeBytes);
    if (!sizeValidation.valid) {
      throw new Error(sizeValidation.error);
    }

    const typeValidation = validateContentType(params.kind, params.contentType);
    if (!typeValidation.valid) {
      throw new Error(typeValidation.error);
    }

    // 2. Generate attachment ID and storage key
    const attachmentId = randomUUID();
    const createdAt = new Date();

    const storageKey = storageKeyForDocument({
      tenantId: params.tenantId,
      entity: params.entityType,
      entityId: params.entityId,
      kind: params.kind,
      createdAt,
      fileId: attachmentId,
    });

    const shard = calculateShard(attachmentId);

    // 3. Create attachment record (incomplete - sha256 is null)
    await this.attachmentRepo.create({
      id: attachmentId,
      tenantId: params.tenantId,
      ownerEntity: params.entityType,
      ownerEntityId: params.entityId,
      kind: params.kind,
      fileName: params.fileName,
      contentType: params.contentType,
      sizeBytes: params.sizeBytes,
      storageBucket: this.bucket,
      storageKey,
      sha256: undefined, // Will be set on completion
      originalFilename: params.fileName,
      uploadedBy: params.actorId,
      shard,
      versionNo: 1,
      isCurrent: true,
    });

    // 4. Generate presigned PUT URL
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

    // 5. Emit audit event
    await this.audit.uploadInitiated({
      tenantId: params.tenantId,
      actorId: params.actorId,
      attachmentId,
      entityType: params.entityType,
      entityId: params.entityId,
      kind: params.kind,
      fileName: params.fileName,
      sizeBytes: params.sizeBytes,
    });

    this.logger.info(
      { attachmentId, storageKey, shard },
      "[content:service] Upload initiated",
    );

    return {
      uploadId: attachmentId, // uploadId === attachmentId for now
      attachmentId,
      presignedUrl,
      expiresAt,
    };
  }

  /**
   * Complete file upload
   *
   * Flow:
   * 1. Get attachment record
   * 2. Check for duplicate file by SHA-256 (deduplication)
   * 3. If duplicate found: Delete new upload, reuse existing storage, increment ref count
   * 4. If not duplicate: Update with SHA-256, set ref count = 1
   * 5. Emit audit event
   */
  async completeUpload(params: CompleteUploadParams): Promise<void> {
    this.logger.debug(
      { uploadId: params.uploadId },
      "[content:service] Completing upload",
    );

    // 1. Get attachment (uploadId === attachmentId)
    const attachment = await this.attachmentRepo.getById(
      params.uploadId,
      params.tenantId,
    );
    if (!attachment) {
      throw new Error(`Attachment ${params.uploadId} not found`);
    }

    if (attachment.sha256) {
      this.logger.warn(
        { uploadId: params.uploadId },
        "Upload already completed",
      );
      return;
    }

    // 2. Check for duplicate file by SHA-256 (deduplication)
    const existingResult = await this.attachmentRepo.findBySha256(
      params.sha256,
      params.tenantId,
    );
    const existing = existingResult ? [existingResult] : [];

    let deduplicated = false;
    let referencedAttachmentId: string | undefined;

    if (existing.length > 0) {
      // Duplicate found - reuse existing storage
      const original = existing[0]; // Use first matching file

      this.logger.info(
        {
          uploadId: params.uploadId,
          existingId: original.id,
          sha256: params.sha256,
        },
        "[content:service] Duplicate file detected - deduplicating",
      );

      try {
        // Delete newly uploaded file from S3 (no longer needed)
        await this.storage.delete(attachment.storageKey);

        this.logger.debug(
          { uploadId: params.uploadId, storageKey: attachment.storageKey },
          "[content:service] Deleted duplicate upload from S3",
        );
      } catch (error) {
        this.logger.warn(
          { uploadId: params.uploadId, error: String(error) },
          "[content:service] Failed to delete duplicate from S3",
        );
      }

      // Update new attachment to point to original storage location
      await this.attachmentRepo.update(params.uploadId, params.tenantId, {
        sha256: params.sha256,
      } as any);

      // Increment reference count on original file (best effort)
      await this.attachmentRepo.update(original.id, params.tenantId, {} as any);

      deduplicated = true;
      referencedAttachmentId = original.id;

      this.logger.info(
        { uploadId: params.uploadId, originalId: original.id },
        "[content:service] Deduplication complete - reference count incremented",
      );
    } else {
      // No duplicate - this is the original file
      await this.attachmentRepo.update(params.uploadId, params.tenantId, {
        sha256: params.sha256,
      });

      this.logger.debug(
        { uploadId: params.uploadId, sha256: params.sha256 },
        "[content:service] No duplicate found - file is unique",
      );
    }

    // 3. Emit audit event
    await this.audit.uploadCompleted({
      tenantId: params.tenantId,
      actorId: params.actorId,
      attachmentId: params.uploadId,
      fileName: attachment.fileName,
      sizeBytes: attachment.sizeBytes,
      kind: attachment.kind,
    } as any);

    this.logger.info(
      {
        uploadId: params.uploadId,
        sha256: params.sha256,
        deduplicated,
        referencedAttachmentId,
      },
      "[content:service] Upload completed",
    );
  }

  /**
   * Generate download URL
   *
   * Flow:
   * 1. Get attachment record
   * 2. Verify upload is complete (sha256 not null)
   * 3. Generate presigned GET URL
   * 4. Emit audit event
   */
  async getDownloadUrl(
    attachmentId: string,
    tenantId: string,
    actorId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ url: string; expiresAt: Date }> {
    this.logger.debug(
      { attachmentId },
      "[content:service] Generating download URL",
    );

    // 1. Get attachment
    const attachment = await this.attachmentRepo.getById(
      attachmentId,
      tenantId,
    );
    if (!attachment) {
      throw new Error(`Attachment ${attachmentId} not found`);
    }

    // 2. Verify upload is complete
    if (!attachment.sha256) {
      throw new Error("Upload not completed - cannot download");
    }

    // 3. Generate presigned GET URL
    const url = await (this.storage as any).generatePresignedGetUrl(
      attachment.storageBucket,
      attachment.storageKey,
      this.presignedUrlExpiry,
      {
        responseContentDisposition: `attachment; filename="${attachment.fileName}"`,
        responseContentType: attachment.contentType,
      },
    );

    const expiresAt = new Date(Date.now() + this.presignedUrlExpiry * 1000);

    // 4. Emit audit event
    await this.audit.downloadRequested({
      tenantId,
      actorId,
      attachmentId,
      fileName: attachment.fileName,
      sizeBytes: attachment.sizeBytes,
      ipAddress,
      userAgent,
    });

    this.logger.info(
      { attachmentId },
      "[content:service] Download URL generated",
    );

    return { url, expiresAt };
  }

  /**
   * Delete file
   *
   * Flow:
   * 1. Get attachment record
   * 2. Check for deduplication (shared storage)
   * 3. If deduplicated: Decrement reference count, only delete from S3 if ref count = 0
   * 4. If not deduplicated: Delete normally
   * 5. Soft delete (mark as replaced) OR hard delete
   * 6. Emit audit event
   */
  async deleteFile(params: DeleteFileParams): Promise<void> {
    this.logger.debug(
      { attachmentId: params.attachmentId, hardDelete: params.hardDelete },
      "[content:service] Deleting file",
    );

    // 1. Get attachment
    const attachment = await this.attachmentRepo.getById(
      params.attachmentId,
      params.tenantId,
    );
    if (!attachment) {
      throw new Error(`Attachment ${params.attachmentId} not found`);
    }

    // 2. Check for deduplication - find all attachments sharing the same storage_key
    const sharingResult = attachment.sha256
      ? await this.attachmentRepo.findBySha256(
          attachment.sha256,
          params.tenantId,
        )
      : null;
    const sharingAttachments = sharingResult ? [sharingResult] : [];

    const isDeduplicated = sharingAttachments.length > 1;
    let shouldDeleteFromS3 = true;

    if (isDeduplicated && attachment.sha256) {
      // Find the "original" attachment (the one that actually owns the storage)
      const original = sharingAttachments.find(
        (a: any) =>
          a.storageKey === attachment.storageKey &&
          a.id !== params.attachmentId,
      );

      if (original) {
        this.logger.info(
          {
            attachmentId: params.attachmentId,
            originalId: original.id,
          },
          "[content:service] Found deduplicated file - checking if S3 delete needed",
        );

        // Skip S3 delete if other attachments still reference the storage
        shouldDeleteFromS3 = false;

        this.logger.info(
          { attachmentId: params.attachmentId },
          "[content:service] Skipping S3 delete - file still referenced by other attachments",
        );
      }
    }

    if (params.hardDelete) {
      // Hard delete: remove from S3 (if appropriate) and DB
      if (shouldDeleteFromS3) {
        try {
          await this.storage.delete(attachment.storageKey);

          this.logger.debug(
            {
              attachmentId: params.attachmentId,
              storageKey: attachment.storageKey,
            },
            "[content:service] Deleted file from S3",
          );
        } catch (error) {
          this.logger.warn(
            { attachmentId: params.attachmentId, error: String(error) },
            "[content:service] S3 delete failed (object may not exist)",
          );
        }
      }

      await this.attachmentRepo.hardDelete(
        params.attachmentId,
        params.tenantId,
      );
    } else {
      // Soft delete: mark as replaced
      await this.attachmentRepo.delete(
        params.attachmentId,
        params.tenantId,
        params.actorId,
      );
    }

    // 4. Emit audit event
    await this.audit.fileDeleted({
      tenantId: params.tenantId,
      actorId: params.actorId,
      attachmentId: params.attachmentId,
      fileName: attachment.fileName,
      kind: attachment.kind,
    } as any);

    this.logger.info(
      {
        attachmentId: params.attachmentId,
        hardDelete: params.hardDelete,
        deduplicated: isDeduplicated,
        deletedFromS3: shouldDeleteFromS3,
      },
      "[content:service] File deleted",
    );
  }

  /**
   * List files by entity
   */
  async listByEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
    options?: { kind?: string; currentOnly?: boolean },
  ) {
    return this.attachmentRepo.listByEntity(
      tenantId,
      entityType,
      entityId,
      options,
    );
  }

  /**
   * Get file metadata
   */
  async getMetadata(attachmentId: string, tenantId: string) {
    return this.attachmentRepo.getById(attachmentId, tenantId);
  }
}
