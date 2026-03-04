/**
 * Module contribution types — schema for dashboard.contribution.json files.
 */

import type { AclPermission, AclPrincipalType, DashboardLayout, Workbench } from "./dashboard.types.js";

// ─────────────────────────────────────────────
// Contribution JSON shape
// ─────────────────────────────────────────────

export interface DashboardContribution {
    $schema: string;
    module_code: string;
    module_name: string;
    dashboards: DashboardContributionEntry[];
}

export interface DashboardContributionEntry {
    /** Unique dashboard code within the module (e.g. "acc_overview") */
    code: string;
    /** i18n key for dashboard title */
    title_key: string;
    /** i18n key for dashboard description */
    description_key?: string;
    /** Lucide icon name */
    icon?: string;
    /** Which workbenches this dashboard appears in */
    workbenches: Workbench[];
    /** Sort order (lower = first) */
    sort_order?: number;
    /** Default ACL entries */
    acl: DashboardContributionAcl[];
    /** Dashboard layout definition */
    layout: DashboardLayout;
}

export interface DashboardContributionAcl {
    principal_type: AclPrincipalType;
    principal_key: string;
    permission: AclPermission;
}
