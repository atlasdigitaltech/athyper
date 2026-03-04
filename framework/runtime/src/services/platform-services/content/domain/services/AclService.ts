/**
 * AclService - Per-document access control
 *
 * Responsibilities:
 * - Grant/revoke per-document permissions
 * - Check document-level permissions (integrates with policy gate)
 * - List ACLs for document
 * - Cleanup expired ACLs
 */

import type { ContentAuditEmitter } from "./ContentAuditEmitter.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { AttachmentRepo } from "../../persistence/AttachmentRepo.js";
import type { DocumentAclRepo } from "../../persistence/DocumentAclRepo.js";

export interface GrantPermissionParams {
  tenantId: string;
  attachmentId: string;
  principalId?: string;
  roleId?: string;
  permission: "read" | "download" | "delete" | "share";
  granted: boolean;
  grantedBy: string;
  expiresAt?: Date;
}

export interface RevokePermissionsParams {
  tenantId: string;
  attachmentId: string;
  principalId: string;
  actorId: string;
}

export interface CheckPermissionParams {
  tenantId: string;
  attachmentId: string;
  principalId: string;
  permission: "read" | "download" | "delete" | "share";
  principalRoleIds?: string[];
}

export class AclService {
  constructor(
    private aclRepo: DocumentAclRepo,
    private attachmentRepo: AttachmentRepo,
    private audit: ContentAuditEmitter,
    private logger: Logger,
  ) {}

  /**
   * Grant or revoke permission
   *
   * Flow:
   * 1. Verify attachment exists
   * 2. Create/update ACL entry
   * 3. Emit audit event
   */
  async grantPermission(params: GrantPermissionParams) {
    this.logger.debug(
      {
        attachmentId: params.attachmentId,
        permission: params.permission,
        granted: params.granted,
      },
      "[acl:service] Granting permission",
    );

    // 1. Verify attachment exists
    const attachment = await this.attachmentRepo.getById(
      params.attachmentId,
      params.tenantId,
    );
    if (!attachment) {
      throw new Error(`Attachment ${params.attachmentId} not found`);
    }

    // 2. Upsert ACL entry
    const acl = await this.aclRepo.upsert({
      tenantId: params.tenantId,
      attachmentId: params.attachmentId,
      principalId: params.principalId,
      roleId: params.roleId,
      permission: params.permission,
      granted: params.granted,
      grantedBy: params.grantedBy,
      expiresAt: params.expiresAt,
    });

    // 3. Emit audit event
    await this.audit.aclGranted({
      tenantId: params.tenantId,
      actorId: params.grantedBy,
      attachmentId: params.attachmentId,
      permission: params.permission,
      principalId: params.principalId,
      roleId: params.roleId,
    });

    this.logger.info(
      {
        aclId: acl.id,
        attachmentId: params.attachmentId,
        permission: params.permission,
      },
      "[acl:service] Permission granted",
    );

    return acl;
  }

  /**
   * Revoke all permissions for a principal
   *
   * Flow:
   * 1. Revoke all ACL entries for principal
   * 2. Emit audit event
   */
  async revokePermissions(params: RevokePermissionsParams) {
    this.logger.debug(
      { attachmentId: params.attachmentId, principalId: params.principalId },
      "[acl:service] Revoking permissions",
    );

    // 1. Revoke all permissions
    await this.aclRepo.revokeAllForPrincipal(
      params.tenantId,
      params.attachmentId,
      params.principalId,
    );

    // 2. Emit audit event
    await this.audit.aclRevoked({
      tenantId: params.tenantId,
      actorId: params.actorId,
      attachmentId: params.attachmentId,
      principalId: params.principalId,
      permission: "all" as any,
    });

    this.logger.info(
      { attachmentId: params.attachmentId, principalId: params.principalId },
      "[acl:service] Permissions revoked",
    );
  }

  /**
   * Check if principal has permission
   *
   * This method checks ONLY document-level ACLs.
   * For full permission check, this should be called AFTER checking
   * global permissions via PolicyGateService.
   *
   * Flow:
   * 1. Check document ACL
   * 2. If denied, emit audit event and return false
   * 3. If granted, return true
   * 4. If no ACL, return null (defer to global policy)
   */
  async checkPermission(
    params: CheckPermissionParams,
  ): Promise<boolean | null> {
    this.logger.debug(
      {
        attachmentId: params.attachmentId,
        principalId: params.principalId,
        permission: params.permission,
      },
      "[acl:service] Checking permission",
    );

    const allowed = await this.aclRepo.checkPermission(
      params.tenantId,
      params.attachmentId,
      params.principalId,
      params.permission,
      params.principalRoleIds,
    );

    // If explicitly denied by ACL
    if (allowed === false) {
      await this.audit.permissionDenied({
        tenantId: params.tenantId,
        actorId: params.principalId,
        attachmentId: params.attachmentId,
        permission: params.permission,
        reason: "Explicit deny in document ACL",
      });

      this.logger.warn(
        {
          attachmentId: params.attachmentId,
          principalId: params.principalId,
          permission: params.permission,
        },
        "[acl:service] Permission denied by ACL",
      );

      return false;
    }

    // If explicitly granted by ACL
    if (allowed === true) {
      this.logger.debug(
        {
          attachmentId: params.attachmentId,
          principalId: params.principalId,
          permission: params.permission,
        },
        "[acl:service] Permission granted by ACL",
      );

      return true;
    }

    // No ACL found - defer to global policy
    return null;
  }

  /**
   * List ACLs for a document
   */
  async listDocumentAcls(
    tenantId: string,
    attachmentId: string,
    activeOnly = true,
  ) {
    this.logger.debug(
      { attachmentId, activeOnly },
      "[acl:service] Listing ACLs",
    );

    return this.aclRepo.listByAttachment(tenantId, attachmentId, {
      activeOnly,
    });
  }

  /**
   * Cleanup expired ACLs
   * Called by background job
   */
  async cleanupExpired(tenantId: string): Promise<number> {
    this.logger.debug({ tenantId }, "[acl:service] Cleaning up expired ACLs");

    const deletedCount = await this.aclRepo.deleteExpired(tenantId, new Date());

    if (deletedCount > 0) {
      this.logger.info(
        { tenantId, deletedCount },
        "[acl:service] Expired ACLs cleaned up",
      );
    }

    return deletedCount;
  }
}
