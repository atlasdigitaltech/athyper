/**
 * Scoped Preference Handlers — Admin endpoints for tenant-level and org-level preferences.
 */

import type { ScopedPreferenceResolver } from "../../domain/services/ScopedPreferenceResolver.js";
import type { PreferenceScope, PreferenceFrequency, QuietHours } from "../../domain/types.js";
import type { ScopedNotificationPreferenceRepo } from "../../persistence/ScopedNotificationPreferenceRepo.js";

interface HandlerContext {
    container: { resolve<T>(token: string): Promise<T> };
    tenant: { tenantId: string };
    auth: { userId?: string; roles?: string[] };
}

interface Request {
    params: Record<string, string | undefined>;
    body: unknown;
}

interface Response {
    status(code: number): Response;
    json(data: unknown): void;
}

const SCOPED_PREF_REPO_TOKEN = "notify.repo.scopedPreference";
const SCOPED_RESOLVER_TOKEN = "notify.scopedPreferences";

// ─── Set Tenant-Level Preference ────────────────────────────────────

export class SetTenantPreferenceHandler {
    async handle(req: Request, res: Response, ctx: HandlerContext): Promise<void> {
        const repo = await ctx.container.resolve<ScopedNotificationPreferenceRepo>(SCOPED_PREF_REPO_TOKEN);
        const tenantId = ctx.tenant.tenantId;
        const body = req.body as {
            eventCode: string;
            channel: string;
            isEnabled: boolean;
            frequency?: PreferenceFrequency;
            quietHours?: QuietHours;
        };

        if (!body.eventCode || !body.channel || typeof body.isEnabled !== "boolean") {
            res.status(400).json({ success: false, error: "eventCode, channel, and isEnabled are required" });
            return;
        }

        const pref = await repo.upsert({
            tenantId,
            scope: "tenant" as PreferenceScope,
            scopeId: tenantId,
            eventCode: body.eventCode,
            channel: body.channel as any,
            isEnabled: body.isEnabled,
            frequency: body.frequency,
            quietHours: body.quietHours,
            createdByPrincipalId: ctx.auth.userId,
            createdByService: ctx.auth.userId ? undefined : "admin",
        });

        res.status(200).json({ success: true, data: pref });
    }
}

// ─── Set Org-Unit-Level Preference ──────────────────────────────────

export class SetOrgPreferenceHandler {
    async handle(req: Request, res: Response, ctx: HandlerContext): Promise<void> {
        const repo = await ctx.container.resolve<ScopedNotificationPreferenceRepo>(SCOPED_PREF_REPO_TOKEN);
        const tenantId = ctx.tenant.tenantId;
        const ouId = req.params.ouId;

        if (!ouId) {
            res.status(400).json({ success: false, error: "Missing ouId" });
            return;
        }

        const body = req.body as {
            eventCode: string;
            channel: string;
            isEnabled: boolean;
            frequency?: PreferenceFrequency;
            quietHours?: QuietHours;
        };

        if (!body.eventCode || !body.channel || typeof body.isEnabled !== "boolean") {
            res.status(400).json({ success: false, error: "eventCode, channel, and isEnabled are required" });
            return;
        }

        const pref = await repo.upsert({
            tenantId,
            scope: "org_unit" as PreferenceScope,
            scopeId: ouId,
            eventCode: body.eventCode,
            channel: body.channel as any,
            isEnabled: body.isEnabled,
            frequency: body.frequency,
            quietHours: body.quietHours,
            createdByPrincipalId: ctx.auth.userId,
            createdByService: ctx.auth.userId ? undefined : "admin",
        });

        res.status(200).json({ success: true, data: pref });
    }
}

// ─── Get Effective Resolved Preference ──────────────────────────────

export class GetEffectivePreferenceHandler {
    async handle(req: Request, res: Response, ctx: HandlerContext): Promise<void> {
        const resolver = await ctx.container.resolve<ScopedPreferenceResolver>(SCOPED_RESOLVER_TOKEN);
        const tenantId = ctx.tenant.tenantId;
        const principalId = req.params.principalId;

        if (!principalId) {
            res.status(400).json({ success: false, error: "Missing principalId" });
            return;
        }

        // Return effective preferences for all common event+channel combinations
        // In a real implementation, the caller would specify eventCode and channel
        const body = req.body as { eventCode?: string; channel?: string } | undefined;
        const eventCode = body?.eventCode ?? (req as any).query?.eventCode;
        const channel = body?.channel ?? (req as any).query?.channel;

        if (!eventCode || !channel) {
            res.status(400).json({
                success: false,
                error: "eventCode and channel query params are required",
            });
            return;
        }

        const effective = await resolver.resolveEffective(
            tenantId,
            principalId,
            eventCode,
            channel as any,
        );

        res.status(200).json({ success: true, data: effective });
    }
}
