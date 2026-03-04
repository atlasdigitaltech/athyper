/**
 * MultipartUploadService - S3 multipart upload management for files >100MB
 *
 * Flow:
 * 1. Client calls initiateMultipart → creates attachment + multipart_upload record
 * 2. Service generates presigned URLs for each part (1-10,000 parts, 5MB-5GB each)
 * 3. Client uploads parts directly to S3, collects ETags
 * 4. Client calls completeMultipart with ETags → S3 CompleteMultipartUpload
 * 5. Service updates attachment with final SHA-256
 *
 * S3 Limits:
 * - Min part size: 5MB (except last part)
 * - Max part size: 5GB
 * - Max parts: 10,000
 * - Max object size: 5TB
 */

import { validateFileSize, validateContentType } from "../../domain/content-taxonomy";
import { storageKeyForDocument } from "../../storage/storage-key-builder";

import type { ContentAuditEmitter } from "./ContentAuditEmitter";
import type { Logger } from "../../../../../kernel/logger";
import type { DocumentKindType } from "../../domain/content-taxonomy";
import type { AttachmentRepo } from "../../persistence/AttachmentRepo";
import type { MultipartUploadRepo } from "../../persistence/MultipartUploadRepo";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";



export interface InitiateMultipartParams {
  tenantId: string;
  entityType: string;
  entityId: string;
  kind: DocumentKindType;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  actorId: string;
}

export interface GetPartUploadUrlsParams {
  uploadId: string;
  tenantId: string;
  partNumbers: number[];
  actorId: string;
}

export interface CompleteMultipartParams {
  uploadId: string;
  tenantId: string;
  parts: Array<{ PartNumber: number; ETag: string }>;
  sha256: string;
  actorId: string;
}

export interface AbortMultipartParams {
  uploadId: string;
  tenantId: string;
  actorId: string;
}

const MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PART_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
const MAX_PARTS = 10000;
const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB
const DEFAULT_PART_SIZE = 10 * 1024 * 1024; // 10MB
const MULTIPART_EXPIRY_DAYS = 7;

export class MultipartUploadService {
  constructor(
    private multipartRepo: MultipartUploadRepo,
    private attachmentRepo: AttachmentRepo,
    private storage: ObjectStorageAdapter,
    private audit: ContentAuditEmitter,
    private logger: Logger,
  ) {}

  /**
   * Initiate multipart upload for large file
   */
  async initiateMultipart(params: InitiateMultipartParams) {
    const { tenantId, entityType, entityId, kind, fileName, contentType, sizeBytes, actorId } = params;

    // Validate file is large enough for multipart
    if (sizeBytes < MULTIPART_THRESHOLD) {
      throw new Error(
        `File too small for multipart upload (${sizeBytes} bytes). Use regular upload for files < ${MULTIPART_THRESHOLD} bytes`
      );
    }

    // Validate file size and content type
    const sizeValidation = validateFileSize(kind, sizeBytes);
    if (!sizeValidation.valid) {
      throw new Error(sizeValidation.error);
    }

    const typeValidation = validateContentType(kind, contentType);
    if (!typeValidation.valid) {
      throw new Error(typeValidation.error);
    }

    // Calculate total parts (using 10MB chunks)
    const totalParts = Math.ceil(sizeBytes / DEFAULT_PART_SIZE);
    if (totalParts > MAX_PARTS) {
      throw new Error(`File too large: requires ${totalParts} parts (max ${MAX_PARTS})`);
    }

    // Generate attachment ID and storage key
    const attachmentId = crypto.randomUUID();
    const createdAt = new Date();
    const storageKey = storageKeyForDocument({
      tenantId,
      entity: entityType,
      entityId,
      kind,
      createdAt,
      fileId: attachmentId,
    });

    // Create attachment record (status = uploading, sha256 = null)
    await this.attachmentRepo.create({
      id: attachmentId,
      tenantId,
      ownerEntity: entityType,
      ownerEntityId: entityId,
      kind,
      fileName,
      contentType,
      sizeBytes,
      storageBucket: (this.storage as any).bucket,
      storageKey,
      sha256: undefined, // Will be set on complete
      uploadedBy: actorId,
      versionNo: 1,
      isCurrent: true,
      parentAttachmentId: undefined,
    });

    // Initiate S3 multipart upload
    const s3UploadId = await (this.storage as any).initiateMultipartUpload(
      (this.storage as any).bucket,
      storageKey,
      contentType
    );

    // Create multipart upload tracking record
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + MULTIPART_EXPIRY_DAYS);

