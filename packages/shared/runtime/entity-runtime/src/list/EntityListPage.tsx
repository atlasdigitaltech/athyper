/**
 * @athyper/entity-runtime — EntityListPage
 *
 * Renders a master record list from compiled metadata.
 * Columns, filters, sort, and search are all driven by the descriptor.
 *
 * View modes:
 *   list      — DataTable (default)
 *   board     — KanbanView grouped by status/groupable field, with inline transitions
 *   compact   — Card grid
 *   dashboard — Aggregate KPI tiles + status distribution + numeric aggregates
 *
 * Board and dashboard modes are gated:
 *   board     — only shown when the entity has a groupable field
 *   dashboard — always available (falls back to total/today counts only)
 *
 * URL state — all list params (search, filters, sort, view, saved view) are in
 * the URL. The URL is the single source of truth. No component-local state for
 * list query params.
 *
 * Sort — controlled / server-side:
 *   - DataTable headers write to URL via setSort (server-side sort).
 *   - Default sort comes from display_config (via resolvePresentationConfig)
 *     and is applied when no URL sort param is present.
 *
 * Saved views — loading a view sets savedViewId + baseSavedViewId in URL.
 *   Subsequent changes clear savedViewId → "Modified from <name>" indicator.
 *
 * Semantic badges — status chips use theme resolvers (kanbanStatusIntent,
 *   apArStatusIntent, etc.) driven by ColumnPresentation.semanticResolver.
 *   No local badge maps.
 *
 * Bulk ops — selection bar when 1+ rows selected in list mode.
 */
