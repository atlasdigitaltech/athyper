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
 * Saved views: tabs driven by useSavedViews()
 * Bulk ops:    selection bar when 1+ rows selected in list mode
 */
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutList,
  LayoutGrid,
  Trash2,
  Download,
  Tag,
  Kanban,
  BarChart2,
} from "lucide-react";
import { useCompiledEntity, useEntityList, useEntityOperations, useSavedViews } from "@athyper/query";
import { resolveListConfig } from "@athyper/metadata-client/compiled-reader";
import { DataTable, type ColumnDef, type RowSelectionState } from "@athyper/ui/data";
import { PageFrame } from "@athyper/ui/layout";
import { Button, Badge, Skeleton } from "@athyper/ui/primitives";
import { SearchInput } from "@athyper/ui/composites";
import { cn } from "@athyper/theme/utils";
import { resolveFieldRenderer } from "../field-renderers/registry";
import { ActionBar } from "../actions/ActionBar";
import { KanbanView, findKanbanGroupField } from "./KanbanView";
import { DashboardView } from "./DashboardView";

export interface EntityListPageProps {
  entityCode: string;
}

type ViewMode = "list" | "board" | "compact" | "dashboard";

// ── Compact card grid ─────────────────────────────────────────────────────────

function getStatus(row: Record<string, unknown>): string {
  return String(row.status ?? row.record_status ?? row.state ?? "—");
}

