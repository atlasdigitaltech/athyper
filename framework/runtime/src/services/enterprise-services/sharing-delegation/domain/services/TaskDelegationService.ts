/**
 * TaskDelegationService — Delegate workflow tasks to another user.
 *
 * Supports time-bound delegation with automatic expiry.
 * All delegation actions are audit-logged.
 */

import type { ShareAuditService } from "./ShareAuditService.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { DelegationGrantRepo } from "../../persistence/DelegationGrantRepo.js";
import type {
    DelegationGrant,
    CreateDelegationInput,
    ShareListOptions,
} from "../types.js";

export class TaskDelegationService {
    constructor(
        private readonly delegationRepo: DelegationGrantRepo,
        private readonly auditService: ShareAuditService,
        private readonly logger: Logger,
    ) {}

    /**
     * Create a delegation grant from delegator to delegate.
     */
    async delegate(input: CreateDelegationInput): Promise<DelegationGrant> {
        if (input.delegatorId === input.delegateId) {
            throw new Error("Cannot delegate to yourself");
        }

        if (input.permissions.length === 0) {
            throw new Error("At least one permission is required");
        }

        const grant = await this.delegationRepo.create(input);

        await this.auditService.log({
            tenantId: input.tenantId,
            grantId: grant.id,
            grantType: "delegation",
            action: "delegation_created",
            actorId: input.delegatorId,
            targetId: input.delegateId,
            details: {
                scopeType: input.scopeType,
                scopeRef: input.scopeRef,
                permissions: input.permissions,
                expiresAt: input.expiresAt?.toISOString(),
                reason: input.reason,
            },
        });

        this.logger.info(
            {
                grantId: grant.id,
                delegator: input.delegatorId,
                delegate: input.delegateId,
                scopeType: input.scopeType,
            },
            "[share:delegation] Delegation created",
        );

        return grant;
    }

    /**
     * Revoke an active delegation.
     */
    async revoke(tenantId: string, grantId: string, revokedBy: string): Promise<boolean> {
        const grant = await this.delegationRepo.getById(tenantId, grantId);
        if (!grant) return false;

        // Only delegator or admin can revoke
        const revoked = await this.delegationRepo.revoke(tenantId, grantId, revokedBy);
        if (!revoked) return false;

        await this.auditService.log({
            tenantId,
            grantId,
            grantType: "delegation",
            action: "delegation_revoked",
            actorId: revokedBy,
            targetId: grant.delegateId,
            details: {
                delegatorId: grant.delegatorId,
                scopeType: grant.scopeType,
                scopeRef: grant.scopeRef,
            },
        });

        this.logger.info(
            { grantId, revokedBy },
            "[share:delegation] Delegation revoked",
        );

        return true;
    }

    /**
     * List delegations created by a user (from-me).
     */
    async listByDelegator(
        tenantId: string,
        delegatorId: string,
        opts?: ShareListOptions,
    ): Promise<DelegationGrant[]> {
        return this.delegationRepo.listByDelegator(tenantId, delegatorId, opts);
    }

    /**
     * List delegations received by a user (to-me).
     */
    async listByDelegate(
        tenantId: string,
        delegateId: string,
        opts?: ShareListOptions,
    ): Promise<DelegationGrant[]> {
        return this.delegationRepo.listByDelegate(tenantId, delegateId, opts);
    }

    /**
     * Check if a user has an active delegation for a scope.
     */
    async hasActiveDelegation(
        tenantId: string,
        delegateId: string,
        scopeType: string,
        scopeRef?: string,
    ): Promise<DelegationGrant | undefined> {
        const grants = await this.delegationRepo.findActiveForScope(
            tenantId, delegateId, scopeType, scopeRef,
        );
        return grants[0];
    }

    /**
     * Get a specific delegation by ID.
     */
    async getById(tenantId: string, id: string): Promise<DelegationGrant | undefined> {
        return this.delegationRepo.getById(tenantId, id);
    }
}
