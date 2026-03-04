/**
 * Sharing & Delegation — Module Composition Root
 *
 * Registers delegation, record sharing, enforcement, audit, cross-tenant,
 * and temporary access services with HTTP handlers and background jobs.
 * Follows the RuntimeModule pattern (register + contribute).
 *
 * Code: SHARE
 * Depends on: CORE
 * Tenant scoped: true
 * Subscription: Professional
 */

import { TOKENS } from "../../../kernel/tokens.js";

// Domain services
import { AdminReassignmentService } from "./domain/services/AdminReassignmentService.js";
import { CrossTenantShareService } from "./domain/services/CrossTenantShareService.js";
import { RecordShareService } from "./domain/services/RecordShareService.js";
import { ShareAuditService } from "./domain/services/ShareAuditService.js";
import { ShareEnforcementService } from "./domain/services/ShareEnforcementService.js";
import { SharePolicyResolver } from "./domain/services/SharePolicyResolver.js";
import { TaskDelegationService } from "./domain/services/TaskDelegationService.js";
import { TemporaryAccessService } from "./domain/services/TemporaryAccessService.js";
import { DelegationGrantRepo } from "./persistence/DelegationGrantRepo.js";
import { RecordShareRepo } from "./persistence/RecordShareRepo.js";

import type { Container } from "../../../kernel/container.js";
import type { Logger } from "../../../kernel/logger.js";
import type { JobRegistry } from "../../platform/foundation/registries/jobs.registry.js";
import type { RouteRegistry } from "../../platform/foundation/registries/routes.registry.js";
import type { RuntimeModule } from "../../types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Internal Tokens
// ============================================================================

const SHARE_TOKENS = {
    // Repos
    delegationGrantRepo: "share.repo.delegationGrant",
    recordShareRepo: "share.repo.recordShare",
    // Services
    taskDelegationService: "share.service.taskDelegation",
    adminReassignmentService: "share.service.adminReassignment",
    shareEnforcementService: "share.service.enforcement",
    sharePolicyResolver: "share.service.policyResolver",
    recordShareService: "share.service.recordShare",
    temporaryAccessService: "share.service.temporaryAccess",
    shareAuditService: "share.service.audit",
    crossTenantShareService: "share.service.crossTenant",
    // Handlers — Delegation
    delegateTaskHandler: "share.handler.delegateTask",
    revokeDelegationHandler: "share.handler.revokeDelegation",
    listMyDelegationsHandler: "share.handler.listMyDelegations",
    listDelegatedToMeHandler: "share.handler.listDelegatedToMe",
    // Handlers — Admin Reassignment
    adminReassignHandler: "share.handler.adminReassign",
    adminBulkReassignHandler: "share.handler.adminBulkReassign",
    // Handlers — Record Sharing
    shareRecordHandler: "share.handler.shareRecord",
    unshareRecordHandler: "share.handler.unshareRecord",
    listEntitySharesHandler: "share.handler.listEntityShares",
    listMySharesHandler: "share.handler.listMyShares",
    // Handlers — Temporary Access
    createTemporaryGrantHandler: "share.handler.createTemporaryGrant",
    // Handlers — Audit
    listShareAuditHandler: "share.handler.listShareAudit",
    getRecordShareHistoryHandler: "share.handler.getRecordShareHistory",
    // Handlers — Cross-Tenant
    createExternalShareHandler: "share.handler.createExternalShare",
    verifyExternalShareHandler: "share.handler.verifyExternalShare",
    revokeExternalShareHandler: "share.handler.revokeExternalShare",
} as const;

// ============================================================================
// Handler Classes
// ============================================================================

// ── Delegation Handlers ─────────────────────────────────────────────────

class DelegateTaskHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.taskDelegationService) as TaskDelegationService;
        const { delegateId, scopeType, scopeRef, permissions, reason, expiresAt } = req.body;
        const grant = await service.delegate({
            tenantId: ctx.tenant?.id,
            delegatorId: ctx.auth?.principalId,
            delegateId,
            scopeType,
            scopeRef,
            permissions,
            reason,
            expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        });
        return res.status(201).json({ success: true, grant });
    }
}

class RevokeDelegationHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.taskDelegationService) as TaskDelegationService;
        const revoked = await service.revoke(ctx.tenant?.id, req.params.id, ctx.auth?.principalId);
        if (!revoked) return res.status(404).json({ success: false, error: "Delegation not found" });
        return res.json({ success: true });
    }
}

class ListMyDelegationsHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.taskDelegationService) as TaskDelegationService;
        const { limit, offset } = req.query ?? {};
        const grants = await service.listByDelegator(
            ctx.tenant?.id, ctx.auth?.principalId,
            { limit: Number(limit) || 50, offset: Number(offset) || 0 },
        );
        return res.json({ success: true, grants });
    }
}

class ListDelegatedToMeHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.taskDelegationService) as TaskDelegationService;
        const { limit, offset } = req.query ?? {};
        const grants = await service.listByDelegate(
            ctx.tenant?.id, ctx.auth?.principalId,
            { limit: Number(limit) || 50, offset: Number(offset) || 0 },
        );
        return res.json({ success: true, grants });
    }
}

// ── Admin Reassignment Handlers ─────────────────────────────────────────

class AdminReassignHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.adminReassignmentService) as AdminReassignmentService;
        const { taskId, fromUserId, toUserId, reason } = req.body;
        const result = await service.reassignTask({
            tenantId: ctx.tenant?.id,
            taskId,
            fromUserId,
            toUserId,
            reason,
            adminId: ctx.auth?.principalId,
        });
        const status = result.success ? 200 : 400;
        return res.status(status).json({ success: result.success, result });
    }
}

class AdminBulkReassignHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.adminReassignmentService) as AdminReassignmentService;
        const { fromUserId, toUserId, taskIds, reason } = req.body;
        const results = await service.bulkReassign({
            tenantId: ctx.tenant?.id,
            fromUserId,
            toUserId,
            taskIds,
            reason,
            adminId: ctx.auth?.principalId,
        });
        return res.json({ success: true, results });
    }
}

// ── Record Sharing Handlers ─────────────────────────────────────────────

class ShareRecordHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.recordShareService) as RecordShareService;
        const { entityType, entityId, sharedWithId, sharedWithType, permissionLevel, reason, expiresAt } = req.body;
        const share = await service.share({
            tenantId: ctx.tenant?.id,
            entityType,
            entityId,
            sharedWithId,
            sharedWithType: sharedWithType ?? "user",
            permissionLevel: permissionLevel ?? "view",
            sharedBy: ctx.auth?.principalId,
            reason,
            expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        });
        return res.status(201).json({ success: true, share });
    }
}

class UnshareRecordHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.recordShareService) as RecordShareService;
        const revoked = await service.unshare(ctx.tenant?.id, req.params.id, ctx.auth?.principalId);
        if (!revoked) return res.status(404).json({ success: false, error: "Share not found" });
        return res.json({ success: true });
    }
}

class ListEntitySharesHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.recordShareService) as RecordShareService;
        const { type, id } = req.params;
        const shares = await service.listForEntity(ctx.tenant?.id, type, id);
        return res.json({ success: true, shares });
    }
}

class ListMySharesHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.recordShareService) as RecordShareService;
        const { limit, offset } = req.query ?? {};
        const shares = await service.listSharedWithUser(
            ctx.tenant?.id, ctx.auth?.principalId,
            { limit: Number(limit) || 50, offset: Number(offset) || 0 },
        );
        return res.json({ success: true, shares });
    }
}

// ── Temporary Access Handler ────────────────────────────────────────────

class CreateTemporaryGrantHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.temporaryAccessService) as TemporaryAccessService;
        const { entityType, entityId, sharedWithId, sharedWithType, permissionLevel, reason, expiresAt } = req.body;
        if (!expiresAt) {
            return res.status(400).json({ success: false, error: "expiresAt is required for temporary grants" });
        }
        const share = await service.createTemporaryShare({
            tenantId: ctx.tenant?.id,
            entityType,
            entityId,
            sharedWithId,
            sharedWithType: sharedWithType ?? "user",
            permissionLevel: permissionLevel ?? "view",
            sharedBy: ctx.auth?.principalId,
            reason,
            expiresAt: new Date(expiresAt),
        });
        return res.status(201).json({ success: true, share });
    }
}

// ── Share Audit Handlers ────────────────────────────────────────────────

class ListShareAuditHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.shareAuditService) as ShareAuditService;
        const { startDate, endDate, actorId, action, limit, offset } = req.query ?? {};
        const result = await service.query(ctx.tenant?.id, {
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            actorId,
            action,
            limit: Number(limit) || 50,
            offset: Number(offset) || 0,
        });
        return res.json({ success: true, ...result });
    }
}

class GetRecordShareHistoryHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.shareAuditService) as ShareAuditService;
        const { type, id } = req.params;
        const { limit, offset } = req.query ?? {};
        const result = await service.getForEntity(ctx.tenant?.id, type, id, {
            limit: Number(limit) || 50,
            offset: Number(offset) || 0,
        });
        return res.json({ success: true, ...result });
    }
}

// ── Cross-Tenant Handlers ───────────────────────────────────────────────

class CreateExternalShareHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.crossTenantShareService) as CrossTenantShareService;
        const { targetEmail, entityType, entityId, permissionLevel, expiresInDays } = req.body;
        const result = await service.createShareToken({
            tenantId: ctx.tenant?.id,
            issuedBy: ctx.auth?.principalId,
            targetEmail,
            entityType,
            entityId,
            permissionLevel,
            expiresInDays,
        });
        return res.status(201).json({ success: true, ...result });
    }
}

class VerifyExternalShareHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.crossTenantShareService) as CrossTenantShareService;
        const { token } = req.params;
        const share = await service.verifyToken(token);
        if (!share) return res.status(404).json({ success: false, error: "Invalid or expired token" });
        return res.json({ success: true, share });
    }
}

class RevokeExternalShareHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(SHARE_TOKENS.crossTenantShareService) as CrossTenantShareService;
        const revoked = await service.revokeToken(ctx.tenant?.id, req.params.id, ctx.auth?.principalId);
        if (!revoked) return res.status(404).json({ success: false, error: "Token not found" });
        return res.json({ success: true });
    }
}

// ============================================================================
// Module Definition
// ============================================================================

export const module: RuntimeModule = {
    name: "enterprise.sharing-delegation",

    async register(c: Container) {
        const db = await c.resolve<Kysely<DB>>(TOKENS.db);
        const logger = await c.resolve<Logger>(TOKENS.logger);

        logger.info("Registering sharing & delegation module");

        // ── Repos ─────────────────────────────────────────────────────
        c.register(SHARE_TOKENS.delegationGrantRepo,
            async () => new DelegationGrantRepo(db), "singleton");
        c.register(SHARE_TOKENS.recordShareRepo,
            async () => new RecordShareRepo(db), "singleton");

        // ── Audit Service (needed by other services) ──────────────────
        c.register(SHARE_TOKENS.shareAuditService,
            async () => new ShareAuditService(db), "singleton");

        // ── Domain Services ───────────────────────────────────────────
        c.register(SHARE_TOKENS.taskDelegationService, async () => {
            const delegationRepo = await c.resolve<DelegationGrantRepo>(SHARE_TOKENS.delegationGrantRepo);
            const auditService = await c.resolve<ShareAuditService>(SHARE_TOKENS.shareAuditService);
            return new TaskDelegationService(delegationRepo, auditService, logger);
        }, "singleton");

        c.register(SHARE_TOKENS.adminReassignmentService, async () => {
            const auditService = await c.resolve<ShareAuditService>(SHARE_TOKENS.shareAuditService);
            return new AdminReassignmentService(auditService, logger);
        }, "singleton");

        c.register(SHARE_TOKENS.sharePolicyResolver, async () => {
            const shareRepo = await c.resolve<RecordShareRepo>(SHARE_TOKENS.recordShareRepo);
            const delegationRepo = await c.resolve<DelegationGrantRepo>(SHARE_TOKENS.delegationGrantRepo);
            return new SharePolicyResolver(shareRepo, delegationRepo, logger);
        }, "singleton");

        c.register(SHARE_TOKENS.shareEnforcementService, async () => {
            const resolver = await c.resolve<SharePolicyResolver>(SHARE_TOKENS.sharePolicyResolver);
            const auditService = await c.resolve<ShareAuditService>(SHARE_TOKENS.shareAuditService);
            return new ShareEnforcementService(resolver, auditService, logger);
        }, "singleton");

        c.register(SHARE_TOKENS.recordShareService, async () => {
            const shareRepo = await c.resolve<RecordShareRepo>(SHARE_TOKENS.recordShareRepo);
            const auditService = await c.resolve<ShareAuditService>(SHARE_TOKENS.shareAuditService);
            return new RecordShareService(shareRepo, auditService, logger);
        }, "singleton");

        c.register(SHARE_TOKENS.temporaryAccessService, async () => {
            const recordShareService = await c.resolve<RecordShareService>(SHARE_TOKENS.recordShareService);
            const delegationService = await c.resolve<TaskDelegationService>(SHARE_TOKENS.taskDelegationService);
            const auditService = await c.resolve<ShareAuditService>(SHARE_TOKENS.shareAuditService);
            const delegationRepo = await c.resolve<DelegationGrantRepo>(SHARE_TOKENS.delegationGrantRepo);
            const shareRepo = await c.resolve<RecordShareRepo>(SHARE_TOKENS.recordShareRepo);
            return new TemporaryAccessService(recordShareService, delegationService, auditService, delegationRepo, shareRepo, logger);
        }, "singleton");

        c.register(SHARE_TOKENS.crossTenantShareService, async () => {
            const auditService = await c.resolve<ShareAuditService>(SHARE_TOKENS.shareAuditService);
            return new CrossTenantShareService(db, auditService, logger);
        }, "singleton");

        // ── Handlers ──────────────────────────────────────────────────
        c.register(SHARE_TOKENS.delegateTaskHandler, async () => new DelegateTaskHandler(), "singleton");
        c.register(SHARE_TOKENS.revokeDelegationHandler, async () => new RevokeDelegationHandler(), "singleton");
        c.register(SHARE_TOKENS.listMyDelegationsHandler, async () => new ListMyDelegationsHandler(), "singleton");
        c.register(SHARE_TOKENS.listDelegatedToMeHandler, async () => new ListDelegatedToMeHandler(), "singleton");
        c.register(SHARE_TOKENS.adminReassignHandler, async () => new AdminReassignHandler(), "singleton");
        c.register(SHARE_TOKENS.adminBulkReassignHandler, async () => new AdminBulkReassignHandler(), "singleton");
        c.register(SHARE_TOKENS.shareRecordHandler, async () => new ShareRecordHandler(), "singleton");
        c.register(SHARE_TOKENS.unshareRecordHandler, async () => new UnshareRecordHandler(), "singleton");
        c.register(SHARE_TOKENS.listEntitySharesHandler, async () => new ListEntitySharesHandler(), "singleton");
        c.register(SHARE_TOKENS.listMySharesHandler, async () => new ListMySharesHandler(), "singleton");
        c.register(SHARE_TOKENS.createTemporaryGrantHandler, async () => new CreateTemporaryGrantHandler(), "singleton");
        c.register(SHARE_TOKENS.listShareAuditHandler, async () => new ListShareAuditHandler(), "singleton");
        c.register(SHARE_TOKENS.getRecordShareHistoryHandler, async () => new GetRecordShareHistoryHandler(), "singleton");
        c.register(SHARE_TOKENS.createExternalShareHandler, async () => new CreateExternalShareHandler(), "singleton");
        c.register(SHARE_TOKENS.verifyExternalShareHandler, async () => new VerifyExternalShareHandler(), "singleton");
        c.register(SHARE_TOKENS.revokeExternalShareHandler, async () => new RevokeExternalShareHandler(), "singleton");

        // Also register under global tokens for cross-module access
        c.register(TOKENS.shareTaskDelegationService, async () => {
            return c.resolve<TaskDelegationService>(SHARE_TOKENS.taskDelegationService);
        }, "singleton");
        c.register(TOKENS.shareEnforcementService, async () => {
            return c.resolve<ShareEnforcementService>(SHARE_TOKENS.shareEnforcementService);
        }, "singleton");
        c.register(TOKENS.shareAuditService, async () => {
            return c.resolve<ShareAuditService>(SHARE_TOKENS.shareAuditService);
        }, "singleton");
        c.register(TOKENS.sharePolicyResolver, async () => {
            return c.resolve<SharePolicyResolver>(SHARE_TOKENS.sharePolicyResolver);
        }, "singleton");
        c.register(TOKENS.shareRecordShareService, async () => {
            return c.resolve<RecordShareService>(SHARE_TOKENS.recordShareService);
        }, "singleton");
        c.register(TOKENS.shareTemporaryAccessService, async () => {
            return c.resolve<TemporaryAccessService>(SHARE_TOKENS.temporaryAccessService);
        }, "singleton");
        c.register(TOKENS.shareCrossTenantService, async () => {
            return c.resolve<CrossTenantShareService>(SHARE_TOKENS.crossTenantShareService);
        }, "singleton");
        c.register(TOKENS.shareAdminReassignmentService, async () => {
            return c.resolve<AdminReassignmentService>(SHARE_TOKENS.adminReassignmentService);
        }, "singleton");
        c.register(TOKENS.shareDelegationGrantRepo, async () => {
            return c.resolve<DelegationGrantRepo>(SHARE_TOKENS.delegationGrantRepo);
        }, "singleton");
        c.register(TOKENS.shareRecordShareRepo, async () => {
            return c.resolve<RecordShareRepo>(SHARE_TOKENS.recordShareRepo);
        }, "singleton");
    },

    async contribute(c: Container) {
        const logger = await c.resolve<Logger>(TOKENS.logger);
        const routes = await c.resolve<RouteRegistry>(TOKENS.routeRegistry);

        // ── Delegation Routes ─────────────────────────────────────────
        routes.add({
            method: "POST",
            path: "/api/share/delegate",
            handlerToken: SHARE_TOKENS.delegateTaskHandler,
            authRequired: true,
            tags: ["sharing", "delegation"],
        });
        routes.add({
            method: "DELETE",
            path: "/api/share/delegate/:id",
            handlerToken: SHARE_TOKENS.revokeDelegationHandler,
            authRequired: true,
            tags: ["sharing", "delegation"],
        });
        routes.add({
            method: "GET",
            path: "/api/share/delegations/from-me",
            handlerToken: SHARE_TOKENS.listMyDelegationsHandler,
            authRequired: true,
            tags: ["sharing", "delegation"],
        });
        routes.add({
            method: "GET",
            path: "/api/share/delegations/to-me",
            handlerToken: SHARE_TOKENS.listDelegatedToMeHandler,
            authRequired: true,
            tags: ["sharing", "delegation"],
        });

        // ── Admin Reassignment Routes ─────────────────────────────────
        routes.add({
            method: "POST",
            path: "/api/admin/share/reassign",
            handlerToken: SHARE_TOKENS.adminReassignHandler,
            authRequired: true,
            tags: ["sharing", "admin"],
        });
        routes.add({
            method: "POST",
            path: "/api/admin/share/bulk-reassign",
            handlerToken: SHARE_TOKENS.adminBulkReassignHandler,
            authRequired: true,
            tags: ["sharing", "admin"],
        });

        // ── Record Sharing Routes ─────────────────────────────────────
        routes.add({
            method: "POST",
            path: "/api/share/records",
            handlerToken: SHARE_TOKENS.shareRecordHandler,
            authRequired: true,
            tags: ["sharing", "records"],
        });
        routes.add({
            method: "DELETE",
            path: "/api/share/records/:id",
            handlerToken: SHARE_TOKENS.unshareRecordHandler,
            authRequired: true,
            tags: ["sharing", "records"],
        });
        routes.add({
            method: "GET",
            path: "/api/share/records/entity/:type/:id",
            handlerToken: SHARE_TOKENS.listEntitySharesHandler,
            authRequired: true,
            tags: ["sharing", "records"],
        });
        routes.add({
            method: "GET",
            path: "/api/share/records/my-shares",
            handlerToken: SHARE_TOKENS.listMySharesHandler,
            authRequired: true,
            tags: ["sharing", "records"],
        });

        // ── Temporary Access Routes ───────────────────────────────────
        routes.add({
            method: "POST",
            path: "/api/share/temporary-grant",
            handlerToken: SHARE_TOKENS.createTemporaryGrantHandler,
            authRequired: true,
            tags: ["sharing", "temporary"],
        });

        // ── Audit Routes ──────────────────────────────────────────────
        routes.add({
            method: "GET",
            path: "/api/share/audit",
            handlerToken: SHARE_TOKENS.listShareAuditHandler,
            authRequired: true,
            tags: ["sharing", "audit"],
        });
        routes.add({
            method: "GET",
            path: "/api/share/audit/record/:type/:id",
            handlerToken: SHARE_TOKENS.getRecordShareHistoryHandler,
            authRequired: true,
            tags: ["sharing", "audit"],
        });

        // ── Cross-Tenant Routes ───────────────────────────────────────
        routes.add({
            method: "POST",
            path: "/api/share/external",
            handlerToken: SHARE_TOKENS.createExternalShareHandler,
            authRequired: true,
            tags: ["sharing", "external"],
        });
        routes.add({
            method: "GET",
            path: "/api/share/external/verify/:token",
            handlerToken: SHARE_TOKENS.verifyExternalShareHandler,
            authRequired: false, // External access — no auth required
            tags: ["sharing", "external"],
        });
        routes.add({
            method: "DELETE",
            path: "/api/share/external/:id",
            handlerToken: SHARE_TOKENS.revokeExternalShareHandler,
            authRequired: true,
            tags: ["sharing", "external"],
        });

        // ── Background Jobs ───────────────────────────────────────────
        try {
            const jobRegistry = await c.resolve<JobRegistry>(TOKENS.jobRegistry);
            jobRegistry.addJob({
                name: "share.expiry-cleanup",
                queue: "default",
                handlerToken: "share.worker.expiryCleanup",
                concurrency: 1,
            });
            jobRegistry.addSchedule({
                name: "share.expiry-cleanup-schedule",
                cron: "0 2 * * *", // Daily at 2 AM
                jobName: "share.expiry-cleanup",
            });
        } catch (err) {
            logger.warn(
                { error: String(err) },
                "[share] Job registry not available; background jobs not registered",
            );
        }

        logger.info("Sharing & delegation module contributed — routes registered");
    },
};

export const moduleCode = "SHARE";
export const moduleName = "Delegation & Sharing";
