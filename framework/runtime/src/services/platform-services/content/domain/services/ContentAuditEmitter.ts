/**
 * ContentAuditEmitter - Centralized audit event emission for content operations
 *
 * Audit events:
 * - content.upload.initiated
 * - content.upload.completed
 * - content.upload.failed
 * - content.download.requested
 * - content.file.deleted
 * - content.version.created
 * - content.version.restored
 * - content.link.created
 * - content.link.removed
 * - content.acl.granted
 * - content.acl.revoked
 * - content.permission.denied
 */

import type { AuditWriter } from "../../../../../kernel/audit.js";
import type { Logger } from "../../../../../kernel/logger.js";

export const CONTENT_AUDIT_EVENTS = {
  UPLOAD_INITIATED: "content.upload.initiated",
  UPLOAD_COMPLETED: "content.upload.completed",
  UPLOAD_FAILED: "content.upload.failed",
  DOWNLOAD_REQUESTED: "content.download.requested",
  FILE_DELETED: "content.file.deleted",
  VERSION_CREATED: "content.version.created",
  VERSION_RESTORED: "content.version.restored",
  LINK_CREATED: "content.link.created",
  LINK_REMOVED: "content.link.removed",
  ACL_GRANTED: "content.acl.granted",
  ACL_REVOKED: "content.acl.revoked",
  PERMISSION_DENIED: "content.permission.denied",
} as const;

export interface AuditContext {
  tenantId: string;
  actorId: string;
  attachmentId?: string;
  entityType?: string;
  entityId?: string;
  kind?: string;
  fileName?: string;
  sizeBytes?: number;
  versionNo?: number;
  permission?: string;
  principalId?: string;
  roleId?: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class ContentAuditEmitter {
  constructor(
    private auditWriter: AuditWriter,
    private logger: Logger,
  ) {}

  /**
   * Upload initiated
   */
  async uploadInitiated(context: AuditContext): Promise<void> {
    await this.emit(CONTENT_AUDIT_EVENTS.UPLOAD_INITIATED, context, {
      attachmentId: context.attachmentId,
      entityType: context.entityType,
      entityId: context.entityId,
      kind: context.kind,
      fileName: context.fileName,
      sizeBytes: context.sizeBytes,
    });
  }

  /**
   * Upload completed successfully
   */
  async uploadCompleted(context: AuditContext): Promise<void> {
    await this.emit(CONTENT_AUDIT_EVENTS.UPLOAD_COMPLETED, context, {
      attachmentId: context.attachmentId,
      fileName: context.fileName,
      sizeBytes: context.sizeBytes,
      kind: context.kind,
    });
  }

  /**
   * Upload failed
   */
  async uploadFailed(context: AuditContext & { reason: string }): Promise<void> {
    await this.emit(CONTENT_AUDIT_EVENTS.UPLOAD_FAILED, context, {
      attachmentId: context.attachmentId,
      fileName: context.fileName,
      reason: context.reason,
    });
  }

  /**
   * Download requested
   */
  async downloadRequested(context: AuditContext): Promise<void> {
    await this.emit(CONTENT_AUDIT_EVENTS.DOWNLOAD_REQUESTED, context, {
      attachmentId: context.attachmentId,
      fileName: context.fileName,
      sizeBytes: context.sizeBytes,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  /**
   * File deleted
   */
  async fileDeleted(context: AuditContext): Promise<void> {
    await this.emit(CONTENT_AUDIT_EVENTS.FILE_DELETED, context, {
      attachmentId: context.attachmentId,
      fileName: context.fileName,
      kind: context.kind,
    });
  }

  /**
   * New version created
   */
  async versionCreated(context: AuditContext): Promise<void> {
    await this.emit(CONTENT_AUDIT_EVENTS.VERSION_CREATED, context, {
      attachmentId: context.attachmentId,
      fileName: context.fileName,
      versionNo: context.versionNo,
    });
  }

  /**
   * Previous version restored
   */
  async versionRestored(context: AuditContext & { fromVersionNo: number }): Promise<void> {
    await this.emit(CONTENT_AUDIT_EVENTS.VERSION_RESTORED, context, {
      attachmentId: context.attachmentId,
      fromVersionNo: (context as any).fromVersionNo,
      toVersionNo: context.versionNo,
    });
  }

  /**
   * Document linked to entity
   */
  async linkCreated(context: AuditContext & { linkKind: string }): Promise<void> {
    await this.emit(CONTENT_AUDIT_EVENTS.LINK_CREATED, context, {
      attachmentId: context.attachmentId,
      entityType: context.entityType,
      entityId: context.entityId,
      linkKind: (context as any).linkKind,
    });
  }

  /**
   * Document unlinked from entity
   */
  async linkRemoved(context: AuditContext): Promise<void> {
    await this.emit(CONTENT_AUDIT_EVENTS.LINK_REMOVED, context, {
      attachmentId: context.attachmentId,
      entityType: context.entityType,
      entityId: context.entityId,
    });
  }

  /**
   * ACL permission granted
   */
  async aclGranted(context: AuditContext): Promise<void> {
    await this.emit(CONTENT_AUDIT_EVENTS.ACL_GRANTED, context, {
      attachmentId: context.attachmentId,
      permission: context.permission,
      principalId: context.principalId,
      roleId: context.roleId,
    });
  }

  /**
   * ACL permission revoked
   */
  async aclRevoked(context: AuditContext): Promise<void> {
    await this.emit(CONTENT_AUDIT_EVENTS.ACL_REVOKED, context, {
      attachmentId: context.attachmentId,
      permission: context.permission,
      principalId: context.principalId,
    });
  }

  /**
   * Permission denied (important for security monitoring)
   */
  async permissionDenied(context: AuditContext): Promise<void> {
    await this.emit(CONTENT_AUDIT_EVENTS.PERMISSION_DENIED, context, {
      attachmentId: context.attachmentId,
      permission: context.permission,
      reason: context.reason,
    });
  }

  /**
   * Internal: emit audit event
   */
  private async emit(
    eventType: string,
    context: AuditContext,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.auditWriter.write({
        ts: new Date().toISOString(),
        type: eventType,
        level: "info",
        actor: {
          kind: "user",
          id: context.actorId,
          tenantKey: context.tenantId,
        },
        meta: {
          ...details,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      this.logger.debug(
        { eventType, tenantId: context.tenantId, actorId: context.actorId },
        "[content:audit] Event emitted",
      );
    } catch (error) {
      // Audit failures should not break the main flow
      this.logger.error(
        { error: String(error), eventType },
        "[content:audit] Failed to emit audit event",
      );
    }
  }
}
