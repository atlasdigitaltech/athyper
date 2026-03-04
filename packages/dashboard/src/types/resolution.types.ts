/**
 * Dashboard resolution types — override resolution order.
 *
 * Resolution order (highest priority first):
 * 1. user override      (visibility='user', owner_id=current_user)
 * 2. tenant override    (visibility='tenant', forked_from_id IS NOT NULL, published)
 * 3. tenant default     (visibility='tenant', forked_from_id IS NULL, published)
 * 4. system default     (visibility='system', tenant_id IS NULL)
 * 5. platform fallback  (empty dashboard with module heading)
 */

import type { DashboardLayout, DashboardVisibility, Workbench } from "./dashboard.types.js";

export type ResolutionTier =
    | "user_override"
    | "tenant_override"
    | "tenant_default"
    | "system_default"
    | "platform_fallback";

export interface ResolvedDashboard {
    dashboardId: string;
    code: string;
    titleKey: string;
    descriptionKey?: string;
    moduleCode: string;
    workbench: Workbench;
    visibility: DashboardVisibility;
    layout: DashboardLayout;
    versionNo: number;
    resolvedFrom: ResolutionTier;
}

export interface ResolutionContext {
    tenantId: string;
    userId: string;
    workbench: Workbench;
    moduleCode: string;
    dashboardCode: string;
}
