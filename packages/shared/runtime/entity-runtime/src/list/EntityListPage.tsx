/**
 * @athyper/entity-runtime — EntityListPage
 *
 * Renders a master record list from compiled metadata.
 * Columns, filters, sort, and search are all driven by the descriptor.
 *
 * View modes: list (default DataTable) | board (kanban by status) | compact (card grid)
 * Saved views: tabs driven by useSavedViews()
 * Bulk ops: selection bar when 1+ rows selected in list mode
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Columns,
  LayoutList,
  LayoutGrid,
  Trash2,
  Download,
  Tag,
} from "lucide-react";
import { useCompiledEntity, useEntityList, useEntityOperations, useSavedViews } from "@athyper/query";
import { resolveListConfig } from "@athyper/metadata-client/compiled-reader";
import { DataTable, type ColumnDef, type RowSelectionState } from "@athyper/ui/data";
import { PageFrame } from "@athyper/ui/layout";
import { Button, Badge, Skeleton } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { resolveFieldRenderer } from "../field-renderers/registry";
import { ActionBar } from "../actions/ActionBar";

export interface EntityListPageProps {
  entityCode: string;
}

type ViewMode = "list" | "board" | "compact";

// ── Board view helpers ────────────────────────────────────────────────────────

function getStatus(row: Record<string, unknown>): string {
  return String(row.status ?? row.record_status ?? row.state ?? "—");
}

function groupByStatus(
  rows: Record<string, unknown>[],
): Map<string, Record<string, unknown>[]> {
  const map = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const s = getStatus(row);
    if (!map.has(s)) map.set(s, []);
    map.get(s)!.push(row);
  }
  return map;
}

// ── Sub-views ─────────────────────────────────────────────────────────────────

function BoardView({
  rows,
  titleKey,
  onRowClick,
}: {
  rows: Record<string, unknown>[];
  titleKey: string;
  onRowClick?: (row: Record<string, unknown>) => void;
}) {
  const groups = groupByStatus(rows);
  const columns = Array.from(groups.entries());

  if (columns.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        No records
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columns.map(([status, items]) => (
        <div key={status} className="min-w-[240px] flex-shrink-0">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {status}
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
              {items.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {items.map((row) => {
              const id = String(row.id ?? "");
              const title = String(row[titleKey] ?? row.name ?? row.code ?? id);
              return (
                <div
                  key={id}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "rounded-lg border bg-card p-3 shadow-xs transition-shadow hover:shadow-sm",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  <p className="text-sm font-medium truncate">{title}</p>
                  {id && (
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {id.slice(0, 8)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompactView({
  rows,
  titleKey,
  entityCode,
  onRowClick,
}: {
  rows: Record<string, unknown>[];
  titleKey: string;
  entityCode: string;
  onRowClick?: (row: Record<string, unknown>) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        No records
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((row) => {
        const id = String(row.id ?? "");
        const title = String(row[titleKey] ?? row.name ?? row.code ?? id);
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
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                {status}
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
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  const options: { value: ViewMode; Icon: typeof LayoutList; label: string }[] = [
    { value: "list",    Icon: LayoutList, label: "List" },
    { value: "board",   Icon: Columns,    label: "Board" },
    { value: "compact", Icon: LayoutGrid, label: "Compact" },
  ];

  return (
    <div className="flex rounded-md border overflow-hidden">
      {options.map(({ value, Icon, label }) => (
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
  count: number;
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
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [activeView, setActiveView] = useState<string>("__all");

  const { data: entity, isLoading: metaLoading, error: metaError } = useCompiledEntity(entityCode);
  const { data: listData, isLoading: dataLoading } = useEntityList(entityCode);
  const { data: operations } = useEntityOperations(entityCode);
  const { data: savedViews = [] } = useSavedViews(entityCode);

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

  const listConfig = resolveListConfig(entity);
  const titleKey = listConfig.columns[0]?.name ?? "name";

  const allRows = (listData?.data ?? []) as Record<string, unknown>[];
  const selectedCount = Object.keys(rowSelection).length;

  // Apply saved view filter (currently just a label switch — full filter in later sprint)
  const rows = allRows;

  // Build TanStack Table columns from descriptor fields
  const columns: ColumnDef<Record<string, unknown>>[] = listConfig.columns.map((field) => ({
    accessorKey: field.name,
    header: field.label ?? field.name,
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
          <ViewModeSwitcher mode={viewMode} onChange={setViewMode} />
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
              onClick={() => setActiveView("__all")}
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
                onClick={() => setActiveView(view.id)}
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

        {/* Bulk ops bar */}
        {selectedCount > 0 && viewMode === "list" && (
          <BulkOpsBar count={selectedCount} onClear={() => setRowSelection({})} />
        )}

        {/* Content */}
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
          <BoardView rows={rows} titleKey={titleKey} onRowClick={handleRowClick} />
        )}

        {viewMode === "compact" && (
          <CompactView
            rows={rows}
            titleKey={titleKey}
            entityCode={entityCode}
            onRowClick={handleRowClick}
          />
        )}
      </div>
    </PageFrame>
  );
}
