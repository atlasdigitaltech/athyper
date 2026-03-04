/**
 * ShareEnforcementService — Evaluates sharing policies before record access.
 *
 * Called by GenericDataAPI to check if a user can access a record
 * via sharing mechanisms (beyond their direct RBAC permissions).
 */

import type { ShareAuditService } from "./ShareAuditService.js";
import type { SharePolicyResolver } from "./SharePolicyResolver.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { ShareAccessAction } from "../types.js";

export class ShareEnforcementService {
    constructor(
        private readonly policyResolver: SharePolicyResolver,
        private readonly auditService: ShareAuditService,
        private readonly logger: Logger,
    ) {}

    /**
     * Check if a user can access a record via sharing.
     * This is called AFTER normal RBAC check fails — as a fallback.
     *
     * @returns true if the user has access via sharing, false otherwise
     */
    async canAccess(
        tenantId: string,
        userId: string,
        entityType: string,
        entityId: string,
        action: ShareAccessAction,
    ): Promise<boolean> {
        const allowed = await this.policyResolver.canPerformAction(
            tenantId, userId, entityType, entityId, action,
        );

        if (allowed) {
            // Log access via share for compliance audit
            await this.auditService.log({
                tenantId,
                grantType: "record_share",
                action: "access_via_share",
                actorId: userId,
                entityType,
                entityId,
                details: { requestedAction: action },
            }).catch(err => {
                // Best-effort audit — don't block access
                this.logger.warn(
                    { error: String(err) },
                    "[share:enforcement] Failed to log access audit",
                );
            });
        }

        return allowed;
    }

    /**
     * Get detailed effective permission for a user on a record.
     * Used by UI to show what access level a user has via sharing.
     */
    async getEffectivePermission(
        tenantId: string,
        userId: string,
        entityType: string,
        entityId: string,
    ) {
        return this.policyResolver.resolveEffectivePermission(
            tenantId, userId, entityType, entityId,
        );
    }
}
