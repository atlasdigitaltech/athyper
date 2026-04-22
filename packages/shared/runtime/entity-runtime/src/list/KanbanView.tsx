/**
 * KanbanView — grouped card board with inline status transitions
 *
 * Groups records by the first `is_groupable` field (preferring status/state).
 * Each card shows a "Move →" dropdown that PATCHes the record via the records
 * relay API and invalidates the entity-list query on success.
 *
 * Subtitle field: driven by entity.display_config.subtitle_field.
 * Column header colors: keyed by canonical status names.
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

export function findKanbanGroupField(entity: CompiledEntity): EntityField | undefined {
  return (
    entity.fields.find((f) => STATUS_NAMES.includes(f.name) && f.is_groupable) ??
    entity.fields.find((f) => f.is_groupable)
  );
}

function fieldVal(row: Record<string, unknown>, field: EntityField): string {
  return String(row[field.name] ?? row[field.column_name] ?? "—");
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

// ── Status-transition dropdown ────────────────────────────────────────────────

function MoveDropdown({
  current,
  allOptions,
  onSelect,
  busy,
}: {
  current: string;
  allOptions: string[];
  onSelect: (next: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const others = allOptions.filter((o) => o !== current);
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
}

export function KanbanView({
  rows,
  entity,
  titleKey,
  entityCode,
  onRowClick,
  groupFieldOverride,
}: KanbanViewProps) {
  // Resolve group field: explicit override → metadata default
  const groupField = groupFieldOverride
    ? (entity.fields.find((f) => f.name === groupFieldOverride && f.is_groupable) ?? findKanbanGroupField(entity))
    : findKanbanGroupField(entity);
  const subtitleKey  = entity.display_config?.subtitle_field;

  if (!groupField) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Board view is unavailable — this entity has no groupable field.
      </div>
    );
  }

  const groups     = groupRows(rows, groupField);
  const columns    = Array.from(groups.entries());
  const allStatuses = columns.map(([s]) => s);

  if (columns.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">No records</div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Grouped by <span className="font-medium">{groupField.label ?? groupField.name}</span>
        {" · "}
        <span className="tabular-nums">{rows.length}</span> records
      </p>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {columns.map(([status, items]) => (
          <div key={status} className="min-w-[230px] max-w-[270px] flex-shrink-0 space-y-2">
            {/* Column header */}
            <div className={cn(
              "flex items-center gap-2 rounded-md border px-2.5 py-1.5",
              colColor(status),
            )}>
              <span className="text-xs font-semibold capitalize flex-1">
                {status.replace(/_/g, " ")}
              </span>
              <Badge
                variant="secondary"
                className="text-2xs px-1.5 py-0.5 bg-white/50 dark:bg-black/20 border-0"
              >
                {items.length}
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
        ))}
      </div>
    </div>
  );
}
