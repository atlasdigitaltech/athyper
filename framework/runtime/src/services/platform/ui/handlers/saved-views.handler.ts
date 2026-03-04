/**
 * Saved View HTTP Handlers
 *
 * CRUD handlers for ui.saved_view. Each handler implements RouteHandler
 * and delegates to SavedViewService for business logic and access control.
 */

import { TOKENS } from "../../../../kernel/tokens.js";
import { HttpError } from "../http-error.js";

import type { HttpHandlerContext, RouteHandler } from "../../foundation/http/types.js";
import type { SavedViewService, UserContext } from "../saved-view.service.js";
import type { Request, Response } from "express";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function getService(ctx: HttpHandlerContext): Promise<SavedViewService> {
    return ctx.container.resolve<SavedViewService>(TOKENS.savedViewService);
}

function getUserContext(ctx: HttpHandlerContext): UserContext {
    return {
        tenantId: ctx.tenant.tenantKey ?? "default",
        userId: ctx.auth.userId ?? ctx.auth.subject ?? "system",
        roles: ctx.auth.roles,
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
// List Views — GET /api/ui/views?entity_key=X
// ─────────────────────────────────────────────

export class ListSavedViewsHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const entityKey = req.query.entity_key as string;
        if (!entityKey) {
            res.status(400).json({
                success: false,
                error: { code: "MISSING_ENTITY_KEY", message: "entity_key query parameter is required" },
            });
            return;
        }

        const user = getUserContext(ctx);

        try {
            const service = await getService(ctx);
            const result = await service.listViews(user, entityKey);
            res.status(200).json({ success: true, data: result });
        } catch (error) {
            handleError(res, error, "LIST_VIEWS_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// Get View — GET /api/ui/views/:id
// ─────────────────────────────────────────────

export class GetSavedViewHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const { id } = req.params;
        const user = getUserContext(ctx);

        try {
            const service = await getService(ctx);
            const result = await service.getView(user, id);
            res.status(200).json({ success: true, data: result });
        } catch (error) {
            handleError(res, error, "GET_VIEW_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// Create View — POST /api/ui/views
// ─────────────────────────────────────────────

export class CreateSavedViewHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const body = req.body as Record<string, unknown>;

        if (!body.entityKey || !body.name || body.stateJson === undefined) {
            res.status(400).json({
                success: false,
                error: {
                    code: "MISSING_REQUIRED_FIELDS",
                    message: "entityKey, name, and stateJson are required",
                },
            });
            return;
        }

        const user = getUserContext(ctx);

        try {
            const service = await getService(ctx);
            const result = await service.createView(user, {
                entityKey: body.entityKey as string,
                scope: (body.scope as string) ?? "USER",
                name: body.name as string,
                isPinned: body.isPinned as boolean | undefined,
                isDefault: body.isDefault as boolean | undefined,
                stateJson: body.stateJson,
            });

            res.status(201).json({ success: true, data: result });
        } catch (error) {
            handleError(res, error, "CREATE_VIEW_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// Update View — PATCH /api/ui/views/:id
// ─────────────────────────────────────────────

export class UpdateSavedViewHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const { id } = req.params;
        const body = req.body as Record<string, unknown>;

        if (body.version === undefined) {
            res.status(400).json({
                success: false,
                error: { code: "MISSING_VERSION", message: "version is required for optimistic concurrency" },
            });
            return;
        }

        const user = getUserContext(ctx);

        try {
            const service = await getService(ctx);
            const result = await service.updateView(user, id, {
                name: body.name as string | undefined,
                isPinned: body.isPinned as boolean | undefined,
                isDefault: body.isDefault as boolean | undefined,
                stateJson: body.stateJson,
                version: body.version as number,
            });

            res.status(200).json({ success: true, data: result });
        } catch (error) {
            handleError(res, error, "UPDATE_VIEW_FAILED");
        }
    }
}

// ─────────────────────────────────────────────
// Delete View — DELETE /api/ui/views/:id
// ─────────────────────────────────────────────

export class DeleteSavedViewHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const { id } = req.params;
        const user = getUserContext(ctx);

        try {
            const service = await getService(ctx);
            await service.deleteView(user, id);
            res.status(200).json({ success: true });
        } catch (error) {
            handleError(res, error, "DELETE_VIEW_FAILED");
        }
    }
}
