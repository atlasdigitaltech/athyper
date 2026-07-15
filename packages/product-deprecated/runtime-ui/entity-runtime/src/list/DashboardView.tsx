/**
 * DashboardView — aggregate KPI tiles + status distribution
 *
 * Derives all metrics from the already-fetched row set, so no extra API calls.
 * KPIs: total records, today's additions, active/approved count, pending/draft count.
 * Status distribution: horizontal bar + legend, keyed by status-like field.
 * Numeric aggregates: sum + avg for every field marked is_aggregatable with a
 *   numeric data_type (integer / bigint / decimal / numeric / money).
 */
"use client";

import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { cn } from "@athyper/theme/utils";
import { listTypography, runtimeStatusBarClass, runtimeStatusDotClass } from "./listPresentation";
import { configuredAuditFieldNames, configuredStatusFieldNames, fieldByName, fieldValue } from "../metadata/fieldSemantics";

// ── Numeric data types ────────────────────────────────────────────────────────

const NUMERIC_TYPES = new Set(["integer", "bigint", "decimal", "numeric", "money", "float"]);

// ── Status bar palette ────────────────────────────────────────────────────────

// ── Stat tile ─────────────────────────────────────────────────────────────────

type TileAccent = "default" | "emerald" | "blue" | "amber" | "red";

const TILE_ACCENT: Record<TileAccent, string> = {
  default: "border-border bg-card",
  emerald: "border-success/30 bg-success/10",
  blue:    "border-primary/30 bg-primary/10",
  amber:   "border-warning/30 bg-warning/10",
  red:     "border-destructive/30 bg-destructive/10",
};

function StatTile({
  label,
  value,
  accent = "default",
  sub,
}: {
  label:   string;
  value:   string | number;
  accent?: TileAccent;
  sub?:    string;
}) {
  return (
    <div className={`rounded-lg border p-4 space-y-1 ${TILE_ACCENT[accent]}`}>
      <p className={listTypography.kpi.label}>{label}</p>
      <p className={listTypography.kpi.value}>{value}</p>
      {sub && <p className={listTypography.kpi.sub}>{sub}</p>}
    </div>
  );
}

// ── Status distribution ───────────────────────────────────────────────────────

function StatusDistribution({
  groups,
  total,
}: {
  groups: Map<string, number>;
  total:  number;
}) {
  const entries = Array.from(groups.entries()).sort((a, b) => b[1] - a[1]);
  if (total === 0 || entries.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <p className={listTypography.sectionHeading}>
        Status Distribution
      </p>

      {/* Segmented progress bar */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted gap-px">
        {entries.map(([status, count]) => (
          <div
            key={status}
            title={`${status}: ${count}`}
            style={{ width: `${(count / total) * 100}%` }}
            className={cn("h-full", runtimeStatusBarClass(status))}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {entries.map(([status, count]) => (
          <div key={status} className="flex items-center gap-1.5 text-xs">
            <div className={cn("h-2 w-2 shrink-0 rounded-full", runtimeStatusDotClass(status))} />
            <span className="capitalize text-muted-foreground">{status.replace(/_/g, " ")}</span>
            <span className="font-medium tabular-nums">{count}</span>
            <span className="text-muted-foreground/60">
              ({Math.round((count / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Numeric aggregate tiles ───────────────────────────────────────────────────

function NumericTiles({
  rows,
  fields,
}: {
  rows:   Record<string, unknown>[];
  fields: EntityField[];
}) {
  const tiles = fields.slice(0, 4).flatMap((field) => {
    const values = rows
      .map((r) => {
        const v = r[field.name] ?? r[field.column_name];
        return typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
      })
      .filter((v) => !isNaN(v));

    if (values.length === 0) return [];

    const sum  = values.reduce((a, b) => a + b, 0);
    const avg  = sum / values.length;
    const label = field.label ?? field.name;
    const fmt   = (n: number) => {
      const s = n.toLocaleString(undefined, { maximumFractionDigits: 2 });
      return field.unit ? `${s} ${field.unit}` : s;
    };

    return [{
      key:    field.name,
      label:  `Total ${label}`,
      value:  fmt(sum),
      sub:    `Avg: ${fmt(avg)} · ${values.length} records`,
      accent: "blue" as TileAccent,
    }];
  });

  if (tiles.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className={listTypography.sectionHeading}>
        Numeric Aggregates
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <StatTile key={t.key} label={t.label} value={t.value} sub={t.sub} accent={t.accent} />
        ))}
      </div>
    </div>
  );
}

// ── Main DashboardView ────────────────────────────────────────────────────────

export interface DashboardViewProps {
  rows:   Record<string, unknown>[];
  entity: CompiledEntity;
}

export function DashboardView({ rows, entity }: DashboardViewProps) {
  const total  = rows.length;
  const today  = new Date().toISOString().slice(0, 10);
  const auditFields = configuredAuditFieldNames(entity);
  const createdAtField = fieldByName(entity, auditFields.createdAt);

  const todayCount = rows.filter((r) => {
    const d = fieldValue(r, createdAtField);
    return d && String(d).startsWith(today);
  }).length;

  const statusField  = fieldByName(entity, configuredStatusFieldNames(entity)[0]);
  const statusGroups = new Map<string, number>();
  if (statusField) {
    for (const row of rows) {
      const s = String(row[statusField.name] ?? row[statusField.column_name] ?? "—");
      statusGroups.set(s, (statusGroups.get(s) ?? 0) + 1);
    }
  }

  // Numeric aggregate fields
  const numericFields = entity.fields.filter(
    (f) => f.is_aggregatable && NUMERIC_TYPES.has(f.data_type),
  );

  return (
    <div className="space-y-5">
      {/* ── KPI row ── */}
      <div className="space-y-1.5">
        <p className={listTypography.sectionHeading}>
          Summary
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Total Records" value={total.toLocaleString()} />
          {createdAtField && (
            <StatTile
              label="Added Today"
              value={todayCount.toLocaleString()}
              accent={todayCount > 0 ? "emerald" : "default"}
            />
          )}
        </div>
      </div>

      {/* ── Status distribution ── */}
      {statusGroups.size > 0 && (
        <StatusDistribution groups={statusGroups} total={total} />
      )}

      {/* ── Numeric aggregates ── */}
      {numericFields.length > 0 && (
        <NumericTiles rows={rows} fields={numericFields} />
      )}

      {/* ── Empty hint ── */}
      {total === 0 && (
        <div className={listTypography.emptyState}>
          No data to display.
        </div>
      )}
    </div>
  );
}