function CompactView({
  rows,
  titleKey,
  entityCode,
  onRowClick,
}: {
  rows:        Record<string, unknown>[];
  titleKey:    string;
  entityCode:  string;
  onRowClick?: (row: Record<string, unknown>) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">No records</div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((row) => {
        const id     = String(row.id ?? "");
        const title  = String(row[titleKey] ?? row.name ?? row.code ?? id);
        const status = getStatus(row);
        return (
          <div
            key={id}
            onClick={() => onRowClick?.(row)}
            className={cn(
              "flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs transition-all hover:border-primary/30 hover:shadow-sm",
              onRowClick && "cursor-pointer",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-snug">{title}</p>
              <Badge variant="outline" className="shrink-0 text-[9px] px-1.5 py-0.5 font-mono">
                {entityCode}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground capitalize">
                {status.replace(/_/g, " ")}
              </span>
              {id && (
                <span className="font-mono text-[9px] text-muted-foreground/50">
                  {id.slice(0, 8)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── View mode switcher ────────────────────────────────────────────────────────

function ViewModeSwitcher({
  mode,
  onChange,
  hasGroupable,
}: {
  mode:         ViewMode;
  onChange:     (m: ViewMode) => void;
  hasGroupable: boolean;
}) {
  type Option = { value: ViewMode; Icon: typeof LayoutList; label: string; gated?: boolean };

  const options: Option[] = [
    { value: "list",      Icon: LayoutList, label: "List" },
    { value: "board",     Icon: Kanban,     label: "Board",     gated: !hasGroupable },
    { value: "compact",   Icon: LayoutGrid, label: "Compact" },
    { value: "dashboard", Icon: BarChart2,  label: "Dashboard" },
  ];

  return (
    <div className="flex rounded-md border overflow-hidden">
      {options
        .filter((o) => !o.gated)
        .map(({ value, Icon, label }) => (
          <button
            key={value}
            onClick={() => onChange(value)}
            title={label}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors",
              mode === value
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
    </div>
  );
}

// ── Bulk ops bar ──────────────────────────────────────────────────────────────

function BulkOpsBar({
  count,
  onClear,
}: {
  count:   number;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2">
      <span className="text-sm font-medium">{count} selected</span>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
          <Tag className="h-3.5 w-3.5" />
          Tag
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
        <button
          onClick={onClear}
          className="ml-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function EntityListPage({ entityCode }: EntityListPageProps) {
  const router = useRouter();
  const [viewMode,      setViewMode]      = useState<ViewMode>("list");
  const [rowSelection,  setRowSelection]  = useState<RowSelectionState>({});
  const [activeView,    setActiveView]    = useState<string>("__all");
  const [searchQuery,   setSearchQuery]   = useState<string>("");

  const { data: entity,     isLoading: metaLoading, error: metaError } = useCompiledEntity(entityCode);
  const { data: operations }                                            = useEntityOperations(entityCode);
  const { data: savedViews = [] }                                       = useSavedViews(entityCode);

  // Build list query params from active saved view + search term
  const listParams = useMemo(() => {
    const activeViewObj = activeView !== "__all"
      ? savedViews.find((v) => v.id === activeView)
      : undefined;

    // Convert saved view filters (array) → equality filter map for the backend
    const viewFilters: Record<string, unknown> = {};
    if (activeViewObj?.config.filters) {
      for (const f of activeViewObj.config.filters) {
        // Apply equality and common comparison operators
        if (["eq", "=", "equals", "is"].includes(f.operator)) {
          viewFilters[f.field] = f.value;
        }
      }
    }

    const hasFilters = Object.keys(viewFilters).length > 0;
    const hasSearch  = searchQuery.trim().length > 0;

    if (!hasFilters && !hasSearch) return undefined;

    return {
      ...(hasSearch  ? { q: searchQuery.trim() }  : {}),
      ...(hasFilters ? { filters: viewFilters }   : {}),
    };
  }, [activeView, savedViews, searchQuery]);

  const { data: listData, isLoading: dataLoading } = useEntityList(entityCode, listParams);

  // Fail fast on unknown entity code
  if (metaError) {
    return (
      <PageFrame title="Entity Not Found">
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            Entity <code className="font-mono">{entityCode}</code> not found in compiled metadata.
          </p>
        </div>
      </PageFrame>
    );
  }

  if (metaLoading || !entity) {
    return (
      <PageFrame>
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageFrame>
    );
  }

  const listConfig    = resolveListConfig(entity);
  const titleKey      = listConfig.columns[0]?.name ?? "name";
  const hasGroupable  = !!findKanbanGroupField(entity);

  const allRows       = (listData?.data ?? []) as Record<string, unknown>[];
  const selectedCount = Object.keys(rowSelection).length;

  // Rows are already filtered by the backend (search + saved view filters)
  const rows = allRows;

  // Build TanStack Table columns from descriptor fields
  const columns: ColumnDef<Record<string, unknown>>[] = listConfig.columns.map((field) => ({
    accessorKey: field.name,
    header:      field.label ?? field.name,
    enableSorting: field.is_sortable,
    cell: ({ getValue }) => {
      const Renderer = resolveFieldRenderer(field);
      return <Renderer value={getValue()} field={field} mode="view" />;
    },
  }));

  const handleRowClick = (row: Record<string, unknown>) => {
    const id = row.id as string;
    if (id) router.push(`/app/${entityCode}/${id}`);
  };

  return (
    <PageFrame
      title={entity.entity_name}
      description={`${rows.length} records`}
      actions={
        <div className="flex items-center gap-2">
          <SearchInput
            placeholder={`Search ${entity.entity_name}…`}
            onSearch={setSearchQuery}
            loading={dataLoading && searchQuery.length > 0}
            className="w-48 sm:w-64"
          />
          <ViewModeSwitcher
            mode={viewMode}
            onChange={setViewMode}
            hasGroupable={hasGroupable}
          />
          {operations ? (
            <ActionBar operations={operations} surface="LIST" entityCode={entityCode} />
          ) : null}
        </div>
      }
    >
      <div className="space-y-3">
        {/* Saved views tabs */}
        {savedViews.length > 0 && (
          <div className="flex gap-1 border-b pb-0">
            <button
              onClick={() => { setActiveView("__all"); setSearchQuery(""); }}
              className={cn(
                "px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
                activeView === "__all"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              All
            </button>
            {savedViews.map((view) => (
              <button
                key={view.id}
                onClick={() => { setActiveView(view.id); setSearchQuery(""); }}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
                  activeView === view.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {view.name}
              </button>
            ))}
          </div>
        )}

        {/* Bulk ops bar (list mode only) */}
        {selectedCount > 0 && viewMode === "list" && (
          <BulkOpsBar count={selectedCount} onClear={() => setRowSelection({})} />
        )}

        {/* ── Views ── */}
        {viewMode === "list" && (
          <DataTable
            columns={columns}
            data={rows}
            loading={dataLoading}
            selectable
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            pageSize={25}
            onRowClick={handleRowClick}
          />
        )}

        {viewMode === "board" && (
          <KanbanView
            rows={rows}
            entity={entity}
            titleKey={titleKey}
            entityCode={entityCode}
            onRowClick={handleRowClick}
          />
        )}

        {viewMode === "compact" && (
          <CompactView
            rows={rows}
            titleKey={titleKey}
            entityCode={entityCode}
            onRowClick={handleRowClick}
          />
        )}

        {viewMode === "dashboard" && (
          <DashboardView
            rows={rows}
            entity={entity}
          />
        )}
      </div>
    </PageFrame>
  );
}
