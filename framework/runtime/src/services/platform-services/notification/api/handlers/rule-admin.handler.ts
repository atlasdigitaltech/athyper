/**
 * Rule admin handler — Admin: CRUD notification rules.
 */

import type { RouteHandler, HttpHandlerContext } from "../../../../platform/foundation/http/types.js";
import type { ChannelCode, NotificationPriority, RecipientRule, RuleId } from "../../domain/types.js";
import type { NotificationRuleRepo } from "../../persistence/NotificationRuleRepo.js";
import type { Request, Response } from "express";

const REPO_TOKEN = "notify.repo.rule";

export class ListRulesHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const repo = await ctx.container.resolve<NotificationRuleRepo>(REPO_TOKEN);
        const tenantId = ctx.tenant.tenantKey ?? "default";

        const rules = await repo.list(tenantId, {
            limit: Number(req.query.limit) || 100,
            offset: Number(req.query.offset) || 0,
        });

        res.status(200).json({ success: true, data: rules });
    }
}

export class CreateRuleHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const repo = await ctx.container.resolve<NotificationRuleRepo>(REPO_TOKEN);
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const userId = ctx.auth.userId ?? "system";

        const body = req.body as {
            code?: string;
            name?: string;
            description?: string;
            eventType?: string;
            entityType?: string;
            lifecycleState?: string;
            conditionExpr?: Record<string, unknown>;
            templateKey?: string;
            channels?: string[];
            priority?: string;
            recipientRules?: Array<{ type: string; value: string }>;
            slaMinutes?: number;
            dedupWindowMs?: number;
        };

        if (!body.code || !body.name || !body.eventType || !body.templateKey || !body.channels?.length || !body.recipientRules?.length) {
            res.status(400).json({
                success: false,
                error: { code: "MISSING_FIELDS", message: "code, name, eventType, templateKey, channels, and recipientRules are required" },
            });
            return;
        }

        const rule = await repo.create({
            tenantId,
            code: body.code,
            name: body.name,
            description: body.description,
            eventType: body.eventType,
            entityType: body.entityType,
            lifecycleState: body.lifecycleState,
            conditionExpr: body.conditionExpr,
            templateKey: body.templateKey,
            channels: body.channels as ChannelCode[],
            priority: (body.priority ?? "normal") as NotificationPriority,
            recipientRules: body.recipientRules as RecipientRule[],
            slaMinutes: body.slaMinutes,
            dedupWindowMs: body.dedupWindowMs ?? 300000,
            createdBy: userId,
        });

        res.status(201).json({ success: true, data: rule });
    }
}

export class UpdateRuleHandler implements RouteHandler {
    async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
        const repo = await ctx.container.resolve<NotificationRuleRepo>(REPO_TOKEN);
        const ruleId = req.params.id as RuleId;
        const userId = ctx.auth.userId ?? "system";

        const body = req.body as Record<string, unknown>;

        await repo.update(ruleId, {
            ...body,
            updatedBy: userId,
        } as any);

        res.status(200).json({ success: true });
    }
}
