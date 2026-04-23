/**
 * KanbanView — grouped card board with inline status transitions
 *
 * Groups records by the first `is_groupable` field (preferring status/state).
 * Each card shows a "Move →" dropdown that PATCHes the record via the records
 * relay API and invalidates the entity-list query on success.
 *
 * Subtitle field: driven by entity.display_config.subtitle_field.
 * Column header colors: keyed by canonical status names.
 *
 * F3: columnOrder prop controls column sequence (lifecycle/enum sort_order).
 * F4: count badge labelled "on this page" to communicate it is page-scoped.
 * F6: NULL/empty group values collected into a trailing "Unassigned" column.
 */
"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { Badge } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { kanbanStatusIntent } from "@athyper/theme/domain-intents";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";

function colColor(status: string): string {
  const { subtleBadge } = resolveSemanticColors(kanbanStatusIntent(status));
  return subtleBadge;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_NAMES = ["status", "record_status", "state", "lifecycle_state"];
const UNASSIGNED   = "__unassigned__";

export function findKanbanGroupField(entity: CompiledEntity): EntityField | undefined {
  return (
    entity.fields.find((f) => STATUS_NAMES.includes(f.name) && f.is_groupable) ??
    entity.fields.find((f) => f.is_groupable)
  );
}

function fieldVal(row: Record<string, unknown>, field: EntityField): string {
  const v = row[field.name] ?? row[field.column_name];
  // F6: null/undefined/empty → sentinel for Unassigned column
  if (v === null || v === undefined || v === "") return UNASSIGNED;
  return String(v);
}

function groupRows(
  rows: Record<string, unknown>[],
  field: EntityField,
): Map<string, Record<string, unknown>[]> {
  const map = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = fieldVal(row, field);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
}

/**
 * Order columns: honour columnOrder (from lifecycle/enum sort_order), then
 * append any remaining columns not in the list, with Unassigned always last.
 */
function orderColumns(
  groups: Map<string, Record<string, unknown>[]>,
  columnOrder: string[] | undefined,
): [string, Record<string, unknown>[]][] {
  const all      = Array.from(groups.entries());
  const assigned = all.filter(([k]) => k !== UNASSIGNED);
  const unassigned = all.filter(([k]) => k === UNASSIGNED);

  if (!columnOrder || columnOrder.length === 0) {
    return [...assigned, ...unassigned];
  }

  const ordered: [string, Record<string, unknown>[]][] = [];
  for (const key of columnOrder) {
    const entry = groups.get(key);
    if (entry) ordered.push([key, entry]);
  }
  // Append any values not in the explicit order (future states etc.)
  for (const [key, rows] of assigned) {
    if (!columnOrder.includes(key)) ordered.push([key, rows]);
  }
  return [...ordered, ...unassigned];
}

// ── Status-transition dropdown ────────────────────────────────────────────────

function MoveDropdown({
  current,
  allOptions,
  onSelect,
  busy,
}: {
  current:    string;
  allOptions: string[];
  onSelect:   (next: string) => void;
  busy:       boolean;
}) {
  const [open, setOpen] = useState(false);
  const others = allOptions.filter((o) => o !== current && o !== UNASSIGNED);
  if (others.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        disabled={busy}
        className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-2xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-40"
      >
        {busy
          ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
          : <ChevronDown className="h-2.5 w-2.5" />}
        Move
      </button>

      {open && (
        <div
          className="absolute z-20 bottom-full mb-1 left-0 min-w-[130px] rounded-lg border bg-popover shadow-md overflow-hidden"
          onMouseLeave={() => setOpen(false)}
        >
          {others.map((opt) => (
            <button
              key={opt}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onSelect(opt);
              }}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 capitalize transition-colors"
            >
              {opt.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Kanban card ───────────────────────────────────────────────────────────────

function KanbanCard({
  row,
  titleKey,
  subtitleKey,
  allStatuses,
  groupField,
  entityCode,
  onRowClick,
}: {
  row:         Record<string, unknown>;
  titleKey:    string;
  subtitleKey: string | undefined;
  allStatuses: string[];
  groupField:  EntityField;
  entityCode:  string;
  onRowClick?: (row: Record<string, unknown>) => void;
}) {
  const qc      = useQueryClient();
  const id      = String(row.id ?? "");
  const title   = String(row[titleKey] ?? row.name ?? row.code ?? id);
  const sub     = subtitleKey ? (row[subtitleKey] != null ? String(row[subtitleKey]) : null) : null;
  const current = fieldVal(row, groupField);

  const moveMut = useMutation({
    mutationFn: async (next: string) => {
      const res = await fetch(`/api/relay/api/records/${entityCode}/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ [groupField.name]: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["entity-list", entityCode] });
    },
  });

  return (
    <div
      onClick={() => onRowClick?.(row)}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-xs transition-all hover:shadow-sm space-y-1.5",
        onRowClick && "cursor-pointer",
      )}
    >
      <p className="text-sm font-medium leading-snug line-clamp-2">{title}</p>

      {sub && (
        <p className="text-xs text-muted-foreground line-clamp-1">{sub}</p>
      )}

      <div className="flex items-center justify-between gap-1 pt-0.5">
        {id ? (
          <span className="font-mono text-2xs text-muted-foreground/50">
            {id.slice(0, 8)}
          </span>
        ) : (
          <span />
        )}
        <MoveDropdown
          current={current}
          allOptions={allStatuses}
          onSelect={(next) => moveMut.mutate(next)}
          busy={moveMut.isPending}
        />
      </div>
    </div>
  );
}

// ── Main KanbanView ───────────────────────────────────────────────────────────

export interface KanbanViewProps {
  rows:               Record<string, unknown>[];
  entity:             CompiledEntity;
  titleKey:           string;
  entityCode:         string;
  onRowClick?:        (row: Record<string, unknown>) => void;
  /**
   * Override which field is used for grouping.
   * Must be a field where EntityField.is_groupable = true.
   * Falls back to findKanbanGroupField(entity) when absent or invalid.
   */
  groupFieldOverride?: string;
  /**
   * F3: Explicit column order from lifecycle/enum sort_order metadata.
   * Columns in this list appear first, in order. Any values not in the list
   * are appended after. Unassigned (null group value) is always last.
   */
  columnOrder?: string[];
  /**
   * Server-provided total record count per group value.
   * When present, column headers show the true total instead of page-fragment count.
   * Key matches group field value (or "__unassigned__" for null values).
   */
  groupCounts?: Record<string, number>;
}

export function KanbanView({
  rows,
  entity,
  titleKey,
  entityCode,
  onRowClick,
  groupFieldOverride,
  columnOrder,
  groupCounts,
}: KanbanViewProps) {
  const groupField = groupFieldOverride
    ? (entity.fields.find((f) => f.name === groupFieldOverride && f.is_groupable) ?? findKanbanGroupField(entity))
    : findKanbanGroupField(entity);
  const subtitleKey = entity.display_config?.subtitle_field;

  if (!groupField) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Board view is unavailable — this entity has no groupable field.
      </div>
    );
  }

  const groups  = groupRows(rows, groupField);
  const columns = orderColumns(groups, columnOrder);
  // All valid status options for the Move dropdown (exclude the sentinel)
  const allStatuses = Array.from(groups.keys()).filter((k) => k !== UNASSIGNED);

  if (columns.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">No records</div>
    );
  }

  const totalCount = groupCounts
    ? Object.values(groupCounts).reduce((a, b) => a + b, 0)
    : rows.length;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Grouped by <span className="font-medium">{groupField.label ?? groupField.name}</span>
        {" · "}
        <span className="tabular-nums">{totalCount.toLocaleString()}</span>
        {groupCounts ? " total" : " on this page"}
      </p>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {columns.map(([status, items]) => {
          const isUnassigned  = status === UNASSIGNED;
          const displayLabel  = isUnassigned ? "Unassigned" : status.replace(/_/g, " ");
          const serverTotal   = groupCounts?.[status];
          const displayCount  = serverTotal ?? items.length;
          const countTooltip  = serverTotal !== undefined
            ? `${serverTotal.toLocaleString()} total · ${items.length} on this page`
            : `${items.length} on this page`;

          return (
            <div key={status} className="min-w-[230px] max-w-[270px] flex-shrink-0 space-y-2">
              {/* Column header */}
              <div className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-1.5",
                isUnassigned ? "bg-muted/30 text-muted-foreground" : colColor(status),
              )}>
                <span className="text-xs font-semibold capitalize flex-1">
                  {displayLabel}
                </span>
                <Badge
                  variant="secondary"
                  className="text-2xs px-1.5 py-0.5 bg-background/50 border-0"
                  title={countTooltip}
                >
                  {displayCount.toLocaleString()}
                </Badge>
              </div>

              {/* Cards */}
              {items.map((row) => (
                <KanbanCard
                  key={String(row.id ?? Math.random())}
                  row={row}
                  titleKey={titleKey}
                  subtitleKey={subtitleKey}
                  allStatuses={allStatuses}
                  groupField={groupField}
                  entityCode={entityCode}
                  onRowClick={onRowClick}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
