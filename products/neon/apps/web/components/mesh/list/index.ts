// components/mesh/list/index.ts
//
// Barrel export for the CollectionExplorerPage component system.

// Types
export type {
    AdvancedFilterFieldDef,
    BulkAction,
    ColumnDef,
    Density,
    ExplorerCapabilities,
    GroupRule,
    InfiniteScrollState,
    ItemGroup,
    KanbanConfig,
    KanbanLaneDef,
    KpiDef,
    KpiVariant,
    ListPageConfig,
    ListPageState,
    PresetScope,
    PreviewRenderer,
    QuickFilterDef,
    RowAction,
    ScrollMode,
    SortRule,
    TreeConfig,
    ViewMode,
    ViewModeDef,
    ViewPreset,
} from "./types";

// Context + Hooks
export { ListPageProvider, useListPage, useListPageActions, ListScrollContainer } from "./ListPageContext";
export { useUrlFilters } from "./use-url-filters";

// Zone 1 — Page Header
export { ListPageHeader } from "./ListPageHeader";
export { ListContentHeader } from "./ListContentHeader";

// Zone 2 — KPI Summary
export { KpiSummaryBar } from "./KpiSummaryBar";

// Zone 3 — Command Bar
export { ListCommandBar } from "./ListCommandBar";
export { ViewDropdown } from "./ViewDropdown";
export { SettingsDropdown } from "./SettingsDropdown";
export { ViewSwitcher, ViewModeToggle } from "./ViewSwitcher";
// Filter Chips
export { FilterChips } from "./FilterChips";

// Zone 3B — Advanced Filters
export { AdvancedFilterPanel } from "./AdvancedFilterPanel";
export { AdaptFiltersSheet } from "./AdaptFiltersSheet";

// Zone 4 — Results (individual views)
export { EntityDataGrid } from "./EntityDataGrid";
export { EntityCardGrid } from "./EntityCardGrid";
export { AdjustableDataGrid } from "./AdjustableDataGrid";
export { KanbanBoard } from "./KanbanBoard";
export { EntityTreeView } from "./EntityTreeView";

// Zone 4 — View Router (renders active view + preview drawer + settings sheet)
export { ViewRouter } from "./ViewRouter";

// Zone 4B — View Settings
export { ViewSettingsSheet } from "./ViewSettingsSheet";

// Zone 5 — Preview Drawer
export { PreviewDrawer } from "./PreviewDrawer";

// Zone 5 — Row expansion (built into DataGridRow, no separate export needed)

// Selection
export { SelectionToolbar } from "./SelectionToolbar";

// Footer
export { ListPageFooter } from "./ListPageFooter";

// Infinite Scroll
export { InfiniteScrollSentinel } from "./InfiniteScrollSentinel";
export { BackToTopButton } from "./BackToTopButton";
