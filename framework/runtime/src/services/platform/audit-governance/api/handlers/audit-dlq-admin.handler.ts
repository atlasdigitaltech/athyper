/**
 * Audit DLQ Admin Handlers — Dead-letter queue inspection, retry, and bulk replay.
 * Follows dlq-admin.handler.ts from notification module.
 */

import type { AuditDlqManager } from "../../domain/AuditDlqManager.js";

// ─── Handler Interfaces ─────────────────────────────────────────────

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

const DLQ_TOKEN = "audit.dlqManager";

// ─── List DLQ Entries ───────────────────────────────────────────────

export class ListAuditDlqHandler {
  async handle(req: Request, res: Response, ctx: HandlerContext): Promise<void> {
    const dlqManager = await ctx.container.resolve<AuditDlqManager>(DLQ_TOKEN);
    const tenantId = ctx.tenant.tenantId;

    const eventType = req.query.eventType;
    const unreplayedOnly = req.query.unreplayedOnly === "true";
    const limit = parseInt(req.query.limit ?? "50", 10);
    const offset = parseInt(req.query.offset ?? "0", 10);

    const entries = await dlqManager.list(tenantId, {
      eventType,
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

export class InspectAuditDlqHandler {
  async handle(req: Request, res: Response, ctx: HandlerContext): Promise<void> {
    const dlqManager = await ctx.container.resolve<AuditDlqManager>(DLQ_TOKEN);
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

export class RetryAuditDlqHandler {
  async handle(req: Request, res: Response, ctx: HandlerContext): Promise<void> {
    const dlqManager = await ctx.container.resolve<AuditDlqManager>(DLQ_TOKEN);
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

export class BulkReplayAuditDlqHandler {
  async handle(req: Request, res: Response, ctx: HandlerContext): Promise<void> {
    const dlqManager = await ctx.container.resolve<AuditDlqManager>(DLQ_TOKEN);
    const tenantId = ctx.tenant.tenantId;
    const replayedBy = ctx.auth.userId ?? "admin";

    const limit = (req.body as any)?.limit ?? 100;
    const result = await dlqManager.bulkReplay(tenantId, replayedBy, limit);

    res.status(200).json({ success: true, data: result });
  }
}
