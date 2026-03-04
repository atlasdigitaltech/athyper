/**
 * DLQ admin handlers — List, inspect, retry, and bulk replay for render DLQ.
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type { RouteHandler, HttpHandlerContext } from "../../../../platform/foundation/http/types.js";
import type { DocRenderDlqManager } from "../../domain/services/DocRenderDlqManager.js";
import type { Request, Response } from "express";


export class ListDlqEntriesHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const dlqManager = await ctx.container.resolve<DocRenderDlqManager>(TOKENS.documentDlqManager);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const entries = await dlqManager.list(tenantId, {
            unreplayedOnly: req.query.unreplayedOnly === "true",
            limit: Number(req.query.limit) || 100,
            offset: Number(req.query.offset) || 0,
        });

        res.status(200).json({ success: true, data: entries });
    }
}

export class InspectDlqEntryHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const dlqManager = await ctx.container.resolve<DocRenderDlqManager>(TOKENS.documentDlqManager);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const entry = await dlqManager.inspect(tenantId, req.params.id);
        if (!entry) {
            res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "DLQ entry not found" } });
            return;
        }

        res.status(200).json({ success: true, data: entry });
    }
}

export class RetryDlqEntryHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const dlqManager = await ctx.container.resolve<DocRenderDlqManager>(TOKENS.documentDlqManager);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const userId = ctx.auth.userId ?? "system";

        const ok = await dlqManager.retry(tenantId, req.params.id, userId);
        if (!ok) {
            res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "DLQ entry not found" } });
            return;
        }

        res.status(200).json({ success: true });
    }
}

export class BulkReplayDlqHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const dlqManager = await ctx.container.resolve<DocRenderDlqManager>(TOKENS.documentDlqManager);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const userId = ctx.auth.userId ?? "system";

        const body = req.body as { limit?: number };
        const result = await dlqManager.bulkReplay(tenantId, userId, body.limit ?? 100);

        res.status(200).json({ success: true, data: result });
    }
}
