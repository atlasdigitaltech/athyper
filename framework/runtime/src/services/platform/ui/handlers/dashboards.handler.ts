/**
 * Dashboard HTTP Handlers
 *
 * Handles all dashboard CRUD, versioning, ACL management, and query operations.
 * Each handler implements RouteHandler and delegates to DashboardService.
 *
 * Permission enforcement:
 *   - ListDashboards: ACL-filtered by repository query (no extra check)
 *   - GetDashboard: returns permission field (no minimum required)
 *   - GetDraft: requires "edit" + not system
 *   - CreateDashboard: no check (user creates their own)
 *   - DuplicateDashboard: requires "view" on source
 *   - UpdateDashboard: requires "edit" + not system
 *   - SaveDraftLayout: requires "edit" + not system
 *   - PublishDashboard: requires "edit" + not system
 *   - DiscardDraft: requires "edit" + not system
 *   - ListAcl: requires "edit"
 *   - AddAcl: requires "edit"
 *   - RemoveAcl: requires "edit"
 */

import { dashboardLayoutSchema } from "@athyper/dashboard";

import { TOKENS } from "../../../../kernel/tokens.js";
import { HttpError } from "../http-error.js";

import type { HttpHandlerContext, RouteHandler } from "../../foundation/http/types.js";
import type { DashboardService, UserContext } from "../dashboard.service.js";
import type { Request, Response } from "express";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function getService(ctx: HttpHandlerContext): Promise<DashboardService> {
    return ctx.container.resolve<DashboardService>(TOKENS.dashboardService);
}

function getUserContext(ctx: HttpHandlerContext): UserContext {
    return {
        tenantId: ctx.tenant.tenantKey ?? "default",
        userId: ctx.auth.userId ?? ctx.auth.subject ?? "system",
        personas: (ctx.auth.claims?.personas as string[]) ?? [],
        roles: ctx.auth.roles,
        groups: ctx.auth.groups,
    };
}

function handleError(res: Response, error: unknown, fallbackCode: string): void {
    if (error instanceof HttpError) {
        res.status(error.status).json({
            success: false,
            error: { code: error.code, message: error.message },
        });
    } else {
        res.status(500).json({
            success: false,
            error: { code: fallbackCode, message: String(error) },
        });
    }
}

