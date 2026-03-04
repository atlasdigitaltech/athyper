/**
 * Dashboard domain types — metadata-driven dashboard definitions.
 */

// ─────────────────────────────────────────────
// Core dashboard types
// ─────────────────────────────────────────────

export type Workbench = "user" | "admin" | "partner";
export type DashboardVisibility = "system" | "tenant" | "user";
export type DashboardVersionStatus = "draft" | "published" | "archived";
export type AclPrincipalType = "role" | "group" | "user" | "persona";
export type AclPermission = "view" | "edit";

export interface Dashboard {
    id: string;
    tenantId: string | null;
    code: string;
    titleKey: string;
    descriptionKey?: string;
    moduleCode: string;
    workbench: Workbench;
    visibility: DashboardVisibility;
    icon?: string;
    sortOrder: number;
    isHidden: boolean;
    forkedFromId?: string;
    ownerId?: string;
    createdAt: string;
    createdBy: string;
    updatedAt?: string;
    updatedBy?: string;
}

export interface DashboardVersion {
    id: string;
    tenantId: string | null;
    dashboardId: string;
    versionNo: number;
    status: DashboardVersionStatus;
    layout: DashboardLayout;
    publishedAt?: string;
    publishedBy?: string;
    createdAt: string;
    createdBy: string;
}

export interface DashboardAcl {
    id: string;
    tenantId: string | null;
    dashboardId: string;
    principalType: AclPrincipalType;
    principalKey: string;
    permission: AclPermission;
    createdAt: string;
    createdBy: string;
}

// ─────────────────────────────────────────────
// Layout types (stored as JSON in dashboard_version.layout)
// ─────────────────────────────────────────────

export interface DashboardLayout {
    schema_version: 1;
    columns: 12;
    row_height: number;
    items: LayoutItem[];
}

export interface LayoutItem {
    /** Unique widget instance id within this layout */
    id: string;
    /** Registered widget type key (e.g. "kpi", "chart", "list") */
    widget_type: string;
    /** Widget-specific parameters (validated by WidgetRegistry) */
    params: Record<string, unknown>;
    /** Grid placement */
    grid: GridPosition;
}

export interface GridPosition {
    /** Column start (0-based, 0–11) */
    x: number;
    /** Row start (0-based) */
    y: number;
    /** Width in columns (1–12) */
    w: number;
    /** Height in row units */
    h: number;
}

// ─────────────────────────────────────────────
// Sidebar list item (API response shape)
// ─────────────────────────────────────────────

export interface DashboardListItem {
    id: string;
    code: string;
    titleKey: string;
    descriptionKey?: string;
    moduleCode: string;
    workbench: Workbench;
    visibility: DashboardVisibility;
    icon?: string;
    sortOrder: number;
    isHidden: boolean;
    forkedFromId?: string;
    permission: AclPermission;
}

/** Dashboards grouped by module for sidebar rendering */
export interface DashboardGroup {
    moduleCode: string;
    moduleName: string;
    dashboards: DashboardListItem[];
}

// ─────────────────────────────────────────────
// Export / Import
// ─────────────────────────────────────────────

export interface DashboardExport {
    $schema: "athyper-dashboard-export-v1";
    exportedAt: string;
    dashboard: {
        code: string;
        titleKey: string;
        descriptionKey?: string;
        moduleCode: string;
        icon?: string;
    };
    layout: DashboardLayout;
}

// ─────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────

export interface TemplateItem {
    id: string;
    code: string;
    titleKey: string;
    descriptionKey?: string;
    moduleCode: string;
    icon?: string;
    widgetCount: number;
}

// ─────────────────────────────────────────────
// Version History
// ─────────────────────────────────────────────

export interface DashboardVersionSummary {
    id: string;
    versionNo: number;
    status: DashboardVersionStatus;
    publishedAt?: string;
    publishedBy?: string;
    createdAt: string;
    createdBy: string;
    widgetCount: number;
}
