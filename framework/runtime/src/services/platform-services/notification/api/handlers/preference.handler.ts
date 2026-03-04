/**
 * Notification preference handler — User-facing: get/update preferences.
 */

import type { RouteHandler, HttpHandlerContext } from "../../../../platform/foundation/http/types.js";
import type { ChannelCode } from "../../domain/types.js";
import type { NotificationPreferenceRepo } from "../../persistence/NotificationPreferenceRepo.js";
import type { Request, Response } from "express";

const REPO_TOKEN = "notify.repo.preference";

export class GetPreferencesHandler implements RouteHandler {
    async handle(_req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const repo = await ctx.container.resolve<NotificationPreferenceRepo>(REPO_TOKEN);
        const userId = ctx.auth.userId;
        const tenantId = ctx.tenant.tenantKey ?? "default";

        if (!userId) {
            res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED", message: "User ID required" } });
            return;
        }

        const preferences = await repo.getForUser(tenantId, userId);
        res.status(200).json({ success: true, data: preferences });
    }
}

export class UpdatePreferencesHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const repo = await ctx.container.resolve<NotificationPreferenceRepo>(REPO_TOKEN);
        const userId = ctx.auth.userId;
        const tenantId = ctx.tenant.tenantKey ?? "default";

        if (!userId) {
            res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED", message: "User ID required" } });
            return;
        }

        const body = req.body as {
            eventCode?: string;
            channel?: string;
            enabled?: boolean;
        };

        if (!body.eventCode || !body.channel || body.enabled === undefined) {
            res.status(400).json({
                success: false,
                error: { code: "MISSING_FIELDS", message: "eventCode, channel, and enabled are required" },
            });
            return;
        }

        await repo.upsert({
            tenantId,
            principalId: userId,
            eventCode: body.eventCode,
            channel: body.channel as ChannelCode,
            isEnabled: body.enabled,
            createdBy: userId,
        });

        res.status(200).json({ success: true });
    }
}
