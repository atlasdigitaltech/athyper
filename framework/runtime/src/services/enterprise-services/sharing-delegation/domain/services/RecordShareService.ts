/**
 * RecordShareService — Share/unshare records with users, groups, or OUs.
 *
 * Permission levels: view (read-only), edit (read+write), admin (read+write+share).
 */

import type { ShareAuditService } from "./ShareAuditService.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { RecordShareRepo } from "../../persistence/RecordShareRepo.js";
import type {
    RecordShare,
    CreateRecordShareInput,
    PermissionLevel,
    ShareListOptions,
} from "../types.js";

export class RecordShareService {
    constructor(
        private readonly shareRepo: RecordShareRepo,
        private readonly auditService: ShareAuditService,
        private readonly logger: Logger,
    ) {}

    /**
     * Share a record with a user/group/OU.
     */
    async share(input: CreateRecordShareInput): Promise<RecordShare> {
        const share = await this.shareRepo.create(input);

        await this.auditService.log({
            tenantId: input.tenantId,
            grantId: share.id,
            grantType: "record_share",
            action: "grant_created",
            actorId: input.sharedBy,
            targetId: input.sharedWithId,
            entityType: input.entityType,
            entityId: input.entityId,
            details: {
                sharedWithType: input.sharedWithType,
                permissionLevel: input.permissionLevel,
                expiresAt: input.expiresAt?.toISOString(),
                reason: input.reason,
            },
        });

        this.logger.info(
            {
                shareId: share.id,
                entityType: input.entityType,
                entityId: input.entityId,
                sharedWith: input.sharedWithId,
                level: input.permissionLevel,
            },
            "[share:record] Record shared",
        );

        return share;
    }

    /**
     * Revoke a record share.
     */
    async unshare(tenantId: string, shareId: string, revokedBy: string): Promise<boolean> {
        const share = await this.shareRepo.getById(tenantId, shareId);
        if (!share) return false;

        const revoked = await this.shareRepo.revoke(tenantId, shareId);
        if (!revoked) return false;

        await this.auditService.log({
            tenantId,
            grantId: shareId,
            grantType: "record_share",
            action: "grant_revoked",
            actorId: revokedBy,
            targetId: share.sharedWithId,
            entityType: share.entityType,
            entityId: share.entityId,
            details: { permissionLevel: share.permissionLevel },
        });

        this.logger.info(
            { shareId, revokedBy },
            "[share:record] Record share revoked",
        );

        return true;
    }

    /**
     * Update the permission level of an existing share.
     */
    async updatePermission(
        tenantId: string,
        shareId: string,
        newLevel: PermissionLevel,
        updatedBy: string,
    ): Promise<boolean> {
        const share = await this.shareRepo.getById(tenantId, shareId);
        if (!share || share.isRevoked) return false;

        const updated = await this.shareRepo.updatePermissionLevel(tenantId, shareId, newLevel);
        if (!updated) return false;

        await this.auditService.log({
            tenantId,
            grantId: shareId,
            grantType: "record_share",
            action: "share_modified",
            actorId: updatedBy,
            targetId: share.sharedWithId,
            entityType: share.entityType,
            entityId: share.entityId,
            details: {
                previousLevel: share.permissionLevel,
                newLevel,
            },
        });

        return true;
    }

    /**
     * List all active shares for an entity.
     */
    async listForEntity(
        tenantId: string,
        entityType: string,
        entityId: string,
    ): Promise<RecordShare[]> {
        return this.shareRepo.listForEntity(tenantId, entityType, entityId);
    }

    /**
     * List all records shared with a specific user.
     */
    async listSharedWithUser(
        tenantId: string,
        userId: string,
        opts?: ShareListOptions,
    ): Promise<RecordShare[]> {
        return this.shareRepo.listSharedWithUser(tenantId, userId, opts);
    }

    /**
     * Get effective share permission for a user on a record.
     */
    async getSharePermission(
        tenantId: string,
        entityType: string,
        entityId: string,
        userId: string,
    ): Promise<RecordShare | undefined> {
        return this.shareRepo.findActiveShare(tenantId, entityType, entityId, userId);
    }

    /**
     * Get a specific share by ID.
     */
    async getById(tenantId: string, id: string): Promise<RecordShare | undefined> {
        return this.shareRepo.getById(tenantId, id);
    }
}
