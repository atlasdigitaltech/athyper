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
  Shield,
  ScrollText,
} from "lucide-react";
import { useCompiledEntity, useEntityList, useEntityOperations, useSavedViews, useSaveView, useUpdateView, useStatusRoute, useLookupDomain, useRecordBookmarks, useCommentCounts } from "@athyper/query";
import { resolveActionsForSurface, type ResolvedAction } from "@athyper/metadata-client/operation-reader";
import type { EntityOperation } from "@athyper/api-contracts/metadata";
import { FilterPillBar, SearchInput } from "@athyper/ui/composites";
import { resolveListConfig, resolvePresentationConfig } from "@athyper/metadata-client/compiled-reader";
import { resolvePresentationConfig as resolveDisplayConfig } from "../metadata";
import { DataTable, type ColumnDef, type RowSelectionState, type SortingState } from "@athyper/ui/data";
import { PageShell } from "../shell/PageShell";
import { PageHeader } from "../shell/PageHeader";
import {
  Button, Badge, Skeleton, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors, type SemanticIntent } from "@athyper/theme/semantic-colors";
import {
  kanbanStatusIntent,
  apArStatusIntent,
  closeRunStatusIntent,
  closeTaskStatusIntent,
  adminStatusIntent,
} from "@athyper/theme/domain-intents";
import { stateToApiParams, getFilterStringValues, describeFilterEntry } from "@athyper/api-contracts/entity-list";
import type {
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
import { MyWorkDropdown } from "./MyWorkDropdown";
import { describeVirtualFilter, isVirtualFilter } from "./virtualFilterLabels";

export interface EntityListPageProps {
  entityCode: string;
}

type ViewMode = "list" | "board" | "compact" | "dashboard" | "excel";

// Maps display_config v2 canonical view-mode names → legacy EntityListPage ViewMode names.
const B5_TO_LEGACY_MODE: Record<string, ViewMode> = {
  table:       "list",
  kanban:      "board",
  dashboard:   "dashboard",
  spreadsheet: "excel",
};

// ── Status badge (semantic — driven by ColumnPresentation.semanticResolver) ───

// Registry of named intent resolvers — matches ColumnPresentation.semanticResolver values.
// Adding a new resolver: add it here and in @athyper/theme/domain-intents.
const SEMANTIC_RESOLVERS: Record<string, (value: string) => SemanticIntent> = {
  kanbanStatusIntent,
  apArStatusIntent,
  closeRunStatusIntent,
  closeTaskStatusIntent,
  adminStatusIntent,
};

function StatusBadge({ value, resolverName }: { value: string; resolverName?: string }) {
  if (!value) return null;
  const resolverFn = resolverName ? SEMANTIC_RESOLVERS[resolverName] : undefined;
  const intent = resolverFn ? resolverFn(value) : kanbanStatusIntent(value);
  const colors = resolveSemanticColors(intent);
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-2xs capitalize", colors.subtleBadge)}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

function getStatusValue(row: Record<string, unknown>): string {
  return String(row.status ?? row.record_status ?? row.state ?? "");
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
    card:       "flex flex-col gap-1.5 rounded-xl border bg-card p-3 shadow-xs transition-all hover:border-primary/30 hover:shadow-sm",
    title:      "text-xs font-medium leading-snug",
    metaGap:    "flex items-center gap-1.5",
    fieldsPt:   "grid grid-cols-2 gap-x-2 gap-y-0.5 border-t pt-1.5",
    fieldText:  "text-2xs",
  },
  comfortable: {
    grid:       "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    card:       "flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs transition-all hover:border-primary/30 hover:shadow-sm",
    title:      "text-sm font-medium leading-snug",
    metaGap:    "flex items-center gap-2",
    fieldsPt:   "grid grid-cols-2 gap-x-2 gap-y-0.5 border-t pt-2",
    fieldText:  "text-2xs",
  },
  spacious: {
    grid:       "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    card:       "flex flex-col gap-2.5 rounded-xl border bg-card p-5 shadow-xs transition-all hover:border-primary/30 hover:shadow-sm",
    title:      "text-sm font-medium leading-snug",
    metaGap:    "flex items-center gap-2",
    fieldsPt:   "grid grid-cols-2 gap-x-2 gap-y-1 border-t pt-2.5",
    fieldText:  "text-xs",
  },
} as const;

function CompactView({
  rows,
  titleKey,
  entityCode,
  onRowClick,
  onRowContextMenu,
  statusResolverName,
  compactColumns,
  density = "comfortable",
}: {
  rows:               Record<string, unknown>[];
  titleKey:           string;
  entityCode:         string;
  onRowClick?:        (row: Record<string, unknown>) => void;
  onRowContextMenu?:  (row: Record<string, unknown>, e: { clientX: number; clientY: number; preventDefault(): void }) => void;
  statusResolverName?: string;
  /** Presentation-config columns filtered to compactVisible !== false. Max 4 shown. */
  compactColumns:     import("@athyper/api-contracts/entity-list").ColumnPresentation[];
  density?:           "compact" | "comfortable" | "spacious";
}) {
  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">No records</div>
    );
  }

  const d = COMPACT_DENSITY[density] ?? COMPACT_DENSITY.comfortable;

  const STATUS_KEYS = new Set(["status", "record_status", "state", "lifecycle_state"]);
  const extraFields = compactColumns
    .filter((c) => c.fieldName !== titleKey && !STATUS_KEYS.has(c.fieldName))
    .slice(0, 4);

  return (
    <div className={d.grid}>
      {rows.map((row) => {
        const id     = String(row.id ?? "");
        const title  = String(row[titleKey] ?? row.name ?? row.code ?? id);
        const status = getStatusValue(row);
        return (
          <div
            key={id}
            onClick={() => onRowClick?.(row)}
            onContextMenu={(e) => onRowContextMenu?.(row, e)}
            className={cn(d.card, onRowClick && "cursor-pointer")}
          >
            {/* Title row */}
            <div className="flex items-start justify-between gap-2">
              <p className={d.title}>{title}</p>
              <Badge variant="outline" className="shrink-0 text-2xs px-1.5 py-0.5 font-mono">
                {entityCode}
              </Badge>
            </div>

            {/* Status + id */}
            <div className={d.metaGap}>
              {status && (
                <StatusBadge value={status} resolverName={statusResolverName} />
              )}
              {id && (
                <span className="font-mono text-2xs text-muted-foreground/50">
                  {id.slice(0, 8)}
                </span>
              )}
            </div>

            {/* Extra fields from compactVisible config */}
            {extraFields.length > 0 && (
              <dl className={d.fieldsPt}>
                {extraFields.map((col) => {
                  const val = row[col.fieldName];
                  if (val === undefined || val === null || val === "") return null;
                  return (
                    <div key={col.fieldName} className="contents">
                      <dt className={cn(d.fieldText, "text-muted-foreground truncate")}>
                        {col.label ?? col.fieldName}
                      </dt>
                      <dd className={cn(d.fieldText, "font-medium truncate")}>
                        {String(val)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
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

interface OrganizeControlProps {
  activeDrawer:     string | null;
  onOpen:           (d: "filter" | "sort" | "group" | "columns") => void;
  hasActiveFilters: boolean;
  filterCount:      number;
  sortCount:        number;
  groupField?:      string;
  visibleColumns:   number;
  totalColumns:     number;
  showColumns:      boolean;
}

function OrganizeControl({
  activeDrawer, onOpen,
  hasActiveFilters, filterCount,
  sortCount, groupField, visibleColumns, totalColumns, showColumns,
}: OrganizeControlProps) {
  const anyOrganize = hasActiveFilters || sortCount > 0 || !!groupField || visibleColumns > 0;

  const seg = "relative flex items-center justify-center gap-1 px-1.5 py-1.5 sm:px-2 text-xs transition-colors";
  const segCls = (name: "filter" | "sort" | "group" | "columns", dataActive: boolean) =>
    cn(seg,
      activeDrawer === name
        ? "text-primary bg-primary/15"
        : dataActive
        ? "text-primary bg-primary/8"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <div className="flex h-8 items-center rounded-md border border-input bg-background shadow-sm overflow-hidden [&>*+*]:border-l [&>*+*]:border-input">
      <span className="hidden sm:inline select-none px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
        Organize
      </span>

      <button
        onClick={() => onOpen("filter")}
        className={segCls("filter", hasActiveFilters)}
        title={hasActiveFilters ? `${filterCount} active filter${filterCount !== 1 ? "s" : ""}` : "Filter"}
      >
        <FilterIcon className="h-3.5 w-3.5 shrink-0" />
        {hasActiveFilters && (
          <span className="rounded-full bg-primary px-1 py-px text-2xs font-bold text-primary-foreground leading-none">
            {filterCount}
          </span>
        )}
      </button>

      <button
        onClick={() => onOpen("sort")}
        className={segCls("sort", sortCount > 0)}
        title={sortCount > 0 ? `${sortCount} sort${sortCount !== 1 ? "s" : ""} active` : "Sort"}
      >
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
        {sortCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
      </button>

      <button
        onClick={() => onOpen("group")}
        className={segCls("group", !!groupField)}
        title={groupField ? `Grouped by ${groupField.replace(/_/g, " ")}` : "Group"}
      >
        <Layers className="h-3.5 w-3.5 shrink-0" />
      </button>

      {showColumns && (
        <button
          onClick={() => onOpen("columns")}
          className={segCls("columns", visibleColumns > 0)}
          title={visibleColumns > 0 ? `${visibleColumns} of ${totalColumns} columns` : "Columns"}
        >
          <Columns3 className="h-3.5 w-3.5 shrink-0" />
        </button>
      )}
    </div>
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
}

function ViewLauncherButton({
  mode, density, hasGroupable, onChangeMode, onChangeDensity, availableModes,
}: ViewLauncherButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md border border-input bg-background shadow-sm px-2.5 text-xs font-medium transition-colors",
          open ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
      >
        <CurrentIcon className="h-3.5 w-3.5 shrink-0" />
        <span>View: {currentLabel}</span>
        <ChevronRight className="h-3 w-3 shrink-0 rotate-90 opacity-50" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-lg border bg-popover shadow-lg overflow-hidden">
          <div className="absolute -top-[5px] right-3 h-2.5 w-2.5 rotate-45 rounded-sm border-l border-t bg-popover" />

          <p className={hdg}>View</p>
          {(availableModes
            ? modeOptions.filter((o) => availableModes.includes(o.value))
            : modeOptions.filter((o) => !o.gated)
          ).map(({ value, Icon, label }) => (
            <button key={value} onClick={() => { onChangeMode(value); setOpen(false); }} className={rowAct(mode === value)}>
              <Icon className={cn("h-3.5 w-3.5 shrink-0", mode !== value && "text-muted-foreground")} />
              <span className="flex-1">{label}</span>
              {mode === value && <Check className="h-3 w-3 text-primary" />}
            </button>
          ))}

          <div className="my-1 h-px bg-border/60" />

          <p className={hdg}>Density</p>
          {(["compact", "comfortable", "spacious"] as const).map((d) => (
            <button key={d} onClick={() => { onChangeDensity(d); setOpen(false); }} className={cn(rowAct((density ?? "comfortable") === d), "pb-0.5")}>
              <span className="flex-1 capitalize">{d}</span>
              {(density ?? "comfortable") === d && <Check className="h-3 w-3 text-primary" />}
            </button>
          ))}
          <div className="pb-1" />
        </div>
      )}
    </div>
  );
}

// ── Slim settings menu ────────────────────────────────────────────────────────
//
// ≡ dropdown: Save view as default | Manage Access | Permission Log

interface ListSettingsMenuProps {
  entityCode: string;
  mode:       ViewMode;
  density?:   "compact" | "comfortable" | "spacious";
}

function ListSettingsMenu({ entityCode, mode, density }: ListSettingsMenuProps) {
  const [open,   setOpen]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const ref    = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const nav = (path: string) => { setOpen(false); router.push(path); };

  const saveAsDefault = async () => {
    setSaving(true);
    try {
      await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: {
            [`${entityCode}.list.defaultView`]:    mode,
            [`${entityCode}.list.defaultDensity`]: density ?? "comfortable",
          },
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const row = "flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors hover:bg-muted/60 text-muted-foreground hover:text-foreground";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Settings"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background shadow-sm transition-colors",
          open ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
      >
        <AlignJustify className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-lg border bg-popover shadow-lg overflow-hidden">
          <div className="absolute -top-[5px] right-2.5 h-2.5 w-2.5 rotate-45 rounded-sm border-l border-t bg-popover" />

          <button onClick={saveAsDefault} disabled={saving} className={cn(row, "pt-2.5 disabled:opacity-50")}>
            {saved
              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
              : saving
              ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              : <Save className="h-3.5 w-3.5 shrink-0" />}
            <span>{saved ? "Saved!" : "Save view as default"}</span>
          </button>

          <div className="my-1 h-px bg-border/60" />

          <button onClick={() => nav(`/setup/policies?entity=${entityCode}`)} className={row}>
            <Shield className="h-3.5 w-3.5 shrink-0" />
            <span>Manage Access</span>
          </button>

          <button onClick={() => nav(`/setup/audit/events?entity=${entityCode}`)} className={cn(row, "pb-2")}>
            <ScrollText className="h-3.5 w-3.5 shrink-0" />
            <span>Permission Log</span>
          </button>
        </div>
      )}
    </div>
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

function SaveViewBar({
  entityCode,
  state,
  isModified,
  baseSavedViewId,
  baseName,
}: {
  entityCode:     string;
  state:          EntityListQueryState;
  isModified:     boolean;
  baseSavedViewId?: string;
  baseName?:      string;
}) {
  const [open, setOpen]     = useState(false);
  const [name, setName]     = useState("");
  const nameInputRef        = useRef<HTMLInputElement>(null);

  const saveView   = useSaveView();
  const updateView = useUpdateView(entityCode);

  const handleSaveNew = () => {
    if (!name.trim()) return;
    saveView.mutate(
      {
        entity_code: entityCode,
        name:        name.trim(),
        is_default:  false,
        is_shared:   false,
        config:      state,
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
    updateView.mutate({ viewId: baseSavedViewId, config: state });
  };

  const saving = saveView.isPending || updateView.isPending;

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Update (overwrite base view) — only when modified from a saved view */}
        {isModified && baseSavedViewId && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={saving}
            onClick={handleUpdate}
          >
            {updateView.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Update{baseName ? ` "${baseName}"` : ""}
          </Button>
        )}

        {/* Save as new view */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => { setName(""); setOpen(true); }}
        >
          <Save className="h-3 w-3" />
          Save as View
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save View</DialogTitle>
            <DialogDescription>
              Give this filter/sort configuration a name to recall it later.
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
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
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
    hasActiveQuery,
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

  // Normalised display_config v2 fields (list_renderer, view_modes, status_field_names, …)
  const displayConfig = useMemo(
    () => entity ? resolveDisplayConfig(entity.display_config as Record<string, unknown>) : undefined,
    [entity],
  );

  // Active view mode: URL state overrides the entity-level default.
  // Fallback chain: state.viewMode → display_config.list_renderer → "list"
  const viewMode = (state.viewMode ?? (
    displayConfig?.list_renderer ? (B5_TO_LEGACY_MODE[displayConfig.list_renderer] ?? "list") : "list"
  )) as ViewMode;

  // Resolve active sort: URL state → metadata default → undefined
  const activeSort = (state.sort && state.sort.length > 0) ? state.sort : presentationConfig?.defaultSort;

  // Build server request params from canonical URL state.
  // client searchMode: strip q from server request — rows are filtered in-browser instead.
  // facets: honour state.facets (user may upgrade to "all" via Load all button); default "cheap".
  const apiParams = useMemo(() => {
    const effectiveState = state.searchMode === "client"
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
  }, [state, activeSort, viewMode]);

  const { data: listData, isLoading: dataLoading } = useEntityList(entityCode, apiParams);

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

  // Client search mode: filter the current page of rows in-browser.
  // Server search mode (default): server already applied the ?q= filter.
  const allRows = useMemo(() => {
    if (state.searchMode !== "client" || !state.search?.trim()) return rawRows;
    const q = state.search.toLowerCase();
    const searchableCols = entity?.fields.filter((f) => f.is_searchable).map((f) => f.name) ?? [];
    if (searchableCols.length === 0) return rawRows;
    return rawRows.filter((row) =>
      searchableCols.some((col) => String(row[col] ?? "").toLowerCase().includes(q)),
    );
  }, [rawRows, state.searchMode, state.search, entity?.fields]);

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
    (c) => c.semanticResolver && ["status","record_status","state"].includes(c.fieldName),
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
          return <StatusBadge value={value} resolverName={colPres.semanticResolver} />;
        }
        const Renderer = resolveFieldRenderer(field);
        return <Renderer value={value} field={field} mode="view" />;
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
            <Renderer value={getValue()} field={ef} mode="view" />
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

  // Determine which saved view tab is "active" based on URL state
  const activeSavedViewId = state.savedViewId ?? "__all";

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

  // Saved views tab bar — becomes Region 2 (context bar) when views exist
  const savedViewsContext = savedViews.length > 0 ? (
    <div className="flex gap-1 overflow-x-auto">
      <button
        onClick={() => handleSavedViewClick("__all")}
        className={cn(
          "shrink-0 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
          activeSavedViewId === "__all"
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        All
      </button>
      {savedViews.map((view) => (
        <button
          key={view.id}
          onClick={() => handleSavedViewClick(view.id)}
          className={cn(
            "shrink-0 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
            activeSavedViewId === view.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {view.name}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <PageShell
      header={
        <PageHeader
          title={entity.entity_name}
          primaryActions={
            <>
              {operations ? (
                <ActionBar
                  operations={operations.filter((op) => !op.permission_code.toLowerCase().includes("export"))}
                  surface="LIST"
                  entityCode={entityCode}
                />
              ) : null}
              <ListSettingsMenu
                entityCode={entityCode}
                mode={viewMode}
                density={state.density}
              />
            </>
          }
          actions={
            <div className="flex items-center gap-1 sm:gap-2">
              <SearchInput
                placeholder={`Search ${entity.entity_name}…`}
                value={state.search ?? ""}
                onSearch={setSearch}
                loading={dataLoading && !!state.search && state.searchMode !== "client"}
                className="w-28 sm:w-44 lg:w-64"
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Escape") setSearch("");
                }}
                modeToggle={entity.fields.some((f) => f.is_searchable) ? {
                  active:         state.searchMode === "client",
                  onToggle:       () => setSearchMode(state.searchMode === "client" ? undefined : "client"),
                  activeLabel:    "In view",
                  inactiveLabel:  "All",
                  icon:           <Zap className="size-3" />,
                  title:          state.searchMode === "client"
                    ? "Instant search: filtering this page only — click to switch to server search (all records)"
                    : "Server search: querying all records — click to switch to instant page filter",
                } : undefined}
              />

              <MyWorkDropdown
                entity={entity}
                activeFilters={activeFilters}
                onSetFilters={(f) => setFilters(Object.keys(f).length > 0 ? f : undefined)}
              />

              <OrganizeControl
                activeDrawer={activeDrawer}
                onOpen={openDrawer}
                hasActiveFilters={hasActiveFilters}
                filterCount={Object.keys(activeFilters).length}
                sortCount={activeSort?.length ?? 0}
                groupField={state.group ?? undefined}
                visibleColumns={visibleColumnNames.length}
                totalColumns={allDescriptorColumns.length}
                showColumns={viewMode === "list" || viewMode === "excel"}
              />

              <ViewLauncherButton
                mode={viewMode}
                density={state.density}
                hasGroupable={hasGroupable}
                onChangeMode={setViewMode}
                onChangeDensity={(d) => setDensity(d)}
                availableModes={displayConfig?.view_modes?.map(
                  (m) => B5_TO_LEGACY_MODE[m] ?? (m as ViewMode),
                )}
              />

              {(hasActiveQuery || isModified) && (
                <SaveViewBar
                  entityCode={entityCode}
                  state={state}
                  isModified={isModified}
                  baseSavedViewId={state.baseSavedViewId}
                  baseName={baseSavedView?.name}
                />
              )}
            </div>
          }
        />
      }
      context={savedViewsContext}
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
                  Showing <strong className="text-foreground">{allRows.length}</strong>
                  {" of "}
                  <strong className="text-foreground">{serverTotal.toLocaleString()}</strong>
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
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
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
              density={state.density ?? "comfortable"}
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
              density={state.density ?? "comfortable"}
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
              titleKey={titleKey}
              entityCode={entityCode}
              onRowClick={handleRowClick}
              onRowContextMenu={handleRowContextMenu}
              statusResolverName={statusResolverName}
              compactColumns={compactColumns}
              density={state.density ?? "comfortable"}
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
                <div className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
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
                        <span className="flex items-center gap-1 text-xs text-green-500">
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
