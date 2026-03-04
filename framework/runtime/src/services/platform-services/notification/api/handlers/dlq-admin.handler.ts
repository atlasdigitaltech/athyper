/**
 * DLQ Admin Handlers — Dead-letter queue inspection, retry, and bulk replay.
 */

import type { DlqManager } from "../../domain/services/DlqManager.js";

// ─── Handler Interfaces ─────────────────────────────────────────────
// These follow the existing handler pattern used throughout the notification module.

interface HandlerContext {
    container: { resolve<T>(token: string): Promise<T> };
    tenant: { tenantId: string };
    auth: { userId?: string; roles?: string[] };
}

interface Request {
    query: Record<string, string | undefined>;
    params: Record<string, string | undefined>;
    body: unknown;
}

interface Response {
    status(code: number): Response;
    json(data: unknown): void;
}

const DLQ_TOKEN = "notify.dlqManager";

// ─── List DLQ Entries ───────────────────────────────────────────────

export class ListDlqHandler {
    async handle(req: Request, res: Response, ctx: HandlerContext): Promise<void> {
        const dlqManager = await ctx.container.resolve<DlqManager>(DLQ_TOKEN);
        const tenantId = ctx.tenant.tenantId;

        const channel = req.query.channel;
        const unreplayedOnly = req.query.unreplayedOnly === "true";
        const limit = parseInt(req.query.limit ?? "50", 10);
        const offset = parseInt(req.query.offset ?? "0", 10);

        const entries = await dlqManager.list(tenantId, {
            channel,
            unreplayedOnly,
            limit,
            offset,
        });

        res.status(200).json({
            success: true,
            data: entries,
        });
    }
}

// ─── Inspect Single DLQ Entry ───────────────────────────────────────

export class InspectDlqHandler {
    async handle(req: Request, res: Response, ctx: HandlerContext): Promise<void> {
        const dlqManager = await ctx.container.resolve<DlqManager>(DLQ_TOKEN);
        const tenantId = ctx.tenant.tenantId;
        const dlqId = req.params.id;

        if (!dlqId) {
            res.status(400).json({ success: false, error: "Missing DLQ entry ID" });
            return;
        }

        const entry = await dlqManager.inspect(tenantId, dlqId);
        if (!entry) {
            res.status(404).json({ success: false, error: "DLQ entry not found" });
            return;
        }

        res.status(200).json({ success: true, data: entry });
    }
}

// ─── Retry Single DLQ Entry ────────────────────────────────────────

export class RetryDlqHandler {
    async handle(req: Request, res: Response, ctx: HandlerContext): Promise<void> {
        const dlqManager = await ctx.container.resolve<DlqManager>(DLQ_TOKEN);
        const tenantId = ctx.tenant.tenantId;
        const dlqId = req.params.id;
        const replayedBy = ctx.auth.userId ?? "admin";

        if (!dlqId) {
            res.status(400).json({ success: false, error: "Missing DLQ entry ID" });
            return;
        }

        try {
            await dlqManager.retry(tenantId, dlqId, replayedBy);
            res.status(200).json({ success: true, message: "DLQ entry replayed" });
        } catch (err) {
            res.status(404).json({ success: false, error: String(err) });
        }
    }
}

// ─── Bulk Replay DLQ Entries ───────────────────────────────────────

export class BulkReplayDlqHandler {
    async handle(req: Request, res: Response, ctx: HandlerContext): Promise<void> {
        const dlqManager = await ctx.container.resolve<DlqManager>(DLQ_TOKEN);
        const tenantId = ctx.tenant.tenantId;
        const replayedBy = ctx.auth.userId ?? "admin";
        const body = (req.body ?? {}) as { channel?: string };

        const limit = (req.body as any)?.limit ?? 100;
        const result = await dlqManager.bulkReplay(tenantId, replayedBy, limit);

        res.status(200).json({ success: true, data: result });
    }
}