// ─────────────────────────────────────────────
// List Dashboards — GET /api/ui/dashboards?workbench=admin
// ─────────────────────────────────────────────
export class ListDashboardsHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const workbench = (req.query.workbench as string) ?? "user";
        const user = getUserContext(ctx);

        try {
            const service = await getService(ctx);
            const result = await service.listDashboards({
                tenantId: user.tenantId,
                workbench,
                userId: user.userId,
                personas: user.personas,
                roles: user.roles,
                groups: user.groups,
            });

            res.status(200).json({ success: true, data: result });
        } catch (error) {
            handleError(res, error, "LIST_DASHBOARDS_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// Get Dashboard — GET /api/ui/dashboards/:id
// Returns permission field for the calling user.
// ─────────────────────────────────────────────
export class GetDashboardHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const { id } = req.params;
        const user = getUserContext(ctx);

        try {
            const service = await getService(ctx);
            const result = await service.getPublishedWithPermission(id, user);

            if (!result) {
                res.status(404).json({
                    success: false,
                    error: { code: "DASHBOARD_NOT_FOUND", message: `Dashboard ${id} not found` },
                });
                return;
            }

            res.status(200).json({ success: true, data: result });
        } catch (error) {
            handleError(res, error, "GET_DASHBOARD_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// Get Draft — GET /api/ui/dashboards/:id/draft
// Requires "edit" permission + not system.
// ─────────────────────────────────────────────
export class GetDraftHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const { id } = req.params;
        const user = getUserContext(ctx);

        try {
            const service = await getService(ctx);
            await service.assertPermission(id, user, "edit");
            await service.assertNotSystem(id);

            // Try to get existing draft
            const draft = await service.getDraft(id);

            if (draft) {
                res.status(200).json({
                    success: true,
                    data: {
                        layout: draft.layout,
                        versionNo: draft.version_no,
                        status: draft.status,
                        createdAt: draft.created_at,
                    },
                });
                return;
            }

            // No draft — return published layout as starting point
            const published = await service.getPublished(id);
            if (!published) {
                res.status(404).json({
                    success: false,
                    error: { code: "DASHBOARD_NOT_FOUND", message: `Dashboard ${id} not found` },
                });
                return;
            }

            res.status(200).json({
                success: true,
                data: {
                    layout: published.layout,
                    versionNo: published.versionNo,
                    status: "published",
                    createdAt: published.publishedAt,
                },
            });
        } catch (error) {
            handleError(res, error, "GET_DRAFT_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// Create Dashboard — POST /api/ui/dashboards
// No permission check — user creates their own.
// Sets owner_id to the creating user.
// ─────────────────────────────────────────────
export class CreateDashboardHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const user = getUserContext(ctx);
        const body = req.body as {
            code?: string;
            titleKey?: string;
            moduleCode?: string;
            workbench?: string;
            descriptionKey?: string;
            icon?: string;
            sortOrder?: number;
            layout?: unknown;
            acl?: Array<{ principalType: string; principalKey: string; permission: string }>;
        };

        if (!body.code || !body.titleKey || !body.moduleCode || !body.workbench) {
            res.status(400).json({
                success: false,
                error: { code: "MISSING_REQUIRED_FIELDS", message: "code, titleKey, moduleCode, and workbench are required" },
            });
            return;
        }

        try {
            const service = await getService(ctx);
            const id = await service.createDashboard({
                tenantId: user.tenantId,
                code: body.code,
                titleKey: body.titleKey,
                descriptionKey: body.descriptionKey,
                moduleCode: body.moduleCode,
                workbench: body.workbench,
                icon: body.icon,
                sortOrder: body.sortOrder,
                layout: body.layout ?? { schema_version: 1, columns: 12, row_height: 80, items: [] },
                acl: body.acl ?? [],
                createdBy: user.userId,
                ownerId: user.userId,
            });

            res.status(201).json({ success: true, data: { id } });
        } catch (error) {
            handleError(res, error, "CREATE_DASHBOARD_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// Duplicate Dashboard — POST /api/ui/dashboards/:id/duplicate
// Requires "view" permission on the source dashboard.
// ─────────────────────────────────────────────
export class DuplicateDashboardHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const { id } = req.params;
        const user = getUserContext(ctx);
        const body = req.body as { newCode?: string };

        const newCode = body.newCode ?? `${id}_copy_${Date.now()}`;

        try {
            const service = await getService(ctx);
            await service.assertPermission(id, user, "view");

            const newId = await service.duplicateDashboard({
                sourceDashboardId: id,
                tenantId: user.tenantId,
                newCode,
                createdBy: user.userId,
            });

            res.status(201).json({ success: true, data: { id: newId } });
        } catch (error) {
            handleError(res, error, "DUPLICATE_DASHBOARD_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// Update Dashboard — PATCH /api/ui/dashboards/:id
// Requires "edit" permission + not system.
// ─────────────────────────────────────────────
export class UpdateDashboardHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const { id } = req.params;
        const user = getUserContext(ctx);
        const body = req.body as {
            titleKey?: string;
            descriptionKey?: string;
            isHidden?: boolean;
            is_hidden?: boolean;
            sortOrder?: number;
        };

        try {
            const service = await getService(ctx);
            await service.assertPermission(id, user, "edit");
            await service.assertNotSystem(id);

            await service.updateDashboard(id, {
                titleKey: body.titleKey,
                descriptionKey: body.descriptionKey,
                isHidden: body.isHidden ?? body.is_hidden,
                sortOrder: body.sortOrder,
                updatedBy: user.userId,
            });

            res.status(200).json({ success: true, data: { ok: true } });
        } catch (error) {
            handleError(res, error, "UPDATE_DASHBOARD_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// Save Draft Layout — PUT /api/ui/dashboards/:id/layout
// Requires "edit" permission + not system.
// ─────────────────────────────────────────────
export class SaveDraftLayoutHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const { id } = req.params;
        const user = getUserContext(ctx);
        const body = req.body as { layout?: unknown };

        if (!body.layout) {
            res.status(400).json({
                success: false,
                error: { code: "MISSING_LAYOUT", message: "layout is required" },
            });
            return;
        }

        // Validate layout schema
        const validation = dashboardLayoutSchema.safeParse(body.layout);
        if (!validation.success) {
            res.status(400).json({
                success: false,
                error: {
                    code: "INVALID_LAYOUT",
                    message: "Layout validation failed",
                    issues: validation.error.issues,
                },
            });
            return;
        }

        try {
            const service = await getService(ctx);
            await service.assertPermission(id, user, "edit");
            await service.assertNotSystem(id);

            await service.saveDraftLayout({
                dashboardId: id,
                tenantId: user.tenantId,
                layout: validation.data,
                createdBy: user.userId,
            });

            res.status(200).json({
                success: true,
                data: { ok: true, savedAt: new Date().toISOString() },
            });
        } catch (error) {
            handleError(res, error, "SAVE_DRAFT_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// Publish Dashboard — POST /api/ui/dashboards/:id/publish
// Requires "edit" permission + not system.
// ─────────────────────────────────────────────
export class PublishDashboardHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const { id } = req.params;
        const user = getUserContext(ctx);

        try {
            const service = await getService(ctx);
            await service.assertPermission(id, user, "edit");
            await service.assertNotSystem(id);

            await service.publishDashboard(id, user.userId);

            res.status(200).json({
                success: true,
                data: { ok: true, publishedAt: new Date().toISOString() },
            });
        } catch (error) {
            handleError(res, error, "PUBLISH_DASHBOARD_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// Discard Draft — DELETE /api/ui/dashboards/:id/draft
// Requires "edit" permission + not system.
// ─────────────────────────────────────────────
export class DiscardDraftHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const { id } = req.params;
        const user = getUserContext(ctx);

        try {
            const service = await getService(ctx);
            await service.assertPermission(id, user, "edit");
            await service.assertNotSystem(id);

            await service.discardDraft(id);

            res.status(200).json({ success: true, data: { ok: true } });
        } catch (error) {
            handleError(res, error, "DISCARD_DRAFT_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// List ACL — GET /api/ui/dashboards/:id/acl
// Requires "edit" permission.
// ─────────────────────────────────────────────
export class ListAclHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const { id } = req.params;
        const user = getUserContext(ctx);

        try {
            const service = await getService(ctx);
            await service.assertPermission(id, user, "edit");

            const entries = await service.getAclEntries(id);
            res.status(200).json({
                success: true,
                data: entries.map((e) => ({
                    id: e.id,
                    principalType: e.principal_type,
                    principalKey: e.principal_key,
                    permission: e.permission,
                    createdBy: e.created_by,
                    createdAt: e.created_at,
                })),
            });
        } catch (error) {
            handleError(res, error, "LIST_ACL_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// Add ACL — POST /api/ui/dashboards/:id/acl
// Requires "edit" permission.
// Body: { principalType, principalKey, permission }
// ─────────────────────────────────────────────
export class AddAclHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const { id } = req.params;
        const user = getUserContext(ctx);
        const body = req.body as {
            principalType?: string;
            principalKey?: string;
            permission?: string;
        };

        if (!body.principalType || !body.principalKey || !body.permission) {
            res.status(400).json({
                success: false,
                error: { code: "MISSING_REQUIRED_FIELDS", message: "principalType, principalKey, and permission are required" },
            });
            return;
        }

        const validTypes = ["role", "group", "user", "persona"];
        if (!validTypes.includes(body.principalType)) {
            res.status(400).json({
                success: false,
                error: { code: "INVALID_PRINCIPAL_TYPE", message: `principalType must be one of: ${validTypes.join(", ")}` },
            });
            return;
        }

        const validPermissions = ["view", "edit"];
        if (!validPermissions.includes(body.permission)) {
            res.status(400).json({
                success: false,
                error: { code: "INVALID_PERMISSION", message: `permission must be one of: ${validPermissions.join(", ")}` },
            });
            return;
        }

        try {
            const service = await getService(ctx);
            await service.assertPermission(id, user, "edit");

            const aclId = await service.addAclEntry({
                dashboardId: id,
                tenantId: user.tenantId,
                principalType: body.principalType,
                principalKey: body.principalKey,
                permission: body.permission,
                createdBy: user.userId,
            });

            res.status(201).json({ success: true, data: { id: aclId } });
        } catch (error) {
            handleError(res, error, "ADD_ACL_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// Remove ACL — DELETE /api/ui/dashboards/:id/acl/:aclId
// Requires "edit" permission.
// ─────────────────────────────────────────────
export class RemoveAclHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const { id, aclId } = req.params;
        const user = getUserContext(ctx);

        try {
            const service = await getService(ctx);
            await service.assertPermission(id, user, "edit");

            await service.removeAclEntry(aclId);

            res.status(200).json({ success: true, data: { ok: true } });
        } catch (error) {
            handleError(res, error, "REMOVE_ACL_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// Delete Dashboard — DELETE /api/ui/dashboards/:id
// Requires "owner" permission + not system.
// ─────────────────────────────────────────────
export class DeleteDashboardHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const { id } = req.params;
        const user = getUserContext(ctx);

        try {
            const service = await getService(ctx);
            await service.assertNotSystem(id);
            await service.assertOwner(id, user);

            await service.deleteDashboard(id);

            res.status(200).json({ success: true, data: { ok: true } });
        } catch (error) {
            handleError(res, error, "DELETE_DASHBOARD_FAILED");
        }
    }
}
