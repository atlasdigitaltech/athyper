/**
 * MultipartUploadRepo - Repository for tracking S3 multipart uploads
 *
 * Design:
 * - Tracks upload progress (parts completed)
 * - Stores ETags for completion
 * - Handles expiration (S3 multipart uploads expire after 7 days)
 * - Supports abort for cleanup
 */

import type { Kysely } from "kysely";

const TABLE = "doc.multipart_upload";

export interface CreateMultipartUploadParams {
  tenantId: string;
  attachmentId: string;
  s3UploadId: string;
  totalParts: number;
  expiresAt: Date;
}

export interface UpdateMultipartProgressParams {
  completedParts: number;
  partEtags: Array<{ PartNumber: number; ETag: string }>;
  status?: "initiated" | "uploading" | "completed" | "aborted" | "failed";
}

export interface MultipartUpload {
  id: string;
  tenantId: string;
  attachmentId: string;
  s3UploadId: string;
  totalParts: number;
  completedParts: number;
  partEtags: Array<{ PartNumber: number; ETag: string }> | null;
  status: "initiated" | "uploading" | "completed" | "aborted" | "failed";
  initiatedAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
}

export class MultipartUploadRepo {
  constructor(private db: Kysely<any>) {}

  /**
   * Create multipart upload tracking record
   */
  async create(params: CreateMultipartUploadParams): Promise<MultipartUpload> {
    const result = await this.db
      .insertInto(TABLE as any)
      .values({
        tenant_id: params.tenantId,
        attachment_id: params.attachmentId,
        s3_upload_id: params.s3UploadId,
        total_parts: params.totalParts,
        completed_parts: 0,
        part_etags: null,
        status: "initiated",
        initiated_at: new Date(),
        expires_at: params.expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToMultipartUpload(result);
  }

  /**
   * Get by ID
   */
  async getById(id: string, tenantId: string): Promise<MultipartUpload | null> {
    const result = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    return result ? this.mapToMultipartUpload(result) : null;
  }

  /**
   * Get by S3 upload ID
   */
  async getByS3UploadId(s3UploadId: string): Promise<MultipartUpload | null> {
    const result = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("s3_upload_id", "=", s3UploadId)
      .executeTakeFirst();

    return result ? this.mapToMultipartUpload(result) : null;
  }

  /**
   * Get by attachment ID
   */
  async getByAttachment(
    attachmentId: string,
    tenantId: string,
  ): Promise<MultipartUpload | null> {
    const result = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("attachment_id", "=", attachmentId)
      .where("tenant_id", "=", tenantId)
      .orderBy("initiated_at", "desc")
      .executeTakeFirst();

    return result ? this.mapToMultipartUpload(result) : null;
  }

  /**
   * Update upload progress
   */
  async updateProgress(
    id: string,
    tenantId: string,
    params: UpdateMultipartProgressParams,
  ): Promise<MultipartUpload> {
    const updateData: any = {
      completed_parts: params.completedParts,
      part_etags: JSON.stringify(params.partEtags),
    };

    if (params.status) {
      updateData.status = params.status;
      if (params.status === "completed") {
        updateData.completed_at = new Date();
      }
    }

    const result = await this.db
      .updateTable(TABLE as any)
      .set(updateData)
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToMultipartUpload(result);
  }

  /**
   * Mark as completed
   */
  async markCompleted(id: string, tenantId: string): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set({
        status: "completed",
        completed_at: new Date(),
      })
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .execute();
  }

  /**
   * Mark as aborted
   */
  async markAborted(id: string, tenantId: string): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set({
        status: "aborted",
      })
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .execute();
  }

  /**
   * Mark as failed
   */
  async markFailed(id: string, tenantId: string): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set({
        status: "failed",
      })
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .execute();
  }

  /**
   * List expired uploads for cleanup
   */
  async listExpired(tenantId: string, beforeDate: Date, limit = 100): Promise<MultipartUpload[]> {
    const results = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("expires_at", "<", beforeDate)
      .where("status", "in", ["initiated", "uploading"])
      .orderBy("expires_at", "asc")
      .limit(limit)
      .execute();

    return results.map((r) => this.mapToMultipartUpload(r));
  }

  /**
   * List active uploads for a tenant
   */
  async listActive(tenantId: string): Promise<MultipartUpload[]> {
    const results = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("status", "in", ["initiated", "uploading"])
      .orderBy("initiated_at", "desc")
      .execute();

    return results.map((r) => this.mapToMultipartUpload(r));
  }

  /**
   * Count active uploads by actor (for rate limiting)
   */
  async countActiveByActor(tenantId: string, actorId: string): Promise<number> {
    // We'd need to add actor_id to the table for this
    // For now, count all active uploads for tenant
    const result = await this.db
      .selectFrom(TABLE as any)
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .where("status", "in", ["initiated", "uploading"])
      .executeTakeFirst();

    return result?.count ?? 0;
  }

  /**
   * Delete old completed/aborted uploads (cleanup)
   */
  async deleteOld(tenantId: string, beforeDate: Date, limit = 1000): Promise<number> {
    const result = await this.db
      .deleteFrom(TABLE as any)
      .where("tenant_id", "=", tenantId)
      .where("status", "in", ["completed", "aborted", "failed"])
      .where("initiated_at", "<", beforeDate)
      .limit(limit)
      .execute();

    return result.length > 0 ? (result[0] as any).numDeletedRows ?? 0 : 0;
  }

  /**
   * Hard delete by attachment (cascade cleanup)
   */
  async deleteByAttachment(tenantId: string, attachmentId: string): Promise<void> {
    await this.db
      .deleteFrom(TABLE as any)
      .where("tenant_id", "=", tenantId)
      .where("attachment_id", "=", attachmentId)
      .execute();
  }

  /**
   * Map database row to MultipartUpload domain object
   */
  private mapToMultipartUpload(row: any): MultipartUpload {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      attachmentId: row.attachment_id,
      s3UploadId: row.s3_upload_id,
      totalParts: row.total_parts,
      completedParts: row.completed_parts,
      partEtags: row.part_etags ? JSON.parse(row.part_etags) : null,
      status: row.status,
      initiatedAt: new Date(row.initiated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      expiresAt: new Date(row.expires_at),
    };
  }
}
