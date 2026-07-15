"use client";

import type {
  ActiveFilterEntry,
  ResolvedColumn,
  RuntimeField,
  SortEntry,
  ViewDensity,
  ViewMode,
} from "../../core/types";
import type { RuntimeListFeatures, RuntimeListSlots, SavedView } from "../../adapter/types";
import { ColumnControl } from "./column-control";
import { DensityControl } from "./density-control";
import { FilterControl } from "./filter-control";
import { GroupControl } from "./group-control";
import { SavedViewsControl } from "./saved-views-control";
import { SearchControl } from "./search-control";
import { SortControl } from "./sort-control";
import { ViewModeControl } from "./view-mode-control";
import { OrganizePaletteProvider } from "./organize-state";

export type OrganizePaletteScope = "full" | "relation" | "picker" | "custom";

export interface OrganizePaletteConfig {
  scope?: OrganizePaletteScope;
  // Release 2 only. Declared for the child-view contract but intentionally not
  // wired into Release 1 URL behavior until scoped parsing exists server-side.
  stateKey?: string;
  controls?: Partial<Record<
    "search" | "filter" | "sort" | "group" | "columns" | "density" | "viewMode" | "savedViews",
    boolean
  >>;
}

interface OrganizePaletteProps {
  entityCode:        string;
  searchValue:      string;
  pageSize:         number;
  listBaseHref:     string;
  rawSearchParams:  Record<string, string | string[] | undefined>;
  activeSort:       SortEntry[];
  activeFilters:    ActiveFilterEntry[];
  groupField?:      string;
  columns:          ResolvedColumn[];
  allColumns:       ResolvedColumn[];
  defaultColumns:   ResolvedColumn[];
  density:          ViewDensity;
  viewMode:         ViewMode;
  defaultViewMode?: ViewMode;
  savedViews:       SavedView[];
  activeSavedViewId:string | null;
  savedViewsApiHref?: string | null;
  fieldOptionsApiHrefBase?: string | null;
  filterableFields: RuntimeField[];
  sortableFields:   RuntimeField[];
  groupableFields:  RuntimeField[];
  features:         RuntimeListFeatures;
  slots?:           RuntimeListSlots;
  config?:          OrganizePaletteConfig;
}

export function OrganizePalette(props: OrganizePaletteProps) {
  const controls = props.config?.controls ?? {};
  const show = (name: keyof NonNullable<OrganizePaletteConfig["controls"]>, fallback = true) =>
    controls[name] ?? fallback;

  return (
    <OrganizePaletteProvider>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto" data-organize-palette>
          {props.slots?.organizeLeading}

          {show("search") && (
            <SearchControl
              searchValue={props.searchValue}
              pageSize={props.pageSize}
              listBaseHref={props.listBaseHref}
              rawSearchParams={props.rawSearchParams}
            />
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border bg-background p-1 shadow-sm">
            <span className="hidden px-1.5 text-sm font-medium text-foreground md:inline">Organize</span>
            {show("filter") && (
              <FilterControl
                fieldOptionsApiHrefBase={props.fieldOptionsApiHrefBase}
                filterableFields={props.filterableFields}
                listBaseHref={props.listBaseHref}
                rawSearchParams={props.rawSearchParams}
              />
            )}
            {show("sort") && (
              <SortControl
                activeSort={props.activeSort}
                sortableFields={props.sortableFields}
                listBaseHref={props.listBaseHref}
                rawSearchParams={props.rawSearchParams}
                multiSort={Boolean(props.features.multiSort)}
                maxSortLevels={props.features.maxSortLevels}
              />
            )}
            {show("group") && (
              <GroupControl
                groupField={props.groupField}
                groupableFields={props.groupableFields}
                visibleColumns={props.columns}
                listBaseHref={props.listBaseHref}
                rawSearchParams={props.rawSearchParams}
                enabled={props.features.grouping}
              />
            )}
            {show("columns") && (
              <ColumnControl
                columns={props.columns}
                allColumns={props.allColumns}
                defaultColumns={props.defaultColumns}
                listBaseHref={props.listBaseHref}
                rawSearchParams={props.rawSearchParams}
                enabled={props.features.columnCustomization}
              />
            )}

            <Divider />

            {show("density") && (
              <DensityControl
                density={props.density}
                listBaseHref={props.listBaseHref}
                rawSearchParams={props.rawSearchParams}
              />
            )}
            {show("viewMode") && (
              <ViewModeControl
                viewMode={props.viewMode}
                viewModes={props.features.viewModes}
                listBaseHref={props.listBaseHref}
                rawSearchParams={props.rawSearchParams}
              />
            )}

            {props.features.savedViews && show("savedViews") && (
              <>
                <Divider />
                <SavedViewsControl
                  entityCode={props.entityCode}
                  savedViews={props.savedViews}
                  activeSavedViewId={props.activeSavedViewId}
                  savedViewsApiHref={props.savedViewsApiHref}
                  activeSort={props.activeSort}
                  filterableFields={props.filterableFields}
                  columns={props.columns}
                  allColumns={props.allColumns}
                  defaultColumns={props.defaultColumns}
                  groupField={props.groupField}
                  viewMode={props.viewMode}
                  defaultViewMode={props.defaultViewMode}
                  density={props.density}
                  listBaseHref={props.listBaseHref}
                  rawSearchParams={props.rawSearchParams}
                  enabled={props.features.savedViews}
                />
              </>
            )}

            {props.slots?.organizeTrailing}
          </div>
        </div>
      </div>
    </OrganizePaletteProvider>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />;
}
