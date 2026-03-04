/**
 * File Upload Service
 *
 * Handles file uploads to object storage (MinIO/S3) and creates attachment records.
 */

import { validateFile, type DocumentKindType } from "./content-taxonomy.js";

import type { Logger } from "../../../../kernel/logger.js";
import type { DB } from "@athyper/adapter-db";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";
import type { Kysely } from "kysely";


const TABLE = "doc.attachment" as keyof DB & string;

/**
 * Upload request
 */
export interface UploadRequest {
  tenantId: string;
  file: {
    name: string;
    content: Buffer | Uint8Array;
    contentType: string;
    size: number;
  };
  kind: DocumentKindType;
  ownerEntity?: string;
  ownerEntityId?: string;
  uploadedBy: string;
}

/**
 * Upload result
 */
export interface UploadResult {
  attachmentId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  storageBucket: string;
}

/**
 * File Upload Service
 */
export class FileUploadService {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly objectStorage: ObjectStorageAdapter,
    private readonly logger: Logger,
    private readonly config?: {
      defaultBucket?: string;
    }
  ) {}

  /**
   * Upload file to object storage and create attachment record
   */
  async upload(req: UploadRequest): Promise<UploadResult> {
    // Validate file
    const validation = validateFile(req.kind, req.file.size, req.file.contentType);
    if (!validation.valid) {
      throw new Error(validation.error || "File validation failed");
    }

    const attachmentId = crypto.randomUUID();
    const bucket = this.config?.defaultBucket || "attachments";

    // Generate storage key: tenant/kind/year/month/uuid-filename
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const sanitizedFileName = this.sanitizeFileName(req.file.name);
    const storageKey = `${req.tenantId}/${req.kind}/${year}/${month}/${attachmentId}-${sanitizedFileName}`;

    try {
      // Upload to object storage
      await this.objectStorage.put(storageKey, Buffer.from(req.file.content), {
        contentType: req.file.contentType,
        metadata: {
          tenantId: req.tenantId,
          attachmentId,
          originalFileName: req.file.name,
          kind: req.kind,
        },
      });

      // Create attachment record
      await this.db
        .insertInto(TABLE as any)
        .values({
          id: attachmentId,
          tenant_id: req.tenantId,
          owner_entity: req.ownerEntity || null,
          owner_entity_id: req.ownerEntityId || null,
          file_name: req.file.name,
          content_type: req.file.contentType,
          size_bytes: String(req.file.size),
          storage_bucket: bucket,
          storage_key: storageKey,
          is_virus_scanned: false, // TODO: Integrate virus scanning
          created_by: req.uploadedBy,
        } as any)
        .execute();

      this.logger.info(
        {
          attachmentId,
          tenantId: req.tenantId,
          fileName: req.file.name,
          size: req.file.size,
          kind: req.kind,
        },
        "[content] File uploaded successfully"
      );

      return {
        attachmentId,
        fileName: req.file.name,
        contentType: req.file.contentType,
        sizeBytes: req.file.size,
        storageKey,
        storageBucket: bucket,
      };
    } catch (err) {
      this.logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          fileName: req.file.name,
          tenantId: req.tenantId,
        },
        "[content] File upload failed"
      );
      throw new Error(`File upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  /**
   * Get download URL for an attachment
   */
  async getDownloadUrl(tenantId: string, attachmentId: string, expirySeconds: number = 3600): Promise<string> {
    // Get attachment record
    const attachment = await this.db
      .selectFrom(TABLE as any)
      .select(["storage_bucket", "storage_key"] as any)
      .where("id", "=", attachmentId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst() as any;

    if (!attachment) {
      throw new Error("Attachment not found");
    }

    // Generate presigned URL
    const url = await this.objectStorage.getPresignedUrl(
      attachment.storage_key,
      expirySeconds,
    );

    return url;
  }

  /**
   * Delete an attachment
   */
  async delete(tenantId: string, attachmentId: string): Promise<void> {
    // Get attachment record
    const attachment = await this.db
      .selectFrom(TABLE as any)
      .select(["storage_bucket", "storage_key"] as any)
      .where("id", "=", attachmentId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst() as any;

    if (!attachment) {
      throw new Error("Attachment not found");
    }

    try {
      // Delete from object storage
      await this.objectStorage.delete(attachment.storage_key);

      // Delete database record
      await this.db
        .deleteFrom(TABLE as any)
        .where("id", "=", attachmentId)
        .where("tenant_id", "=", tenantId)
        .execute();

      this.logger.info(
        {
          attachmentId,
          tenantId,
        },
        "[content] Attachment deleted"
      );
    } catch (err) {
      this.logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          attachmentId,
        },
        "[content] Attachment deletion failed"
      );
      throw new Error(`Attachment deletion failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  /**
   * Sanitize file name for storage
   */
  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9._-]/g, "_") // Replace invalid chars
      .replace(/_{2,}/g, "_") // Remove duplicate underscores
      .slice(0, 200); // Limit length
  }
}