"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutList,
  LayoutGrid,
  Trash2,
  Download,
  Filter as FilterIcon,
  Kanban,
  BarChart2,
  AlertCircle,
  RotateCcw,
  Save,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  MoreHorizontal,
  TableProperties,
  ExternalLink,
  AppWindow,
  Copy,
  Check,
  ArrowUpDown,
  Layers,
  Columns3,
  X as XIcon,
  AlignJustify,
  Zap,
  Server,
  Shield,
  ScrollText,
} from "lucide-react";
import { useCompiledEntity, useEntityList, useEntityOperations, useSavedViews, useSaveView, useUpdateView, useStatusRoute, useLookupDomain, useRecordBookmarks, useCommentCounts } from "@athyper/query";
import { getActionIcon } from "@athyper/icons/actions";
import {
  getOverflowActions,
  getToolbarActions,
  resolveActionsForSurface,
  type ResolvedAction,
} from "@athyper/metadata-client/operation-reader";
import type { CompiledEntity, EntityField, EntityOperation } from "@athyper/api-contracts/metadata";
import { FilterPillBar, SearchInput } from "@athyper/ui/composites";
import { resolveListConfig, resolvePresentationConfig } from "@athyper/metadata-client/compiled-reader";
import { resolvePresentationConfig as resolveDisplayConfig } from "../metadata";
import { DataTable, type ColumnDef, type RowSelectionState, type SortingState } from "@athyper/ui/data";
import { PageShell } from "../shell/PageShell";
import { PageHeader } from "../shell/PageHeader";
import {
  Button, Badge, Skeleton, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { stateToApiParams, getFilterStringValues, describeFilterEntry } from "@athyper/api-contracts/entity-list";
import type {
  ColumnPresentation,
  EntityListQueryState,
  EntityListFilters,
  EntityListSortEntry,
  FilterEntry,
  BulkPreflightResult,
  BulkActionResult,
} from "@athyper/api-contracts/entity-list";
import { resolveFieldRenderer } from "../field-renderers/registry";
import { ActionBar } from "../actions/ActionBar";
import { KanbanView, findKanbanGroupField } from "./KanbanView";
import { DashboardView } from "./DashboardView";
import { ExcelView } from "./ExcelView";
import { useEntityListUrl } from "./useEntityListUrl";
import { FilterDrawer } from "./FilterDrawer";
import { SortDrawer } from "./SortDrawer";
import { GroupDrawer } from "./GroupDrawer";
import { ColumnDrawer } from "./ColumnDrawer";
import { GroupedListView } from "./GroupedListView";
import { RowMetaStrip } from "./RowMetaStrip";
import { ColumnFilterHeader } from "./ColumnFilterHeader";
import { describeVirtualFilter, isVirtualFilter } from "./virtualFilterLabels";
import { RuntimeStatusText, listTypography, runtimeStatusDotClass } from "./listPresentation";

export interface EntityListPageProps {
  entityCode: string;
}

type ViewMode = "list" | "board" | "compact" | "dashboard" | "excel";

// Maps display_config v2 canonical view-mode names → legacy EntityListPage ViewMode names.
const B5_TO_LEGACY_MODE: Record<string, ViewMode> = {
  table:       "list",
  compact:     "compact",
  kanban:      "board",
  dashboard:   "dashboard",
  spreadsheet: "excel",
};

const DESKTOP_VIEW_QUERY = "(min-width: 1280px)";

function useIsDesktopViewport(): boolean | undefined {
  const [isDesktop, setIsDesktop] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_VIEW_QUERY);
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

function firstAllowedViewMode(
  modes: ViewMode[] | undefined,
  candidates: ViewMode[],
): ViewMode {
  if (!modes || modes.length === 0) return candidates[0] ?? "list";
  return candidates.find((mode) => modes.includes(mode)) ?? modes[0] ?? "list";
}

function savedViewDisplayName(view: { name: string; is_default?: boolean }): string {
  if (view.is_default) return "My Default View";
  return view.name;
}

function entityTypeLabel(entity: CompiledEntity): string {
  const label =
    entity.display_config.document_header?.type_label ??
    entity.display_config.master_config?.type_label ??
    entity.entity_name;
  return label.replace(/_/g, " ").toUpperCase();
}

function getStatusValue(row: Record<string, unknown>, statusFieldNames: string[] = []): string {
  const fieldNames = uniqueFieldNames([
    ...statusFieldNames,
    "status",
    "record_status",
    "state",
  ]);
  for (const fieldName of fieldNames) {
    const value = row[fieldName];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

function normalizeNavValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return undefined;
}

function uniqueFieldNames(names: unknown[]): string[] {
  const seen = new Set<string>();
  const fields: string[] = [];
  for (const name of names) {
    if (typeof name !== "string") continue;
    const field = name.trim();
    if (!field || seen.has(field)) continue;
    seen.add(field);
    fields.push(field);
  }
  return fields;
}

function resolveRecordNavId(row: Record<string, unknown>, fieldNames: string[]): string | undefined {
  for (const fieldName of fieldNames) {
    const value = normalizeNavValue(row[fieldName]);
    if (value) return value;
  }
  return normalizeNavValue(row.id);
}

// ── Compact card grid ─────────────────────────────────────────────────────────

const COMPACT_DENSITY = {
  compact: {
    grid:       "grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    card:       "flex min-h-[7.25rem] flex-col gap-1.5 rounded-xl border bg-card p-3 shadow-xs transition-all hover:border-primary/30 hover:shadow-sm",
    title:      "truncate text-sm font-semibold leading-snug text-foreground",
    code:       "text-doc-compact-code font-medium leading-none text-muted-foreground",
    header:     "flex min-h-4 items-center justify-between gap-3",
    status:     "shrink-0 text-doc-badge",
    meta:       "mt-1 truncate text-xs font-medium text-muted-foreground/70",
    audit:      "mt-auto flex items-center justify-between gap-2 pt-2 text-doc-support text-muted-foreground/55",
  },
  comfortable: {
    grid:       "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    card:       "flex min-h-[8rem] flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs transition-all hover:border-primary/30 hover:shadow-sm",
    title:      "truncate text-sm font-semibold leading-snug text-foreground",
    code:       "text-doc-compact-code font-medium leading-none text-muted-foreground",
    header:     "flex min-h-4 items-center justify-between gap-3",
    status:     "shrink-0 text-doc-badge",
    meta:       "mt-1 truncate text-xs font-medium text-muted-foreground/70",
    audit:      "mt-auto flex items-center justify-between gap-2 pt-2 text-doc-support text-muted-foreground/55",
  },
  spacious: {
    grid:       "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    card:       "flex min-h-[9rem] flex-col gap-2.5 rounded-xl border bg-card p-5 shadow-xs transition-all hover:border-primary/30 hover:shadow-sm",
    title:      "truncate text-sm font-semibold leading-snug text-foreground",
    code:       "text-doc-field-label font-medium leading-none text-muted-foreground",
    header:     "flex min-h-4 items-center justify-between gap-3",
    status:     "shrink-0 text-xs",
    meta:       "mt-1 truncate text-xs font-medium text-muted-foreground/70",
    audit:      "mt-auto flex items-center justify-between gap-2 pt-2 text-doc-support text-muted-foreground/55",
  },
} as const;

type CompactCardConfig = {
  bottom_fields?: string[];
};

function compactCardConfig(entity: CompiledEntity): CompactCardConfig | undefined {
  const raw = entity.display_config.compact_card;
  if (!raw || typeof raw !== "object") return undefined;
  const bottomFields = (raw as CompactCardConfig).bottom_fields;
  return Array.isArray(bottomFields) ? { bottom_fields: bottomFields } : undefined;
}

function isStatusFieldName(fieldName: string, statusFieldNames: string[]): boolean {
  return statusFieldNames.includes(fieldName) || ["status", "record_status", "state", "lifecycle_state"].includes(fieldName);
}

function isCompactBottomCandidate(field: EntityField): boolean {
  return !field.is_computed && !["json", "jsonb", "text_array", "uuid_array", "int_array", "jsonb_array"].includes(field.data_type);
}

function humanizeCompactToken(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function compactCountryLabel(value: string): string {
  const code = value.trim().toUpperCase();
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function compactMetaValue(field: EntityField, value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  const raw = String(value).trim();
  if (!raw) return undefined;
  if (field.ui_type === "country" || field.name.endsWith("_country_code")) {
    return compactCountryLabel(raw);
  }
  return humanizeCompactToken(raw);
}

function compactAuditFieldNames(entity: CompiledEntity): { createdAt: string; updatedAt: string } {
  const documentHeader = entity.display_config.document_header;
  return {
    createdAt: documentHeader?.created_at_field ?? "created_at",
    updatedAt: documentHeader?.updated_at_field ?? "updated_at",
  };
}

function compactAuditTime(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function CompactStatusText({
  value,
  resolverName,
  className,
}: {
  value: string;
  resolverName?: string;
  className?: string;
}) {
  if (!value) return null;
  return (
    <span className={cn("inline-flex items-center gap-2 font-medium text-foreground", className)}>
      <span className={cn("size-2 rounded-full", runtimeStatusDotClass(value, resolverName))} aria-hidden="true" />
      <span className="truncate">{humanizeCompactToken(value)}</span>
    </span>
  );
}

function CompactView({
  rows,
  entity,
  codeFieldName,
  titleFieldName,
  statusFieldNames,
  onRowClick,
  onRowContextMenu,
  statusResolverName,
  compactColumns,
  density = "compact",
}: {
  rows:               Record<string, unknown>[];
  entity:             CompiledEntity;
  codeFieldName:      string;
  titleFieldName:     string;
  statusFieldNames:   string[];
  onRowClick?:        (row: Record<string, unknown>) => void;
  onRowContextMenu?:  (row: Record<string, unknown>, e: { clientX: number; clientY: number; preventDefault(): void }) => void;
  statusResolverName?: string;
  /** Presentation-config columns filtered to compactVisible !== false. */
  compactColumns:     ColumnPresentation[];
  density?:           "compact" | "comfortable" | "spacious";
}) {
  if (rows.length === 0) {
    return (
      <div className={listTypography.emptyState}>No records</div>
    );
  }

  const d = COMPACT_DENSITY[density] ?? COMPACT_DENSITY.comfortable;
  const fieldByName = new Map(entity.fields.map((field) => [field.name, field]));
  const auditFields = compactAuditFieldNames(entity);
  const configuredBottomFields = uniqueFieldNames(compactCardConfig(entity)?.bottom_fields ?? []);
  const fallbackBottomFields = uniqueFieldNames([
    ...(entity.display_config.list_columns ?? []),
    ...compactColumns.map((col) => col.fieldName),
  ]);
  const bottomFields = (configuredBottomFields.length > 0 ? configuredBottomFields : fallbackBottomFields)
    .filter((fieldName) => fieldName !== codeFieldName && fieldName !== titleFieldName)
    .filter((fieldName) => !isStatusFieldName(fieldName, statusFieldNames))
    .map((fieldName) => fieldByName.get(fieldName))
    .filter((field): field is EntityField => !!field && isCompactBottomCandidate(field))
    .slice(0, 2);

  return (
    <div className={d.grid}>
      {rows.map((row) => {
        const id     = String(row.id ?? "");
        const code   = String(row[codeFieldName] ?? row.code ?? row[titleFieldName] ?? id);
        const title  = String(row[titleFieldName] ?? row.name ?? row[codeFieldName] ?? id);
        const status = getStatusValue(row, statusFieldNames);
        const metaValues = bottomFields
          .map((field) => compactMetaValue(field, row[field.name]))
          .filter((value): value is string => !!value);
        const createdAt = compactAuditTime(row[auditFields.createdAt]);
        const updatedAt = compactAuditTime(row[auditFields.updatedAt]);
        return (
          <div
            key={id}
            onClick={() => onRowClick?.(row)}
            onContextMenu={(e) => onRowContextMenu?.(row, e)}
            className={cn(d.card, onRowClick && "cursor-pointer")}
          >
            <div className={d.header}>
              <span className={cn(d.code, "min-w-0 truncate tabular-nums")}>{code}</span>
              {status && (
                <CompactStatusText
                  value={status}
                  resolverName={statusResolverName}
                  className={d.status}
                />
              )}
            </div>

            <p className={d.title}>{title}</p>

            {metaValues.length > 0 && (
              <p className={d.meta}>{metaValues.join(" · ")}</p>
            )}

            {(createdAt || updatedAt) && (
              <div className={d.audit}>
                <span className="min-w-0 truncate text-left tabular-nums" title={createdAt ? `Created ${createdAt}` : undefined}>
                  {createdAt ? `Created ${createdAt}` : ""}
                </span>
                <span className="min-w-0 truncate text-right tabular-nums" title={updatedAt ? `Updated ${updatedAt}` : undefined}>
                  {updatedAt ? `Updated ${updatedAt}` : ""}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Organize segmented control ────────────────────────────────────────────────
//
// Segmented pill: Filter | Sort | Group | Columns
// Each segment opens its drawer directly. Active state indicated by primary tint.

interface OrganizerPaletteProps {
  activeDrawer:     string | null;
  onOpen:           (d: "filter" | "sort" | "group" | "columns") => void;
  hasActiveFilters: boolean;
  filterCount:      number;
  sortCount:        number;
  groupField?:      string;
  visibleColumns:   number;
  totalColumns:     number;
  showColumns:      boolean;
  mode:             ViewMode;
  density?:         "compact" | "comfortable" | "spacious";
  hasGroupable:     boolean;
  onChangeMode:     (m: ViewMode) => void;
  onChangeDensity:  (d: "compact" | "comfortable" | "spacious" | undefined) => void;
  availableModes?:  ViewMode[];
  savedViews:       { id: string; name: string; is_default?: boolean }[];
  activeSavedViewId?: string;
  modifiedFromName?: string;
  onSelectSavedView: (viewId: string) => void;
  hasSaveableChanges: boolean;
  entityCode:       string;
  state:            EntityListQueryState;
  isModified:       boolean;
  baseSavedViewId?: string;
  baseName?:        string;
}

function OrganizerPalette({
  activeDrawer, onOpen,
  hasActiveFilters, filterCount,
  sortCount, groupField, visibleColumns, totalColumns, showColumns,
  mode, density, hasGroupable, onChangeMode, onChangeDensity, availableModes,
  savedViews, activeSavedViewId, modifiedFromName, onSelectSavedView,
  hasSaveableChanges, entityCode, state, isModified, baseSavedViewId, baseName,
}: OrganizerPaletteProps) {
  const anyOrganize = hasActiveFilters || sortCount > 0 || !!groupField || visibleColumns > 0;
  const defaultSavedView = savedViews.find((view) => view.is_default);

  const seg = "relative flex h-7 w-8 shrink-0 items-center justify-center rounded-md text-xs font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
  const segCls = (name: "filter" | "sort" | "group" | "columns" | "view" | "save", dataActive: boolean) =>
    cn(seg,
      activeDrawer === name
        ? "bg-foreground text-background shadow-sm hover:bg-foreground/90 hover:text-background"
        : dataActive
        ? "bg-background text-primary shadow-sm ring-1 ring-primary/20 hover:bg-primary/10 hover:text-primary"
        : "text-muted-foreground hover:bg-background hover:text-foreground",
    );
  return (
    <TooltipProvider delayDuration={180}>
      <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-border/70 bg-muted/40 p-0.5 shadow-sm">
        <span
          className={cn(
            "hidden h-7 select-none items-center rounded-md px-2.5 text-xs font-semibold text-muted-foreground sm:flex",
            anyOrganize && "text-foreground",
          )}
        >
          Organize
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onOpen("filter")}
              className={segCls("filter", hasActiveFilters)}
              aria-label={hasActiveFilters ? `${filterCount} active filter${filterCount !== 1 ? "s" : ""}` : "Filter"}
              aria-pressed={activeDrawer === "filter"}
            >
              <FilterIcon className="h-3.5 w-3.5 shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            {hasActiveFilters ? `${filterCount} active filter${filterCount !== 1 ? "s" : ""}` : "Filter"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onOpen("sort")}
              className={segCls("sort", sortCount > 0)}
              aria-label={sortCount > 0 ? `${sortCount} sort${sortCount !== 1 ? "s" : ""} active` : "Sort"}
              aria-pressed={activeDrawer === "sort"}
            >
              <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            {sortCount > 0 ? `${sortCount} sort${sortCount !== 1 ? "s" : ""} active` : "Sort"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onOpen("group")}
              className={segCls("group", !!groupField)}
              aria-label={groupField ? `Grouped by ${groupField.replace(/_/g, " ")}` : "Group"}
              aria-pressed={activeDrawer === "group"}
            >
              <Layers className="h-3.5 w-3.5 shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            {groupField ? `Grouped by ${groupField.replace(/_/g, " ")}` : "Group"}
          </TooltipContent>
        </Tooltip>

        {showColumns && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onOpen("columns")}
                className={segCls("columns", visibleColumns > 0)}
                aria-label={visibleColumns > 0 ? `${visibleColumns} of ${totalColumns} columns` : "Columns"}
                aria-pressed={activeDrawer === "columns"}
              >
                <Columns3 className="h-3.5 w-3.5 shrink-0" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              {visibleColumns > 0 ? `${visibleColumns} of ${totalColumns} columns` : "Columns"}
            </TooltipContent>
          </Tooltip>
        )}

        <ViewLauncherButton
          mode={mode}
          density={density}
          hasGroupable={hasGroupable}
          onChangeMode={onChangeMode}
          onChangeDensity={onChangeDensity}
          availableModes={availableModes}
          savedViews={savedViews}
          activeSavedViewId={activeSavedViewId}
          modifiedFromName={modifiedFromName}
          onSelectSavedView={onSelectSavedView}
          triggerClassName={segCls("view", mode !== "list")}
        />

        <SaveViewSegment
          entityCode={entityCode}
          state={state}
          isModified={isModified}
          baseSavedViewId={baseSavedViewId}
          baseName={baseName}
          defaultSavedViewId={defaultSavedView?.id}
          defaultSavedViewName={defaultSavedView?.name}
          triggerClassName={segCls("save", hasSaveableChanges)}
        />
      </div>
    </TooltipProvider>
  );
}

// ── View launcher button ──────────────────────────────────────────────────────
//
// "View: List ▾" dropdown — mode + density selection.

interface ViewLauncherButtonProps {
  mode:             ViewMode;
  density?:         "compact" | "comfortable" | "spacious";
  hasGroupable:     boolean;
  onChangeMode:     (m: ViewMode) => void;
  onChangeDensity:  (d: "compact" | "comfortable" | "spacious" | undefined) => void;
  /** When set, restricts the listed view modes to only those in this array. */
  availableModes?:  ViewMode[];
  savedViews:       { id: string; name: string; is_default?: boolean }[];
  activeSavedViewId?: string;
  modifiedFromName?: string;
  onSelectSavedView: (viewId: string) => void;
  triggerClassName?: string;
}

function ViewLauncherButton({
  mode, density, hasGroupable, onChangeMode, onChangeDensity, availableModes,
  savedViews, activeSavedViewId, modifiedFromName, onSelectSavedView,
  triggerClassName,
}: ViewLauncherButtonProps) {
  const [open, setOpen] = useState(false);

  type ModeOption = { value: ViewMode; Icon: typeof LayoutList; label: string; gated?: boolean };
  const modeOptions: ModeOption[] = [
    { value: "list",      Icon: LayoutList,      label: "List" },
    { value: "board",     Icon: Kanban,          label: "Board",      gated: !hasGroupable },
    { value: "compact",   Icon: LayoutGrid,      label: "Compact" },
    { value: "dashboard", Icon: BarChart2,       label: "Dashboard" },
    { value: "excel",     Icon: TableProperties, label: "Spreadsheet" },
  ];

  const currentLabel = modeOptions.find((o) => o.value === mode)?.label ?? "List";
  const CurrentIcon  = modeOptions.find((o) => o.value === mode)?.Icon  ?? LayoutList;

  const row    = "flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-muted/60";
  const rowAct = (active: boolean) => cn(row, active ? "text-primary font-medium" : "text-foreground");
  const hdg    = "px-3 pt-2.5 pb-0.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground select-none";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={`View: ${currentLabel}`}
          aria-label={`View: ${currentLabel}`}
          className={cn(
            triggerClassName ??
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input bg-background shadow-sm text-xs font-medium transition-colors text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            open && "bg-foreground text-background shadow-sm hover:bg-foreground/90 hover:text-background",
          )}
        >
          <CurrentIcon className="h-3.5 w-3.5 shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        className="w-[clamp(13rem,calc(100vw-1.5rem),16rem)] max-h-[min(34rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto p-0"
      >
        <DropdownMenuLabel className={hdg}>View</DropdownMenuLabel>
        {(availableModes
          ? modeOptions.filter((o) => availableModes.includes(o.value) && !o.gated)
          : modeOptions.filter((o) => !o.gated)
        ).map(({ value, Icon, label }) => (
          <DropdownMenuItem key={value} onSelect={() => onChangeMode(value)} className={rowAct(mode === value)}>
            <Icon className={cn("h-3.5 w-3.5 shrink-0", mode !== value && "text-muted-foreground")} />
            <span className="flex-1">{label}</span>
            {mode === value && <Check className="h-3 w-3 text-primary" />}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator className="my-1 bg-border/60" />

        <DropdownMenuLabel className={hdg}>Density</DropdownMenuLabel>
        {(["compact", "comfortable", "spacious"] as const).map((d) => (
          <DropdownMenuItem key={d} onSelect={() => onChangeDensity(d)} className={cn(rowAct((density ?? "comfortable") === d), "pb-0.5")}>
            <span className="flex-1 capitalize">{d}</span>
            {(density ?? "comfortable") === d && <Check className="h-3 w-3 text-primary" />}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator className="my-1 bg-border/60" />

        <DropdownMenuLabel className={hdg}>Saved Views</DropdownMenuLabel>
        {modifiedFromName && (
          <div className="px-3 pb-1 text-2xs text-muted-foreground">
            Modified from &quot;{modifiedFromName === "Default View" ? "My Default View" : modifiedFromName}&quot;
          </div>
        )}
        <DropdownMenuItem
          onSelect={() => onSelectSavedView("__all")}
          className={rowAct(activeSavedViewId === "__all")}
        >
          <RotateCcw className={cn("h-3.5 w-3.5 shrink-0", activeSavedViewId !== "__all" && "text-muted-foreground")} />
          <span className="flex-1 truncate">System Default View</span>
          {activeSavedViewId === "__all" && <Check className="h-3 w-3 text-primary" />}
        </DropdownMenuItem>
        {savedViews.length > 0 && (
          <div className="max-h-[clamp(5rem,calc(var(--radix-dropdown-menu-content-available-height)-15rem),14rem)] overflow-y-auto pb-1">
            {savedViews.map((view) => (
              <DropdownMenuItem
                key={view.id}
                onSelect={() => onSelectSavedView(view.id)}
                className={rowAct(activeSavedViewId === view.id)}
              >
                <Save className={cn("h-3.5 w-3.5 shrink-0", activeSavedViewId !== view.id && "text-muted-foreground")} />
                <span className="flex-1 truncate">{savedViewDisplayName(view)}</span>
                {activeSavedViewId === view.id && <Check className="h-3 w-3 text-primary" />}
              </DropdownMenuItem>
            ))}
          </div>
        )}
        <div className="pb-1" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Slim settings menu ────────────────────────────────────────────────────────
//
// ≡ dropdown: Reload List | Manage Access | Permission Log

interface ListSettingsMenuProps {
  entityCode: string;
  onReload:   () => void | Promise<unknown>;
  reloading?: boolean;
  operations?: EntityOperation[];
}

function ListSettingsMenu({ entityCode, onReload, reloading = false, operations }: ListSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [pendingActionCode, setPendingActionCode] = useState<string | null>(null);
  const router = useRouter();

  const entityActions = useMemo(() => {
    if (!operations) return [];
    const actions = resolveActionsForSurface(operations, "LIST");
    return [...getToolbarActions(actions), ...getOverflowActions(actions)];
  }, [operations]);

  const nav = (path: string) => { setOpen(false); router.push(path); };
  const reload = () => {
    setOpen(false);
    void onReload();
  };

  const runEntityAction = async (action: ResolvedAction) => {
    setOpen(false);
    const actionKey = action.handlerTarget ?? action.permissionCode.split(".").pop() ?? action.permissionCode;
    const normalizedKey = actionKey.replace(/^\//, "");

    if (action.handlerType === "NAVIGATE" && action.handlerTarget) {
      nav(
        action.handlerTarget
          .replace("{entityCode}", entityCode)
          .replace("{entity}", entityCode),
      );
      return;
    }

    if (normalizedKey === "import" || action.permissionCode.endsWith(".import")) {
      nav(`/app/${entityCode}/import`);
      return;
    }

    if (normalizedKey === "bulk_update" || action.permissionCode.endsWith(".bulk_update")) {
      nav(`/app/${entityCode}/bulk`);
      return;
    }

    if (normalizedKey === "export" || action.permissionCode.endsWith(".export")) {
      setPendingActionCode(action.permissionCode);
      try {
        const res = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: "csv", selectionMode: "all" }),
        });
        const data = await res.json().catch(() => ({})) as { downloadUrl?: string };
        if (!res.ok) throw new Error("Export failed");
        if (data.downloadUrl) window.location.href = `/api/relay${data.downloadUrl}`;
      } finally {
        setPendingActionCode(null);
      }
    }
  };

  const row = "flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-muted/60 text-muted-foreground hover:text-foreground";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Settings"
          aria-label="Settings"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md border border-border bg-foreground text-background shadow-sm transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            open && "opacity-85",
          )}
        >
          <AlignJustify className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={6} className="w-56 p-0">
        {entityActions.length > 0 && (
          <>
            <DropdownMenuLabel className="px-3 pb-1 pt-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Entity
            </DropdownMenuLabel>
            {entityActions.map((action) => {
              const Icon = getActionIcon(action.icon ?? action.permissionCode.split(".").pop() ?? "settings");
              const pending = pendingActionCode === action.permissionCode;
              return (
                <DropdownMenuItem
                  key={action.permissionCode}
                  disabled={pendingActionCode !== null}
                  onSelect={(event) => {
                    event.preventDefault();
                    void runEntityAction(action);
                  }}
                  className={cn(row, "text-foreground disabled:opacity-50")}
                >
                  {pending ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <Icon size={14} className="shrink-0 text-muted-foreground" />
                  )}
                  <span>{action.label}</span>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator className="my-1 bg-border/60" />
          </>
        )}

        <DropdownMenuItem
          onSelect={reload}
          disabled={reloading}
          className={cn(row, entityActions.length === 0 && "pt-2.5", "text-foreground disabled:opacity-50")}
        >
          {reloading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span>{reloading ? "Reloading List" : "Reload List"}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1 bg-border/60" />

        <DropdownMenuItem onSelect={() => nav(`/setup/policies?entity=${entityCode}`)} className={row}>
          <Shield className="h-3.5 w-3.5 shrink-0" />
          <span>Manage Access</span>
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={() => nav(`/setup/audit/events?entity=${entityCode}`)} className={cn(row, "pb-2")}>
          <ScrollText className="h-3.5 w-3.5 shrink-0" />
          <span>Permission Log</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Saved view modified indicator ─────────────────────────────────────────────

function ModifiedIndicator({
  baseName,
  onDiscard,
}: {
  baseName:  string | undefined;
  onDiscard: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-1.5 text-xs text-warning">
      <AlertCircle className="h-3 w-3 shrink-0" />
      <span>Modified{baseName ? ` from "${baseName}"` : ""}</span>
      <button
        onClick={onDiscard}
        className="ml-1 flex items-center gap-1 underline-offset-2 hover:underline"
        title="Discard changes and reload saved view"
      >
        <RotateCcw className="h-3 w-3" />
        Discard
      </button>
    </div>
  );
}

// ── Save view bar ─────────────────────────────────────────────────────────────

function SaveViewSegment({
  entityCode,
  state,
  isModified,
  baseSavedViewId,
  baseName,
  defaultSavedViewId,
  defaultSavedViewName,
  triggerClassName,
}: {
  entityCode:     string;
  state:          EntityListQueryState;
  isModified:     boolean;
  baseSavedViewId?: string;
  baseName?:      string;
  defaultSavedViewId?: string;
  defaultSavedViewName?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen]     = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName]     = useState("");
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultSaved, setDefaultSaved] = useState(false);
  const nameInputRef        = useRef<HTMLInputElement>(null);

  const saveView   = useSaveView();
  const updateView = useUpdateView(entityCode);

  const viewConfig = useMemo(() => {
    const config: EntityListQueryState = { ...state };
    delete config.savedViewId;
    delete config.baseSavedViewId;
    delete config.page;
    return config;
  }, [state]);

  const handleSaveNew = () => {
    if (!name.trim()) return;
    saveView.mutate(
      {
        entity_code: entityCode,
        name:        name.trim(),
        is_default:  false,
        is_shared:   false,
        config:      viewConfig,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setName("");
        },
      },
    );
  };

  const handleUpdate = () => {
    if (!baseSavedViewId) return;
    updateView.mutate({ viewId: baseSavedViewId, config: viewConfig });
  };

  const markSavedViewDefault = async (viewId: string) => {
    const res = await fetch(
      `/api/relay/platform/saved-views/${encodeURIComponent(entityCode)}/${encodeURIComponent(viewId)}/default`,
      { method: "PATCH" },
    );
    if (!res.ok) throw new Error("Failed to set default saved view");
  };

  const handleSaveCurrentAsDefault = async () => {
    setSavingDefault(true);
    try {
      let targetViewId = baseSavedViewId ?? defaultSavedViewId;

      if (baseSavedViewId) {
        if (isModified) {
          await updateView.mutateAsync({ viewId: baseSavedViewId, config: viewConfig });
        }
      } else if (defaultSavedViewId) {
        await updateView.mutateAsync({
          viewId: defaultSavedViewId,
          config: viewConfig,
          name: defaultSavedViewName,
        });
      } else {
        const created = await saveView.mutateAsync({
          entity_code: entityCode,
          name:        "My Default View",
          is_default:  false,
          is_shared:   false,
          config:      viewConfig,
        });
        targetViewId = created.id;
      }

      if (targetViewId) await markSavedViewDefault(targetViewId);
      setDefaultSaved(true);
      setTimeout(() => setDefaultSaved(false), 2000);
    } catch {
      // Keep the menu lightweight; failed preference writes are non-destructive.
    } finally {
      setSavingDefault(false);
    }
  };

  const saving = saveView.isPending || updateView.isPending || savingDefault;
  const canUpdateBaseView = isModified && !!baseSavedViewId;
  const row = "flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-muted/60";

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={canUpdateBaseView ? "Save or update view" : "Save as View"}
            aria-label={canUpdateBaseView ? "Save or update view" : "Save as View"}
            disabled={saving}
            className={cn(
              triggerClassName ??
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input bg-background shadow-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
              menuOpen && "bg-foreground text-background shadow-sm hover:bg-foreground/90 hover:text-background",
              saving && "pointer-events-none opacity-60",
            )}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 shrink-0" />
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={6} className="w-56 p-0">
          {canUpdateBaseView && (
            <DropdownMenuItem
              disabled={saving}
              onSelect={() => handleUpdate()}
              className={cn(row, "pt-2.5 text-foreground")}
            >
              {updateView.isPending ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 truncate">Update{baseName ? ` "${baseName === "Default View" ? "My Default View" : baseName}"` : " view"}</span>
            </DropdownMenuItem>
          )}

          {canUpdateBaseView && <DropdownMenuSeparator className="my-1 bg-border/60" />}

          <DropdownMenuItem
            onSelect={() => { setName(""); setOpen(true); }}
            className={cn(row, canUpdateBaseView ? "text-foreground" : "pt-2.5 text-foreground")}
          >
            <Save className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span>Save as View</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1 bg-border/60" />

          <DropdownMenuItem
            disabled={savingDefault}
            onSelect={(event) => {
              event.preventDefault();
              void handleSaveCurrentAsDefault();
            }}
            className={cn(row, "pb-2.5 text-foreground disabled:opacity-50")}
          >
            {defaultSaved ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
            ) : savingDefault ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span>{defaultSaved ? "My default saved" : "Save current as my default"}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save View</DialogTitle>
            <DialogDescription>
              Give this list configuration a name to recall it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="view-name">Name</Label>
            <Input
              id="view-name"
              ref={nameInputRef}
              placeholder="e.g. Open AP invoices"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveNew(); }}
              autoFocus
            />
          </div>
          <DialogFooter className="pt-3 flex-row items-center justify-end gap-2 space-x-0 sm:space-x-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-4"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-9 min-w-20 px-4"
              onClick={handleSaveNew}
              disabled={!name.trim() || saving}
            >
              {saveView.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Bulk action dialog ────────────────────────────────────────────────────────
//
// Full pre-flight → confirm → execute → result flow.
// Phase:
//   idle       — bar shown, user hasn't clicked an action yet
//   preflight  — POST /bulk-preflight in flight
//   confirm    — dialog with eligible/skipped/denied summary; Confirm gated by canProceed
//   executing  — POST /bulk-action in flight
//   done       — result summary shown; Close clears selection

type BulkPhase = "preflight" | "confirm" | "executing" | "done";

function BulkActionDialog({
  entityCode,
  selectedIds,
  operations,
  onClear,
}: {
  entityCode:  string;
  selectedIds: string[];
  operations:  EntityOperation[];
  onClear:     () => void;
}) {
  const [phase,        setPhase]        = useState<BulkPhase | null>(null);
  const [preflight,    setPreflight]    = useState<BulkPreflightResult | null>(null);
  const [result,       setResult]       = useState<BulkActionResult | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [showRecords,  setShowRecords]  = useState(false);

  // Always-on background preflight — fires whenever selection changes (debounced 300 ms).
  // Provides "Post (8 of 15 eligible)" counts on each button before the user clicks.
  const [preflightMap,     setPreflightMap]     = useState<Record<string, BulkPreflightResult | null>>({});
  const [preflightLoading, setPreflightLoading] = useState(false);
  const preflightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const count = selectedIds.length;

  // Derive bulk action buttons from operations (memoised — stable dep for the effect below).
  // LIST non-record-required ops (export, import) + DETAIL record-required non-NAVIGATE ops.
  const displayOps = useMemo<ResolvedAction[]>(() => {
    const bulkListOps   = resolveActionsForSurface(operations, "LIST").filter(
      (a) => !a.requiresRecord && a.handlerType !== "NAVIGATE",
    );
    const bulkRecordOps = resolveActionsForSurface(operations, "DETAIL").filter(
      (a) => a.requiresRecord && a.handlerType !== "NAVIGATE",
    );
    const all = [...bulkListOps, ...bulkRecordOps].slice(0, 6);
    if (all.length > 0) return all;
    // Fallback when no ops seeded
    return [{ permissionCode: "export", label: "Export", handlerType: "API" as const, icon: null, handlerTarget: null, placement: "TOOLBAR" as const, requiresRecord: false, sortOrder: 0 }];
  }, [operations]);

  // Stable list of action codes for the effect dep (avoids object-identity churn)
  const displayOpCodes = useMemo(
    () => displayOps.map((op) => op.permissionCode.split(".").pop() ?? op.permissionCode),
    [displayOps],
  );

  // Background preflight: re-run for every op whenever selection changes
  useEffect(() => {
    if (selectedIds.length === 0) {
      setPreflightMap({});
      return;
    }
    if (preflightTimerRef.current) clearTimeout(preflightTimerRef.current);
    preflightTimerRef.current = setTimeout(() => {
      setPreflightLoading(true);
      Promise.all(
        displayOpCodes.map(async (actionCode) => {
          try {
            const res = await fetch(`/api/records/${entityCode}/bulk-preflight`, {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ action: actionCode, recordIds: selectedIds }),
            });
            if (!res.ok) return [actionCode, null] as const;
            const data = (await res.json()) as BulkPreflightResult;
            return [actionCode, data] as const;
          } catch {
            return [actionCode, null] as const;
          }
        }),
      )
        .then((entries) => {
          setPreflightMap(Object.fromEntries(entries));
          setPreflightLoading(false);
        })
        .catch(() => { setPreflightLoading(false); });
    }, 300);

    return () => {
      if (preflightTimerRef.current) clearTimeout(preflightTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join(","), entityCode, displayOpCodes.join(",")]);

  const runPreflight = async (action: string) => {
    setActiveAction(action);
    setPhase("preflight");
    setError(null);
    try {
      const res = await fetch(`/api/records/${entityCode}/bulk-preflight`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action, recordIds: selectedIds }),
      });
      if (!res.ok) throw new Error(`Preflight failed: ${res.status}`);
      const data = (await res.json()) as BulkPreflightResult;
      setPreflight(data);
      setPhase("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preflight failed");
      setPhase(null);
    }
  };

  // On click: use cached preflight result to skip the network round-trip.
  // Falls back to runPreflight only when the background check hasn't resolved yet.
  const handleActionClick = (actionCode: string) => {
    const cached = preflightMap[actionCode];
    if (cached) {
      setActiveAction(actionCode);
      setPreflight(cached);
      setPhase("confirm");
      setError(null);
    } else {
      void runPreflight(actionCode);
    }
  };

  const runAction = async () => {
    if (!activeAction || !preflight) return;
    setPhase("executing");
    setError(null);
    try {
      const res = await fetch(`/api/records/${entityCode}/bulk-action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: activeAction, recordIds: selectedIds }),
      });
      if (!res.ok) throw new Error(`Action failed: ${res.status}`);
      const data = (await res.json()) as BulkActionResult;
      setResult(data);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      setPhase("confirm"); // keep confirm open so user can retry
    }
  };

  const closeDialog = () => {
    setPhase(null);
    setPreflight(null);
    setResult(null);
    setActiveAction(null);
    setError(null);
    setShowRecords(false);
    if (phase === "done") onClear();
  };

  return (
    <>
      {/* Selection bar */}
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2">
        <span className="text-sm font-medium">{count} selected</span>
        <div className="ml-auto flex items-center gap-2">
          {displayOps.map((op) => {
            const actionCode  = op.permissionCode.split(".").pop() ?? op.permissionCode;
            const isDestruct  = ["delete","cancel","deny","reject","void"].includes(actionCode);
            const pf          = preflightMap[actionCode];
            // "Post (8 of 15 eligible)" — shown once background preflight resolves
            const countSuffix = preflightLoading
              ? " (…)"
              : pf != null
              ? ` (${pf.eligible} of ${count})`
              : "";
            // Disable when preflight confirms 0 eligible records
            const isIneligible = !preflightLoading && pf?.canProceed === false;
            const isRunningThis = phase === "preflight" && activeAction === actionCode;
            return (
              <Button
                key={op.permissionCode}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 gap-1.5 text-xs",
                  isDestruct && "text-destructive hover:text-destructive",
                )}
                disabled={isIneligible || phase === "preflight"}
                onClick={() => handleActionClick(actionCode)}
              >
                {isRunningThis
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : isDestruct
                  ? <Trash2 className="h-3.5 w-3.5" />
                  : <Download className="h-3.5 w-3.5" />}
                {op.label}{countSuffix}
              </Button>
            );
          })}
          <button
            onClick={onClear}
            className="ml-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Pre-flight confirm / result dialog */}
      <Dialog open={phase === "confirm" || phase === "executing" || phase === "done"} onOpenChange={() => { if (phase !== "executing") closeDialog(); }}>
        <DialogContent className="max-w-md">
          {phase === "done" && result ? (
            <>
              <DialogHeader>
                <DialogTitle>Action Complete</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Stat icon={CheckCircle2} label="Succeeded" value={result.summary.success} variant="success" />
                  <Stat icon={XCircle}     label="Failed"     value={result.summary.error}   variant="error"   />
                  <Stat icon={ChevronRight} label="Skipped"   value={result.summary.skipped} variant="neutral" />
                  <Stat icon={ChevronRight} label="Workflow"  value={result.summary.requiresWorkflow} variant="neutral" />
                </div>
                {error && (
                  <p className="text-xs text-destructive">{error}</p>
                )}
                {result.records.length > 0 && (
                  <div className="space-y-1">
                    <button
                      onClick={() => setShowRecords((s) => !s)}
                      className="text-xs text-primary hover:underline underline-offset-2"
                    >
                      {showRecords ? "Hide details" : `Show details (${result.records.length} records)`}
                    </button>
                    {showRecords && (
                      <ul className="max-h-44 overflow-auto rounded-md border bg-muted/30 p-2 space-y-1">
                        {result.records.map((rec) => {
                          const pa = rec.policyAction;
                          const paPill = pa && pa !== "allow" ? (
                            <span className={cn(
                              "rounded px-1.5 py-0.5 text-2xs font-medium",
                              pa === "deny"             ? resolveSemanticColors("error").subtleBadge :
                              pa === "warn"             ? resolveSemanticColors("warning").subtleBadge :
                              pa === "require_workflow" ? resolveSemanticColors("info").subtleBadge :
                              /* escalate */              resolveSemanticColors("accent").subtleBadge,
                            )}>
                              {pa.replace(/_/g, " ")}
                            </span>
                          ) : null;
                          const statusColor =
                            rec.status === "success" ? "text-success" :
                            rec.status === "error"   ? "text-destructive" :
                                                       "text-muted-foreground";
                          return (
                            <li key={rec.id} className="flex items-center gap-2 text-xs">
                              <span className="font-mono text-2xs text-muted-foreground shrink-0">
                                {rec.id.slice(0, 8)}
                              </span>
                              <span className={cn("shrink-0 capitalize", statusColor)}>
                                {rec.status.replace(/_/g, " ")}
                              </span>
                              {paPill}
                              {rec.reason && (
                                <span className="text-muted-foreground truncate">{rec.reason}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={closeDialog}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Confirm: {activeAction}</DialogTitle>
                <DialogDescription>
                  {preflight?.eligible} of {preflight?.total} records will be processed.
                </DialogDescription>
              </DialogHeader>
              {preflight && (
                <div className="space-y-3 py-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Stat icon={CheckCircle2} label="Eligible"         value={preflight.eligible}         variant="success" />
                    <Stat icon={ChevronRight} label="Already done"     value={preflight.skipped}          variant="neutral" />
                    <Stat icon={XCircle}      label="Denied"           value={preflight.denied}           variant="error"   />
                    <Stat icon={ChevronRight} label="Needs workflow"   value={preflight.requiresWorkflow} variant="neutral" />
                  </div>
                  {!preflight.canProceed && (
                    <p className="text-xs text-muted-foreground">
                      No records are eligible — nothing to do.
                    </p>
                  )}
                  {error && (
                    <p className="text-xs text-destructive">{error}</p>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button variant="ghost" onClick={closeDialog} disabled={phase === "executing"}>
                  Cancel
                </Button>
                <Button
                  onClick={runAction}
                  disabled={!preflight?.canProceed || phase === "executing"}
                >
                  {phase === "executing"
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : null}
                  Confirm
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Small stat cell used inside BulkActionDialog
function Stat({
  icon: Icon,
  label,
  value,
  variant,
}: {
  icon:    typeof CheckCircle2;
  label:   string;
  value:   number;
  variant: "success" | "error" | "neutral";
}) {
  const color = variant === "success"
    ? "text-success"
    : variant === "error"
    ? "text-destructive"
    : "text-muted-foreground";
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-semibold tabular-nums">{value}</span>
    </div>
  );
}

// ── Quick status filter bar ───────────────────────────────────────────────────
//
// A compact FilterPillBar row for the status field's enum values.
// Populated from ?facets=cheap data so counts stay live.
// Shows only when the entity has a semantic status field and facet data is available.

function QuickStatusBar({
  statusField,
  facets,
  filters,
  onSetStatus,
}: {
  statusField: string;
  facets:      Record<string, { value: string; count: number }[]>;
  filters:     EntityListFilters;
  onSetStatus: (value: string) => void;
}) {
  const values = facets[statusField];
  if (!values || values.length === 0) return null;

  const activeStatus = getFilterStringValues(filters[statusField])[0] ?? "";

  const items = values.map(({ value, count }) => ({
    value,
    label: value.replace(/_/g, " "),
    count,
  }));

  return (
    <FilterPillBar
      items={items}
      value={activeStatus}
      onChange={onSetStatus}
      allItem={{ label: "All" }}
      compact
    />
  );
}

// ── Row action menu ────────────────────────────────────────────────────────────
//
// A ⋯ dropdown showing record-required operations for a single row.
// Renders DETAIL operations; handler dispatch mirrors ActionBar logic.

function RowActionMenu({
  row,
  entityCode,
  operations,
}: {
  row:         Record<string, unknown>;
  entityCode:  string;
  operations:  EntityOperation[];
}) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const recordId = String(row.id ?? "");

  // Record-required DETAIL operations that make sense in a row context
  const rowOps = resolveActionsForSurface(operations, "DETAIL").filter(
    (a) => a.requiresRecord,
  );

  if (rowOps.length === 0) return null;

  const dispatch = async (action: ReturnType<typeof resolveActionsForSurface>[number]) => {
    setOpen(false);
    if (!recordId) return;

    if (action.handlerType === "NAVIGATE" && action.handlerTarget) {
      router.push(
        action.handlerTarget
          .replace("{entityCode}", entityCode)
          .replace("{id}", recordId),
      );
      return;
    }

    if (action.handlerType === "INLINE") return;

    setLoading(true);
    try {
      const code = action.permissionCode.split(".").pop() ?? action.permissionCode;
      await fetch(`/api/relay/api/records/${entityCode}/${recordId}/action/${code}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({}),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex justify-end">
      <button
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        aria-label="Row actions"
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <MoreHorizontal className="h-4 w-4" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-0.5 w-44 rounded-lg border bg-popover py-1 shadow-md">
            {rowOps.map((action) => (
              <button
                key={action.permissionCode}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
                onClick={() => void dispatch(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Active filter chips ────────────────────────────────────────────────────────
//
// Shows one chip per active filter field with a × to remove it.
// "Clear all" removes all filters at once.

function ActiveFilterChips({
  filters,
  fieldLabels,
  onRemoveField,
  onClearAll,
}: {
  filters:        EntityListFilters;
  fieldLabels:    Record<string, string>;
  onRemoveField:  (field: string) => void;
  onClearAll:     () => void;
}) {
  const entries = Object.entries(filters).filter(([, entry]) => {
    const vals = getFilterStringValues(entry as FilterEntry);
    return Array.isArray(entry) ? vals.length > 0 : true;
  });
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {entries.map(([field, entry]) => (
        <span
          key={field}
          className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-0.5 text-xs font-medium text-foreground"
        >
          <span className="text-muted-foreground">{fieldLabels[field] ?? field}:</span>
          {describeFilterEntry(entry as FilterEntry)}
          <button
            onClick={() => onRemoveField(field)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
            aria-label={`Remove filter for ${field}`}
          >
            <XCircle className="h-3 w-3" />
          </button>
        </span>
      ))}
      {entries.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

// ── Organize compound control ─────────────────────────────────────────────────
//
// Segmented pill merging Sort / Group / Columns into a single container.
// "Organize" prefix labels the zone; each icon segment is a direct drawer entry.
// A 6px primary dot in the top-right corner signals non-default configuration.
// Active drawer = primary-tinted fill on that segment only.

// ── Main page ─────────────────────────────────────────────────────────────────

export function EntityListPage({ entityCode }: EntityListPageProps) {
  const router = useRouter();
  const [rowSelection,  setRowSelection]  = useState<RowSelectionState>({});
  const [activeDrawer,  setActiveDrawer]  = useState<"filter" | "sort" | "group" | "columns" | null>(null);
  const [drawerWidth,   setDrawerWidth]   = useState<number | undefined>(undefined);

  const openDrawer  = useCallback((d: "filter" | "sort" | "group" | "columns") => setActiveDrawer(d), []);
  const closeDrawer = useCallback(() => setActiveDrawer(null), []);

  // URL is the single source of truth for list state
  const {
    state,
    setSearch,
    setSort,
    setFilters,
    setGroup,
    setPage,
    setColumns,
    setViewMode,
    setDensity,
    setSearchMode,
    setFacets,
    setPinnedCols,
    loadSavedView,
    reset,
    isModified,
    hasSaveableViewState,
  } = useEntityListUrl(entityCode);

  const { data: entity,     isLoading: metaLoading, error: metaError } = useCompiledEntity(entityCode);
  const { data: operations }                                            = useEntityOperations(entityCode);
  const { data: savedViews = [] }                                       = useSavedViews(entityCode);

  // A1 — Kanban column order: lifecycle state order takes priority; enum sort_order is fallback.
  // Both hooks are unconditional (Rules of Hooks); enabled guards prevent unnecessary fetches.
  const kanbanGroupField   = entity ? findKanbanGroupField(entity) : undefined;
  const kanbanDomainCode   = kanbanGroupField?.enum_domain_code ?? null;
  const { data: statusRoute } = useStatusRoute(entityCode);
  const { data: kanbanLookup } = useLookupDomain(kanbanDomainCode ?? "", { enabled: !!kanbanDomainCode });
  const kanbanColumnOrder = useMemo(() => {
    if (statusRoute?.all_states?.length) return statusRoute.all_states;
    if (kanbanLookup?.values?.length) {
      return [...kanbanLookup.values]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((v) => v.code);
    }
    return undefined;
  }, [statusRoute, kanbanLookup]);

  // Derive presentation config from metadata (memoized — entity rarely changes)
  const presentationConfig = useMemo(
    () => entity ? resolvePresentationConfig(entity) : undefined,
    [entity],
  );

  const isDesktopViewport = useIsDesktopViewport();

  // Normalised display_config v2 fields (list_renderer, view_modes, status_field_names, …)
  const displayConfig = useMemo(
    () => entity ? resolveDisplayConfig(entity.display_config as Record<string, unknown>) : undefined,
    [entity],
  );

  const availableViewModes = useMemo<ViewMode[] | undefined>(
    () => displayConfig?.view_modes?.map((m) => B5_TO_LEGACY_MODE[m] ?? (m as ViewMode)),
    [displayConfig],
  );

  const responsiveDefaultViewMode = useMemo<ViewMode>(() => {
    const responsiveDefault = isDesktopViewport === false ? "compact" : "list";
    const metadataDefault = displayConfig?.list_renderer
      ? (B5_TO_LEGACY_MODE[displayConfig.list_renderer] ?? "list")
      : "list";
    return firstAllowedViewMode(availableViewModes, [
      responsiveDefault,
      metadataDefault,
      "list",
      "compact",
    ]);
  }, [availableViewModes, displayConfig?.list_renderer, isDesktopViewport]);

  // Active view mode: URL/saved view state wins; otherwise compact below desktop,
  // list at desktop and up. Unknown viewport starts as list to keep hydration stable.
  const viewMode = (state.viewMode ?? responsiveDefaultViewMode) as ViewMode;
  const effectiveDensity = state.density ?? "compact";

  // Resolve active sort: URL state → metadata default → undefined
  const activeSort = (state.sort && state.sort.length > 0) ? state.sort : presentationConfig?.defaultSort;
  const searchMode = state.searchMode ?? "client";

  // Build server request params from canonical URL state.
  // Search in View (default/client): strip q from server request — rows are filtered in-browser instead.
  // facets: honour state.facets (user may upgrade to "all" via Load all button); default "cheap".
  const apiParams = useMemo(() => {
    const effectiveState = searchMode === "client"
      ? { ...state, search: undefined }
      : state;
    const base = stateToApiParams({ ...effectiveState, sort: activeSort });
    base.facets = state.facets ?? "cheap";
    // When grouping in list mode, prepend an implicit group-field sort so rows
    // of the same group are contiguous across pages (visual grouping works correctly).
    if (state.group && viewMode === "list") {
      const alreadyFirst = base.sort?.[0]?.key === state.group;
      if (!alreadyFirst) {
        base.sort = [{ key: state.group, dir: "asc" }, ...(base.sort ?? [])];
      }
    }
    return base;
  }, [state, activeSort, viewMode, searchMode]);

  const {
    data: listData,
    isFetching: dataFetching,
    isLoading: dataLoading,
    refetch: refetchList,
  } = useEntityList(entityCode, apiParams);

  // Controlled sort state for DataTable (server-side sort — shows primary sort in headers)
  const tableSortingState = useMemo<SortingState>(
    () => activeSort?.map((s) => ({ id: s.key, desc: s.dir === "desc" })) ?? [],
    [activeSort],
  );

  const handleSortChange = useCallback(
    (sorting: SortingState) => {
      if (sorting.length > 0) {
        const { id, desc } = sorting[0]!;
        setSort([{ key: id, dir: desc ? "desc" : "asc" }]);
      } else {
        setSort(undefined);
      }
    },
    [setSort],
  );

  // Find the active saved view object (for "Modified from <name>" indicator)
  const baseSavedView = useMemo(
    () => state.baseSavedViewId ? savedViews.find((v) => v.id === state.baseSavedViewId) : undefined,
    [state.baseSavedViewId, savedViews],
  );


  // ── Hooks that must not appear after early returns ───────────────────────────

  // Field label map for filter chips and facet panel headers
  const fieldLabelMap = useMemo(
    () =>
      entity
        ? Object.fromEntries(entity.fields.map((f) => [f.name, f.label ?? f.name]))
        : {},
    [entity],
  );

  // Quick status filter — prefer display_config.status_field_names[0]; fall back to
  // the first column with a semanticResolver (legacy heuristic).
  const statusFieldName =
    displayConfig?.status_field_names?.[0] ??
    presentationConfig?.columns.find((c) => c.semanticResolver)?.fieldName;

  const handleRemoveFilterField = useCallback(
    (field: string) => {
      const updated = { ...(state.filters ?? {}) };
      delete updated[field];
      setFilters(Object.keys(updated).length > 0 ? updated : undefined);
    },
    [state.filters, setFilters],
  );

  const handleSetStatus = useCallback(
    (value: string) => {
      if (!statusFieldName) return;
      const updated = { ...(state.filters ?? {}) };
      if (value) {
        updated[statusFieldName] = [value];
      } else {
        delete updated[statusFieldName];
      }
      setFilters(Object.keys(updated).length > 0 ? updated : undefined);
    },
    [statusFieldName, state.filters, setFilters],
  );

  // ── Hooks that MUST appear before any early return ───────────────────────────
  // (Rules of Hooks: hooks must be called unconditionally on every render)

  const rawRows = (listData?.data ?? []) as Record<string, unknown>[];

  // Search in View mode: filter the current page of rows in-browser.
  // Search in Server mode: server already applied the ?q= filter.
  const allRows = useMemo(() => {
    if (searchMode !== "client" || !state.search?.trim()) return rawRows;
    const q = state.search.toLowerCase();
    const searchableCols = entity?.fields.filter((f) => f.is_searchable).map((f) => f.name) ?? [];
    if (searchableCols.length === 0) return rawRows;
    return rawRows.filter((row) =>
      searchableCols.some((col) => String(row[col] ?? "").toLowerCase().includes(q)),
    );
  }, [rawRows, searchMode, state.search, entity?.fields]);

  // ── Social signals — batch-fetched for all visible rows (S1.A/S1.B) ─────────
  // Called unconditionally before any early return (Rules of Hooks).
  // IDs are derived from rawRows so they're stable per-page-load.
  const visibleRowIds = useMemo(
    () => rawRows.map((r) => String(r.id ?? "")).filter(Boolean),
    [rawRows],
  );

  const { bookmarkedIds, toggle: toggleBookmark, isPending: bookmarkPending } =
    useRecordBookmarks(entityCode, visibleRowIds);

  const { counts: commentCountMap } = useCommentCounts(entityCode, visibleRowIds);


  // Compact view columns — filtered to compactVisible !== false.
  const compactColumns = useMemo(
    () => presentationConfig?.columns.filter((c) => c.compactVisible !== false) ?? [],
    [presentationConfig],
  );

  // Aggregation footer values — sum all aggregatable columns over the current page of rows.
  const aggregations = useMemo<Record<string, number | null> | undefined>(() => {
    if (!presentationConfig || allRows.length === 0) return undefined;
    const agg: Record<string, number | null> = {};
    let any = false;
    for (const colPres of presentationConfig.columns) {
      if (colPres.aggregation !== "sum") continue;
      const field = entity?.fields.find((f) => f.name === colPres.fieldName);
      if (!field?.is_aggregatable) continue;
      const sum = allRows.reduce((acc, row) => {
        const v = row[colPres.fieldName];
        return acc + (typeof v === "number" ? v : 0);
      }, 0);
      agg[colPres.fieldName] = sum;
      any = true;
    }
    return any ? agg : undefined;
  }, [presentationConfig, allRows, entity]);

  // Pinned columns — columns where pinnedByDefault = true in presentation config.
  const pinnedColumns = useMemo<string[]>(
    () => presentationConfig?.columns.filter((c) => c.pinnedByDefault).map((c) => c.fieldName) ?? [],
    [presentationConfig],
  );

  // ── Right-click context menu state (must be before any early return) ────────

  const [rowCtxMenu, setRowCtxMenu] = useState<{ row: Record<string, unknown>; x: number; y: number } | null>(null);
  const [ctxCopied, setCtxCopied] = useState<string | null>(null);

  const handleRowContextMenu = useCallback((row: Record<string, unknown>, e: { clientX: number; clientY: number; preventDefault(): void }) => {
    e.preventDefault();
    setCtxCopied(null);
    setRowCtxMenu({ row, x: e.clientX, y: e.clientY });
  }, []);

  const handleCtxCopy = useCallback((fieldKey: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCtxCopied(fieldKey);
      setTimeout(() => {
        setCtxCopied(null);
        setRowCtxMenu(null);
      }, 1200);
    });
  }, []);

  // Build per-field copy items — self-contained so it can live before the early returns.
  // Uses entity + state.columns directly rather than the post-guard allDescriptorColumns.
  const ctxCopyItems = useMemo(() => {
    if (!rowCtxMenu || !entity) return [];
    const fmt = (raw: unknown): string => {
      if (raw == null) return "";
      if (typeof raw === "boolean") return raw ? "Yes" : "No";
      if (typeof raw === "number") return raw.toLocaleString();
      const s = String(raw);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d.toLocaleDateString();
      }
      return s;
    };
    const listCfg    = resolveListConfig(entity);
    const allCols    = listCfg.columns;
    const visCols    = state.columns ?? [];
    const visFields  = allCols.filter((f) => visCols.length === 0 || visCols.includes(f.name));
    return visFields.flatMap((field) => {
      const pres  = presentationConfig?.columns.find((c) => c.fieldName === field.name);
      const label = pres?.label ?? field.label ?? field.name;
      const raw   = rowCtxMenu.row[field.name];
      if (raw == null || raw === "") return [];
      return [{ key: field.name, label, value: fmt(raw) }];
    });
  }, [rowCtxMenu, entity, state.columns, presentationConfig]);

  // ── Error / loading ──────────────────────────────────────────────────────────

  if (metaError) {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <span className="text-xl font-semibold text-foreground">Entity Not Found</span>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">
              Entity <code className="font-mono">{entityCode}</code> not found in compiled metadata.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (metaLoading || !entity) {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <Skeleton className="h-7 w-40" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const listConfig   = resolveListConfig(entity);
  const titleKey     = listConfig.columns[0]?.name ?? "name";
  const codeFieldName = entity.display_config.code_field
    ?? entity.display_config.document_header?.number_field
    ?? "code";
  const compactTitleFieldName = entity.display_config.title_field
    ?? titleKey
    ?? "name";
  const statusFieldNames = displayConfig?.status_field_names ?? ["status"];
  const hasGroupable = !!findKanbanGroupField(entity);
  const navFieldNames = uniqueFieldNames([
    entity.display_config.code_field,
    entity.display_config.document_header?.number_field,
    entity.display_config.title_field,
    titleKey,
    "document_no",
    "document_number",
    "number",
    "code",
    "name",
  ]);

  // Status field resolver from presentation config (for compact view badges)
  const statusResolverName = presentationConfig?.columns.find(
    (c) => c.semanticResolver && isStatusFieldName(c.fieldName, statusFieldNames),
  )?.semanticResolver;

  const selectedCount = Object.keys(rowSelection).length;

  // Selected record IDs — derived from DataTable row-index selection keys.
  // TanStack Table uses row index as key by default; map back to record IDs.
  const selectedIds = Object.keys(rowSelection)
    .map((idx) => String(allRows[Number(idx)]?.id ?? ""))
    .filter(Boolean);

  // Server pagination from API response (server emits snake_case keys)
  const pagination     = listData?.pagination as { total?: number; page?: number; total_pages?: number } | undefined;
  const serverTotal    = pagination?.total;
  const serverPage     = pagination?.page;
  const serverTotalPgs = pagination?.total_pages;

  // Facets from API response — populated when filterPanelOpen = true and facets=cheap
  const facetData = (listData?.facets ?? {}) as Record<string, { value: string; count: number }[]>;

  // Server-provided group counts (total per group value across all pages)
  const groupCounts = (listData as { group_counts?: Record<string, number> } | undefined)?.group_counts;

  // Column visibility: if URL ?cols= is set, only show those fields
  const visibleColumnNames = state.columns ?? [];
  const allDescriptorColumns = listConfig.columns;

  // Filtered EntityField[] for GroupedListView (same visibility logic as DataTable columns)
  const visibleDescriptorFields = allDescriptorColumns.filter(
    (f) => visibleColumnNames.length === 0 || visibleColumnNames.includes(f.name),
  );

  const activeFilters = state.filters ?? {};
  const hasActiveFilters = Object.values(activeFilters).some((v) =>
    Array.isArray(v) ? v.length > 0 : true,
  );

  // Build TanStack Table columns.
  // When visibleColumnNames is empty: render all listConfig columns in default order.
  // When set: honour the exact order and support extra entity fields beyond the list-config set.
  const buildDescriptorCol = (field: typeof allDescriptorColumns[0]) => {
    const colPres  = presentationConfig?.columns.find((c) => c.fieldName === field.name);
    const isFiltered = field.is_filterable && !!activeFilters[field.name];
    return {
      accessorKey:   field.name,
      enableSorting: field.is_sortable,
      meta:          { filtered: isFiltered },
      header: field.is_filterable
        ? () => (
            <ColumnFilterHeader
              label={field.label ?? field.name}
              field={field}
              entry={activeFilters[field.name] as FilterEntry | undefined}
              facetValues={facetData[field.name] ?? []}
              onApply={(next) => {
                const updated = { ...activeFilters };
                if (next === undefined) { delete updated[field.name]; }
                else { updated[field.name] = next; }
                setFilters(Object.keys(updated).length > 0 ? updated : undefined);
              }}
            />
          )
        : (field.label ?? field.name),
      cell: ({ getValue }: { getValue: () => unknown }) => {
        const value = getValue();
        if (colPres?.semanticResolver && typeof value === "string" && value) {
          return <RuntimeStatusText value={value} resolverName={colPres.semanticResolver} />;
        }
        const Renderer = resolveFieldRenderer(field);
        return <Renderer value={value} field={field} mode="view" density="table" />;
      },
    };
  };

  const columns: ColumnDef<Record<string, unknown>>[] = visibleColumnNames.length === 0
    ? allDescriptorColumns.map(buildDescriptorCol)
    : visibleColumnNames.flatMap((name) => {
        const listCol = allDescriptorColumns.find((f) => f.name === name);
        if (listCol) return [buildDescriptorCol(listCol)];
        // Extra field added from the full entity.fields pool via ColumnDrawer
        const ef = entity.fields.find((f) => f.name === name && !f.is_computed);
        if (!ef) return [];
        const Renderer = resolveFieldRenderer(ef);
        return [{
          accessorKey:   ef.name,
          header:        ef.label ?? ef.name,
          enableSorting: ef.is_sortable,
          meta:          { filtered: false },
          cell: ({ getValue }: { getValue: () => unknown }) => (
            <Renderer value={getValue()} field={ef} mode="view" density="table" />
          ),
        }];
      });

  const getRecordHref = (row: Record<string, unknown>) => {
    const navId = resolveRecordNavId(row, navFieldNames);
    return navId ? `/app/${entityCode}/${encodeURIComponent(navId)}` : undefined;
  };

  const handleRowClick = (row: Record<string, unknown>) => {
    const href = getRecordHref(row);
    if (href) router.push(href);
  };

  // Determine which saved view menu item is an exact match.
  const activeSavedViewId = state.savedViewId ?? (!hasSaveableViewState && !isModified ? "__all" : undefined);

  const handleSavedViewClick = (viewId: string) => {
    if (viewId === "__all") {
      reset();
      return;
    }
    const view = savedViews.find((v) => v.id === viewId);
    if (view) {
      loadSavedView(viewId, view.config as EntityListQueryState);
      setRowSelection({});
    }
  };

  const listEntityTypeLabel = entityTypeLabel(entity);

  return (
    <PageShell
      header={
        <PageHeader
          typeChip={listEntityTypeLabel}
          onBack={() => router.back()}
          actionsLayout="adaptive"
          primaryActions={
            <>
              {operations ? (
                <ActionBar
                  operations={operations.filter((op) => !op.permission_code.toLowerCase().includes("export"))}
                  surface="LIST"
                  entityCode={entityCode}
                  showSecondaryActions={false}
                />
              ) : null}
              <ListSettingsMenu
                entityCode={entityCode}
                onReload={refetchList}
                reloading={dataFetching}
                operations={operations}
              />
            </>
          }
          actions={
            <div className="flex w-full min-w-0 items-center gap-1 sm:gap-2">
              <SearchInput
                placeholder="Search..."
                value={state.search ?? ""}
                onSearch={setSearch}
                loading={dataLoading && !!state.search && searchMode === "server"}
                className="min-w-[7rem] flex-1 xl:w-64 xl:flex-none"
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Escape") setSearch("");
                }}
                modeToggle={entity.fields.some((f) => f.is_searchable) ? {
                  active:         searchMode === "client",
                  onToggle:       () => setSearchMode(searchMode === "client" ? "server" : undefined),
                  activeLabel:    "In view",
                  inactiveLabel:  "Server",
                  icon:           searchMode === "client" ? <Zap className="size-3" /> : <Server className="size-3" />,
                  title:          searchMode === "client"
                    ? "Search in View: filters the rows currently loaded in this view. Click to switch to Search in Server."
                    : "Search in Server: queries all matching records from the server. Click to switch to Search in View.",
                  labelMode:      "always",
                  activeClassName: "bg-muted text-foreground hover:bg-muted/80",
                  inactiveClassName: "bg-primary text-primary-foreground hover:bg-primary/90",
                } : undefined}
              />

              <OrganizerPalette
                activeDrawer={activeDrawer}
                onOpen={openDrawer}
                hasActiveFilters={hasActiveFilters}
                filterCount={Object.keys(activeFilters).length}
                sortCount={activeSort?.length ?? 0}
                groupField={state.group ?? undefined}
                visibleColumns={visibleColumnNames.length}
                totalColumns={allDescriptorColumns.length}
                showColumns={viewMode === "list" || viewMode === "excel"}
                mode={viewMode}
                density={effectiveDensity}
                hasGroupable={hasGroupable}
                onChangeMode={setViewMode}
                onChangeDensity={(d) => setDensity(d)}
                availableModes={availableViewModes}
                savedViews={savedViews}
                activeSavedViewId={activeSavedViewId}
                modifiedFromName={isModified ? baseSavedView?.name : undefined}
                onSelectSavedView={handleSavedViewClick}
                hasSaveableChanges={(hasSaveableViewState && !state.savedViewId) || isModified}
                entityCode={entityCode}
                state={state}
                isModified={isModified}
                baseSavedViewId={state.baseSavedViewId}
                baseName={baseSavedView?.name}
              />
            </div>
          }
        />
      }
    >
      {/* Drawers — one open at a time; all rendered for CSS transitions */}
      <FilterDrawer
        open={activeDrawer === "filter"}
        onClose={closeDrawer}
        entity={entity}
        facets={facetData}
        appliedFilters={activeFilters}
        onApply={(filters) => {
          setFilters(filters && Object.keys(filters).length > 0 ? filters : undefined);
          closeDrawer();
        }}
        facetStatus={(listData as { facet_status?: string } | undefined)?.facet_status as "complete" | "truncated" | "timeout" | undefined}
        facetScope={state.facets === "all" ? "all" : "cheap"}
        onRequestAllFacets={() => setFacets("all")}
        width={drawerWidth}
        onWidthChange={setDrawerWidth}
      />
      <SortDrawer
        open={activeDrawer === "sort"}
        onClose={closeDrawer}
        entity={entity}
        appliedSort={state.sort}
        defaultSort={presentationConfig?.defaultSort}
        onApply={(sort) => {
          setSort(sort && sort.length > 0 ? sort : undefined);
          closeDrawer();
        }}
        width={drawerWidth}
        onWidthChange={setDrawerWidth}
      />
      <GroupDrawer
        open={activeDrawer === "group"}
        onClose={closeDrawer}
        entity={entity}
        appliedGroup={state.group}
        onApply={(group) => {
          setGroup(group);
          closeDrawer();
        }}
        width={drawerWidth}
        onWidthChange={setDrawerWidth}
      />
      <ColumnDrawer
        open={activeDrawer === "columns"}
        onClose={closeDrawer}
        entity={entity}
        appliedColumns={visibleColumnNames}
        defaultColumns={presentationConfig?.columns.map((c) => c.fieldName) ?? allDescriptorColumns.map((c) => c.name)}
        availableFields={entity.fields
          .filter((f) => !f.is_computed)
          .map((f) => ({ name: f.name, label: f.label }))}
        viewLabel={viewMode === "excel" ? "Spreadsheet" : "List"}
        onApply={(cols) => {
          setColumns(cols);
          closeDrawer();
        }}
        width={drawerWidth}
        onWidthChange={setDrawerWidth}
      />

      {/* Content area */}
      <div className="space-y-3">
          {/* Quick status filter pills — shown when facets are loaded */}
          {statusFieldName && Object.keys(facetData).length > 0 && (
            <QuickStatusBar
              statusField={statusFieldName}
              facets={facetData}
              filters={activeFilters}
              onSetStatus={handleSetStatus}
            />
          )}

          {/* State bar — single row: count · filter chips · sort · group · columns */}
          {(serverTotal !== undefined || activeSort || state.group || visibleColumnNames.length > 0 || hasActiveFilters) && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">

              {/* Record count */}
              {serverTotal !== undefined && (
                <span className="shrink-0">
                  Showing <strong className="font-semibold text-foreground">{allRows.length}</strong>
                  {" of "}
                  <strong className="font-semibold text-foreground">{serverTotal.toLocaleString()}</strong>
                  {" "}{entity.entity_name.toLowerCase()}
                </span>
              )}

              {/* Virtual filter labels */}
              {Object.entries(activeFilters)
                .filter(([k]) => isVirtualFilter(k))
                .map(([k, v]) => {
                  const value = Array.isArray(v)
                    ? String(v[0] ?? "")
                    : (v && typeof v === "object" && "value" in v)
                      ? String((v as { value: unknown }).value)
                      : "";
                  return (
                    <span key={k} className="inline-flex items-center gap-0.5">
                      <span className="text-muted-foreground/30">·</span>
                      <span className="font-medium text-foreground/70">{describeVirtualFilter(k, value)}</span>
                    </span>
                  );
                })}

              {/* Active filter chips — inline after count */}
              {Object.entries(activeFilters)
                .filter(([k]) => !isVirtualFilter(k))
                .filter(([, entry]) => Array.isArray(entry) ? (entry as unknown[]).length > 0 : true)
                .map(([field, entry]) => (
                  <span key={field} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground">
                    <span className="text-muted-foreground">{fieldLabelMap[field] ?? field}:</span>
                    <span className="font-medium">{describeFilterEntry(entry as FilterEntry)}</span>
                    <button
                      onClick={() => handleRemoveFilterField(field)}
                      className="ml-0.5 rounded-full p-px text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={`Remove filter for ${field}`}
                    >
                      <XCircle className="h-3 w-3" />
                    </button>
                  </span>
                ))}

              {/* Clear all filters */}
              {hasActiveFilters && Object.keys(activeFilters).filter(k => !isVirtualFilter(k)).length > 1 && (
                <button
                  onClick={() => setFilters(undefined)}
                  className="text-muted-foreground/70 underline-offset-2 hover:underline hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              )}

              {/* Sort */}
              {activeSort && activeSort.length > 0 && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <button
                    onClick={() => openDrawer("sort")}
                    className="inline-flex items-center gap-0.5 rounded-full border border-transparent px-2 py-0.5 text-muted-foreground hover:border-input hover:bg-muted/50 hover:text-foreground transition-colors"
                    title="Edit sort"
                  >
                    <ArrowUpDown className="h-3 w-3 mr-0.5" />
                    {activeSort.map((s, i) => (
                      <span key={s.key}>
                        {i > 0 && <span className="mx-0.5 opacity-50">,</span>}
                        {s.key === "__most_used" ? "Most used" : (fieldLabelMap[s.key] ?? s.key)}
                        {" "}{s.dir === "desc" ? "↓" : "↑"}
                      </span>
                    ))}
                  </button>
                </>
              )}

              {/* Group */}
              {state.group && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <button
                    onClick={() => openDrawer("group")}
                    className="inline-flex items-center gap-0.5 rounded-full border border-transparent px-2 py-0.5 text-muted-foreground hover:border-input hover:bg-muted/50 hover:text-foreground transition-colors"
                    title="Edit grouping"
                  >
                    <Layers className="h-3 w-3 mr-0.5" />
                    {fieldLabelMap[state.group] ?? state.group}
                  </button>
                </>
              )}

              {/* Columns */}
              {visibleColumnNames.length > 0 && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <button
                    onClick={() => openDrawer("columns")}
                    className="inline-flex items-center gap-0.5 rounded-full border border-transparent px-2 py-0.5 text-muted-foreground hover:border-input hover:bg-muted/50 hover:text-foreground transition-colors"
                    title="Edit columns"
                  >
                    <Columns3 className="h-3 w-3 mr-0.5" />
                    {visibleColumnNames.length}/{allDescriptorColumns.length} columns
                  </button>
                </>
              )}
            </div>
          )}

          {/* Modified indicator */}
          {isModified && (
            <ModifiedIndicator
              baseName={baseSavedView?.name}
              onDiscard={() => {
                if (state.baseSavedViewId) {
                  const baseView = savedViews.find((v) => v.id === state.baseSavedViewId);
                  if (baseView) {
                    loadSavedView(state.baseSavedViewId, baseView.config as EntityListQueryState);
                  } else {
                    reset();
                  }
                } else {
                  reset();
                }
                setRowSelection({});
              }}
            />
          )}

          {/* Bulk action bar + dialog (list mode only) */}
          {selectedCount > 0 && viewMode === "list" && (
            <BulkActionDialog
              entityCode={entityCode}
              selectedIds={selectedIds}
              operations={operations ?? []}
              onClear={() => setRowSelection({})}
            />
          )}

          {/* Search-unsupported banner — shown when the server returned empty because
              no fields on this entity are marked is_searchable */}
          {!!state.search && !dataLoading && allRows.length === 0 &&
            !!(listData as { reasons?: Record<string, unknown> } | undefined)?.reasons?.search_unsupported && (
            <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning" />
              Search is not configured for this entity — no fields are marked as searchable.
              Use the <strong>Filter</strong> button to narrow results by specific fields.
            </div>
          )}

          {/* ── Views ── */}
          {viewMode === "list" && !state.group && (
            <DataTable
              columns={columns}
              data={allRows}
              loading={dataLoading}
              tableContainerClassName="overflow-auto min-h-[50dvh] max-h-[calc(100dvh-10rem)]"
              selectable
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              pageSize={state.pageSize ?? presentationConfig?.defaultPageSize ?? 25}
              onRowClick={handleRowClick}
              onRowContextMenu={(row, e) => handleRowContextMenu(row as Record<string, unknown>, e)}
              sortingState={tableSortingState}
              onSortingChange={handleSortChange}
              density={effectiveDensity}
              aggregations={aggregations}
              pinnedColumns={pinnedColumns.length > 0 ? pinnedColumns : undefined}
              totalCount={serverTotal}
              currentPage={serverPage}
              totalPages={serverTotalPgs}
              onPageChange={setPage}
              rowActions={(row) => {
                const r      = row as Record<string, unknown>;
                const rid    = String(r.id ?? "");
                const navId  = resolveRecordNavId(r, navFieldNames);
                return (
                  <RowMetaStrip
                    row={r}
                    entityCode={entityCode}
                    visibleColumnNames={visibleColumnNames}
                    bookmarked={bookmarkedIds.has(rid)}
                    commentCount={commentCountMap[rid]?.total ?? 0}
                    commentHasOpen={commentCountMap[rid]?.hasOpen ?? false}
                    onBookmarkToggle={toggleBookmark}
                    bookmarkPending={bookmarkPending}
                    recordNavId={navId && navId !== rid ? navId : undefined}
                  />
                );
              }}
            />
          )}

          {viewMode === "list" && state.group && (
            <GroupedListView
              rows={allRows}
              groupFieldName={state.group}
              entity={entity}
              visibleDescriptorFields={visibleDescriptorFields}
              presentationConfig={presentationConfig}
              groupCounts={groupCounts}
              columnOrder={kanbanColumnOrder}
              loading={dataLoading}
              density={effectiveDensity}
              onRowClick={handleRowClick}
              onRowContextMenu={(row, e) => handleRowContextMenu(row, e)}
              rowActions={operations && operations.length > 0
                ? (row) => (
                    <RowActionMenu
                      row={row}
                      entityCode={entityCode}
                      operations={operations}
                    />
                  )
                : undefined}
            />
          )}

          {viewMode === "board" && (
            <KanbanView
              rows={allRows}
              entity={entity}
              titleKey={titleKey}
              entityCode={entityCode}
              onRowClick={handleRowClick}
              groupFieldOverride={state.group ?? undefined}
              columnOrder={kanbanColumnOrder}
              groupCounts={groupCounts}
            />
          )}

          {viewMode === "compact" && (
            <CompactView
              rows={allRows}
              entity={entity}
              codeFieldName={codeFieldName}
              titleFieldName={compactTitleFieldName}
              statusFieldNames={statusFieldNames}
              onRowClick={handleRowClick}
              onRowContextMenu={handleRowContextMenu}
              statusResolverName={statusResolverName}
              compactColumns={compactColumns}
              density={effectiveDensity}
            />
          )}

          {viewMode === "dashboard" && (
            <DashboardView
              rows={allRows}
              entity={entity}
            />
          )}

          {viewMode === "excel" && (
            <ExcelView
              rows={allRows}
              entity={entity}
              visibleColumns={
                visibleColumnNames.length > 0
                  ? visibleColumnNames
                  : (presentationConfig?.columns.map((c) => c.fieldName) ?? allDescriptorColumns.map((c) => c.name))
              }
              presentationConfig={presentationConfig ?? undefined}
              onRowClick={handleRowClick}
              onRowContextMenu={handleRowContextMenu}
              aggregations={aggregations}
              loading={dataLoading}
              pinnedCols={state.pinnedCols ?? []}
              onPinnedColsChange={setPinnedCols}
            />
          )}
      </div>

      {/* Right-click context menu */}
      {rowCtxMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setRowCtxMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setRowCtxMenu(null); }}
          />
          <div
            className="fixed z-50 min-w-[260px] max-w-[320px] rounded-lg border bg-popover py-1 shadow-md"
            style={{ top: rowCtxMenu.y, left: rowCtxMenu.x }}
          >
            {/* Navigation */}
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
              onClick={() => {
                const href = getRecordHref(rowCtxMenu.row);
                if (href) window.open(href, "_blank", "noopener,noreferrer");
                setRowCtxMenu(null);
              }}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              Open in new tab
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
              onClick={() => {
                const href = getRecordHref(rowCtxMenu.row);
                if (href) window.open(href, "_blank", "noopener,noreferrer,width=1280,height=800");
                setRowCtxMenu(null);
              }}
            >
              <AppWindow className="h-3.5 w-3.5 shrink-0" />
              Open in new window
            </button>

            {/* Per-field copy section */}
            {ctxCopyItems.length > 0 && (
              <>
                <div className="my-1 h-px bg-border" />
                <div className="px-3 pb-0.5 pt-1 text-doc-support font-semibold uppercase tracking-wider text-muted-foreground/50">
                  Copy field
                </div>
                <div className="max-h-[220px] overflow-y-auto">
                  {ctxCopyItems.map((item) => (
                    <button
                      key={item.key}
                      className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-muted transition-colors"
                      onClick={() => handleCtxCopy(item.key, item.value)}
                    >
                      <span className="w-[90px] shrink-0 truncate text-xs text-muted-foreground">{item.label}</span>
                      {ctxCopied === item.key ? (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <Check className="h-3 w-3" />Copied!
                        </span>
                      ) : (
                        <span className="flex-1 truncate text-xs font-medium">{item.value}</span>
                      )}
                      {ctxCopied !== item.key && (
                        <Copy className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}
