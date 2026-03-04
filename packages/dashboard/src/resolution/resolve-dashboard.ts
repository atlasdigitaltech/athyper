/**
 * Dashboard resolution — 5-tier override resolution order.
 *
 * When rendering a dashboard, resolve in this priority:
 * 1. user override      (visibility='user', owner_id = current user)
 * 2. tenant override    (visibility='tenant', forked_from_id IS NOT NULL, published)
 * 3. tenant default     (visibility='tenant', forked_from_id IS NULL, published)
 * 4. system default     (visibility='system', tenant_id IS NULL)
 * 5. platform fallback  (empty dashboard with module heading)
 */

import type { DashboardLayout } from "../types/dashboard.types.js";
import type { ResolvedDashboard, ResolutionContext, ResolutionTier } from "../types/resolution.types.js";

/**
 * Candidate from the database layer — each tier produces zero or one candidate.
 */
export interface ResolutionCandidate {
    dashboardId: string;
    code: string;
    titleKey: string;
    descriptionKey?: string;
    moduleCode: string;
    visibility: "system" | "tenant" | "user";
    forkedFromId?: string;
    layout: DashboardLayout;
    versionNo: number;
}

/**
 * Resolve the best dashboard for a given context from a list of candidates.
 *
 * Candidates should be pre-filtered by module_code + workbench and
 * only include published versions (or system defaults).
 */
export function resolveDashboard(
    candidates: ResolutionCandidate[],
    ctx: ResolutionContext,
): ResolvedDashboard {
    // Tier 1: user override
    const userOverride = candidates.find(
        (c) => c.visibility === "user",
    );
    if (userOverride) {
        return toResolved(userOverride, ctx, "user_override");
    }

    // Tier 2: tenant override (forked from system)
    const tenantOverride = candidates.find(
        (c) => c.visibility === "tenant" && c.forkedFromId != null,
    );
    if (tenantOverride) {
        return toResolved(tenantOverride, ctx, "tenant_override");
    }

    // Tier 3: tenant default (not forked)
    const tenantDefault = candidates.find(
        (c) => c.visibility === "tenant" && c.forkedFromId == null,
    );
    if (tenantDefault) {
        return toResolved(tenantDefault, ctx, "tenant_default");
    }

    // Tier 4: system default
    const systemDefault = candidates.find(
        (c) => c.visibility === "system",
    );
    if (systemDefault) {
        return toResolved(systemDefault, ctx, "system_default");
    }

    // Tier 5: platform fallback
    return {
        dashboardId: "platform-fallback",
        code: ctx.dashboardCode,
        titleKey: `dashboard.${ctx.moduleCode}.fallback.title`,
        moduleCode: ctx.moduleCode,
        workbench: ctx.workbench,
        visibility: "system",
        layout: createFallbackLayout(ctx.moduleCode),
        versionNo: 0,
        resolvedFrom: "platform_fallback",
    };
}

function toResolved(
    candidate: ResolutionCandidate,
    ctx: ResolutionContext,
    tier: ResolutionTier,
): ResolvedDashboard {
    return {
        dashboardId: candidate.dashboardId,
        code: candidate.code,
        titleKey: candidate.titleKey,
        descriptionKey: candidate.descriptionKey,
        moduleCode: candidate.moduleCode,
        workbench: ctx.workbench,
        visibility: candidate.visibility,
        layout: candidate.layout,
        versionNo: candidate.versionNo,
        resolvedFrom: tier,
    };
}

function createFallbackLayout(moduleCode: string): DashboardLayout {
    return {
        schema_version: 1,
        columns: 12,
        row_height: 80,
        items: [
            {
                id: "fallback-heading",
                widget_type: "heading",
                params: {
                    text_key: `dashboard.${moduleCode}.fallback.title`,
                    level: "h2",
                },
                grid: { x: 0, y: 0, w: 12, h: 1 },
            },
        ],
    };
}