    const multipartUpload = await this.multipartRepo.create({
      tenantId,
      attachmentId,
      s3UploadId,
      totalParts,
      expiresAt,
    });

    // Emit audit event
    await (this.audit as any).multipartInitiated({
      tenantId,
      actorId,
      attachmentId,
      metadata: {
        fileName,
        sizeBytes,
        totalParts,
        s3UploadId,
      },
    });

    this.logger.info(
      { attachmentId, s3UploadId, totalParts, sizeBytes },
      "[MultipartUploadService] Multipart upload initiated"
    );

    return {
      uploadId: multipartUpload.id,
      attachmentId,
      s3UploadId,
      totalParts,
      expiresAt,
    };
  }

  /**
   * Generate presigned URLs for uploading specific parts
   */
  async getPartUploadUrls(params: GetPartUploadUrlsParams) {
    const { uploadId, tenantId, partNumbers, actorId } = params;

    // Get multipart upload record
    const upload = await this.multipartRepo.getById(uploadId, tenantId);
    if (!upload) {
      throw new Error(`Multipart upload not found: ${uploadId}`);
    }

    // Check not expired
    if (upload.expiresAt < new Date()) {
      throw new Error("Multipart upload expired");
    }

    // Check not already completed/aborted
    if (upload.status !== "initiated" && upload.status !== "uploading") {
      throw new Error(`Multipart upload already ${upload.status}`);
    }

    // Validate part numbers
    for (const partNumber of partNumbers) {
      if (partNumber < 1 || partNumber > upload.totalParts) {
        throw new Error(`Invalid part number: ${partNumber} (max ${upload.totalParts})`);
      }
    }

    // Get attachment for storage key
    const attachment = await this.attachmentRepo.getById(upload.attachmentId, tenantId);
    if (!attachment) {
      throw new Error(`Attachment not found: ${upload.attachmentId}`);
    }

    // Generate presigned URLs for each part
    const partUrls: Array<{ partNumber: number; uploadUrl: string }> = [];

    for (const partNumber of partNumbers) {
      const uploadUrl = await (this.storage as any).generatePresignedUploadPartUrl(
        (this.storage as any).bucket,
        attachment.storageKey,
        upload.s3UploadId,
        partNumber,
        3600 // 1 hour expiry
      );

      partUrls.push({ partNumber, uploadUrl });
    }

    // Update status to uploading
    if (upload.status === "initiated") {
      await this.multipartRepo.updateProgress(uploadId, tenantId, {
        completedParts: 0,
        partEtags: [],
        status: "uploading",
      });
    }

    this.logger.info(
      { uploadId, partCount: partNumbers.length },
      "[MultipartUploadService] Generated part upload URLs"
    );

    return {
      uploadId,
      partUrls,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };
  }

  /**
   * Complete multipart upload after all parts uploaded
   */
  async completeMultipart(params: CompleteMultipartParams) {
    const { uploadId, tenantId, parts, sha256, actorId } = params;

    // Get multipart upload record
    const upload = await this.multipartRepo.getById(uploadId, tenantId);
    if (!upload) {
      throw new Error(`Multipart upload not found: ${uploadId}`);
    }

    // Check not expired
    if (upload.expiresAt < new Date()) {
      throw new Error("Multipart upload expired");
    }

    // Check status
    if (upload.status !== "uploading") {
      throw new Error(`Multipart upload not in uploading state: ${upload.status}`);
    }

    // Validate all parts present
    if (parts.length !== upload.totalParts) {
      throw new Error(`Part count mismatch: expected ${upload.totalParts}, got ${parts.length}`);
    }

    // Sort parts by PartNumber
    const sortedParts = parts.slice().sort((a, b) => a.PartNumber - b.PartNumber);

    // Validate part numbers sequential
    for (let i = 0; i < sortedParts.length; i++) {
      if (sortedParts[i].PartNumber !== i + 1) {
        throw new Error(`Missing part number: ${i + 1}`);
      }
    }

    // Get attachment
    const attachment = await this.attachmentRepo.getById(upload.attachmentId, tenantId);
    if (!attachment) {
      throw new Error(`Attachment not found: ${upload.attachmentId}`);
    }

    try {
      // Complete S3 multipart upload
      await (this.storage as any).completeMultipartUpload(
        (this.storage as any).bucket,
        attachment.storageKey,
        upload.s3UploadId,
        sortedParts
      );

      // Update attachment with SHA-256
      await this.attachmentRepo.update(upload.attachmentId, tenantId, {
        sha256,
      });

      // Mark multipart upload completed
      await this.multipartRepo.markCompleted(uploadId, tenantId);

      // Emit audit event
      await (this.audit as any).multipartCompleted({
        tenantId,
        actorId,
        attachmentId: upload.attachmentId,
        metadata: {
          s3UploadId: upload.s3UploadId,
          totalParts: upload.totalParts,
          sha256,
        },
      });

      this.logger.info(
        { uploadId, attachmentId: upload.attachmentId, totalParts: upload.totalParts },
        "[MultipartUploadService] Multipart upload completed"
      );

      return {
        success: true,
        attachmentId: upload.attachmentId,
      };
    } catch (error: any) {
      // Mark upload as failed
      await this.multipartRepo.markFailed(uploadId, tenantId);

      this.logger.error(
        { uploadId, error: error.message },
        "[MultipartUploadService] Failed to complete multipart upload"
      );

      throw error;
    }
  }

  /**
   * Abort multipart upload and cleanup
   */
  async abortMultipart(params: AbortMultipartParams) {
    const { uploadId, tenantId, actorId } = params;

    // Get multipart upload record
    const upload = await this.multipartRepo.getById(uploadId, tenantId);
    if (!upload) {
      throw new Error(`Multipart upload not found: ${uploadId}`);
    }

    // Can't abort already completed
    if (upload.status === "completed") {
      throw new Error("Cannot abort completed upload");
    }

    // Get attachment
    const attachment = await this.attachmentRepo.getById(upload.attachmentId, tenantId);
    if (!attachment) {
      throw new Error(`Attachment not found: ${upload.attachmentId}`);
    }

    try {
      // Abort S3 multipart upload
      await (this.storage as any).abortMultipartUpload(
        (this.storage as any).bucket,
        attachment.storageKey,
        upload.s3UploadId
      );

      // Mark multipart upload aborted
      await this.multipartRepo.markAborted(uploadId, tenantId);

      // Delete attachment record
      await this.attachmentRepo.delete(upload.attachmentId, tenantId, actorId);

      // Emit audit event
      await (this.audit as any).multipartAborted({
        tenantId,
        actorId,
        attachmentId: upload.attachmentId,
        metadata: {
          s3UploadId: upload.s3UploadId,
          completedParts: upload.completedParts,
          totalParts: upload.totalParts,
        },
      });

      this.logger.info(
        { uploadId, attachmentId: upload.attachmentId },
        "[MultipartUploadService] Multipart upload aborted"
      );
    } catch (error: any) {
      this.logger.error(
        { uploadId, error: error.message },
        "[MultipartUploadService] Failed to abort multipart upload"
      );

      throw error;
    }
  }

  /**
   * List active uploads for a tenant (for monitoring)
   */
  async listActiveUploads(tenantId: string) {
    return this.multipartRepo.listActive(tenantId);
  }

  /**
   * Cleanup expired multipart uploads (background job)
   */
  async cleanupExpiredUploads(tenantId: string): Promise<number> {
    const now = new Date();
    const expired = await this.multipartRepo.listExpired(tenantId, now, 100);

    let cleanedCount = 0;

    for (const upload of expired) {
      try {
        // Get attachment
        const attachment = await this.attachmentRepo.getById(upload.attachmentId, tenantId);
        if (attachment) {
          // Abort S3 upload
          await (this.storage as any).abortMultipartUpload(
            (this.storage as any).bucket,
            attachment.storageKey,
            upload.s3UploadId
          );

          // Delete attachment
          await this.attachmentRepo.delete(upload.attachmentId, tenantId, "system");
        }

        // Mark as aborted
        await this.multipartRepo.markAborted(upload.id, tenantId);

        cleanedCount++;
      } catch (error: any) {
        this.logger.error(
          { uploadId: upload.id, error: error.message },
          "[MultipartUploadService] Failed to cleanup expired upload"
        );
      }
    }

    this.logger.info(
      { tenantId, cleanedCount },
      "[MultipartUploadService] Cleaned up expired multipart uploads"
    );

    return cleanedCount;
  }

  /**
   * Cleanup old completed/aborted records (retention)
   */
  async cleanupOldRecords(tenantId: string, olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const deleted = await this.multipartRepo.deleteOld(tenantId, cutoffDate, 1000);

    this.logger.info(
      { tenantId, olderThanDays, deletedCount: deleted },
      "[MultipartUploadService] Cleaned up old multipart records"
    );

    return deleted;
  }
}
