/**
 * SMS Handlers — send + list SMS messages.
 */

import type { RouteHandler, HttpHandlerContext } from "../../../../platform/foundation/http/types.js";
import type { ISmsProviderAdapter } from "../../adapters/SmsProviderAdapter.js";
import type { TelMetrics } from "../../observability/metrics.js";
import type { SmsLogRepo } from "../../persistence/SmsLogRepo.js";
import type { Request, Response } from "express";

const SMS_ADAPTER_TOKEN = "tel.adapter.sms";
const SMS_LOG_REPO_TOKEN = "tel.repo.smsLog";
const METRICS_TOKEN = "tel.metrics";

export class SendSmsHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const smsAdapter = await ctx.container.resolve<ISmsProviderAdapter>(SMS_ADAPTER_TOKEN);
        const smsLogRepo = await ctx.container.resolve<SmsLogRepo>(SMS_LOG_REPO_TOKEN);
        const metrics = await ctx.container.resolve<TelMetrics>(METRICS_TOKEN);

        const tenantId = ctx.tenant.tenantKey!;
        const createdBy = ctx.auth.userId ?? "system";

        // Create log entry first
        const logEntry = await smsLogRepo.create({
            tenantId,
            direction: "outbound",
            fromNumber: req.body.from ?? "",
            toNumber: req.body.to,
            body: req.body.body,
            createdBy,
        });

        try {
            const result = await smsAdapter.send({
                from: req.body.from ?? "",
                to: req.body.to,
                body: req.body.body,
                tenantId,
            });

            await smsLogRepo.updateStatus(tenantId, logEntry.id, "sent", result.messageRef);
            metrics.smsSent({ tenant: tenantId });

            res.status(201).json({ success: true, data: { id: logEntry.id, messageRef: result.messageRef } });
        } catch (err) {
            await smsLogRepo.updateStatus(tenantId, logEntry.id, "failed");
            metrics.smsFailed({ tenant: tenantId, reason: "send_error" });

            res.status(500).json({ success: false, error: "SMS send failed" });
        }
    }
}

export class ListSmsLogsHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const smsLogRepo = await ctx.container.resolve<SmsLogRepo>(SMS_LOG_REPO_TOKEN);
        const direction = req.query.direction as string | undefined;
        const status = req.query.status as string | undefined;
        const limit = parseInt((req.query.limit as string) ?? "50", 10);
        const offset = parseInt((req.query.offset as string) ?? "0", 10);

        const logs = await smsLogRepo.list(ctx.tenant.tenantKey!, { direction, status, limit, offset });
        res.status(200).json({ success: true, data: logs });
    }
}

export class GetSmsLogHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const smsLogRepo = await ctx.container.resolve<SmsLogRepo>(SMS_LOG_REPO_TOKEN);
        const log = await smsLogRepo.getById(ctx.tenant.tenantKey!, req.params.id);
        if (!log) {
            res.status(404).json({ success: false, error: "SMS log not found" });
            return;
        }
        res.status(200).json({ success: true, data: log });
    }
}
