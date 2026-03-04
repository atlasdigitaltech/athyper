/**
 * @athyper/dashboard — meta-driven dashboard engine types, schemas, and registry.
 */

// Types
export type {
    AclPermission,
    AclPrincipalType,
    Dashboard,
    DashboardAcl,
    DashboardExport,
    DashboardGroup,
    DashboardLayout,
    DashboardListItem,
    DashboardVersion,
    DashboardVersionStatus,
    DashboardVersionSummary,
    DashboardVisibility,
    GridPosition,
    LayoutItem,
    TemplateItem,
    Workbench,
} from "./types/dashboard.types.js";

export type {
    ChartParams,
    HeadingParams,
    KpiParams,
    ListParams,
    ShortcutParams,
    SpacerParams,
    WidgetDefinition,
    WidgetType,
} from "./types/widget.types.js";
export { WIDGET_TYPES } from "./types/widget.types.js";

export type {
    DashboardContribution,
    DashboardContributionAcl,
    DashboardContributionEntry,
} from "./types/contribution.types.js";

export type {
    ResolvedDashboard,
    ResolutionContext,
    ResolutionTier,
} from "./types/resolution.types.js";

// Schemas
export {
    chartParamsSchema,
    headingParamsSchema,
    kpiParamsSchema,
    listParamsSchema,
    shortcutParamsSchema,
    spacerParamsSchema,
    widgetParamsSchemaMap,
} from "./schemas/widget-params.schema.js";

export {
    dashboardExportSchema,
    dashboardLayoutSchema,
    gridPositionSchema,
    layoutItemSchema,
} from "./schemas/layout.schema.js";

export {
    dashboardContributionSchema,
} from "./schemas/contribution.schema.js";

// Registry
export { WidgetRegistry } from "./registry/widget-registry.js";
export { createStandardWidgetRegistry, standardWidgets } from "./registry/standard-widgets.js";

// Resolution
export { resolveDashboard } from "./resolution/resolve-dashboard.js";
export type { ResolutionCandidate } from "./resolution/resolve-dashboard.js";
