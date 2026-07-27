#!/usr/bin/env tsx
/**
 * Temporal-Field Audit (CI gate + seed-sweep CSV)
 *
 * Walks every row in control.entity_field whose data_type is date/timestamp-like
 * and runs the @athyper/temporal::resolveTemporalKind resolver. Emits a CSV
 * report and fails CI (exit 1) if any field is `unresolved` — i.e. naked
 * `timestamp` (no TZ) without an explicit temporal_kind tag, or a garbage
 * temporal_kind string.
 *
 * Two modes:
 *   --report    Print the CSV report and DO NOT fail on unresolved. Used for
 *               the human review step (Phase 0.3b) — produces the rubric the
 *               operator signs off on before bulk-applying seed tags.
 *   (default)   Strict CI gate: exit 1 if any unresolved row exists.
 *
 * The CSV columns:
 *   tenant_scope          'canonical' | tenant uuid
 *   entity_version_id     null = canonical/standard field
 *   field_name
 *   data_type             from control.entity_field.data_type
 *   stored_temporal_kind  control.entity_field.temporal_kind (raw)
 *   stored_display_mode   control.entity_field.display_mode  (raw)
 *   resolved_status       'resolved' | 'unresolved' | 'not_temporal'
 *   resolved_kind         the resolver's decision (or '')
 *   resolved_source       'explicit' | 'inferred' | ''
 *   recommended_action    'OK' | 'ALTER_TO_DATE' | 'TAG_DISPLAY_DATE' | 'TAG_EXPLICITLY'
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/audit-temporal-fields.ts
 *   npx tsx server/scripts/audit-temporal-fields.ts --report > temporal-fields.csv
 *
 * Exit code:
 *   0 — every temporal field resolved (or --report mode)
 *   1 — at least one unresolved row (CI red)
 */

import pg from "pg";
import { resolveTemporalKind, type MetaEntityFieldLike } from "@athyper/temporal";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

const REPORT_MODE = process.argv.includes("--report");

interface FieldRow {
  tenant_id: string | null;
  entity_version_id: string | null;
  name: string;
  data_type: string;
  temporal_kind: string | null;
  display_mode: string | null;
  affects_posting_period: boolean;
}

interface AuditRow {
  scope: string;
  entity_version_id: string;
  field_name: string;
  data_type: string;
  stored_temporal_kind: string;
  stored_display_mode: string;
  resolved_status: "resolved" | "unresolved" | "not_temporal";
  resolved_kind: string;
  resolved_source: string;
  recommended_action: string;
}

const TEMPORAL_DATA_TYPES = ["date", "timestamp", "timestamptz", "datetime"];

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const rows = await loadRows(pool);
    const audit = rows.map(classify);

    if (REPORT_MODE) {
      printCsv(audit);
      const counts = summarise(audit);
      console.error(formatSummary(counts));
      return;
    }

    const unresolved = audit.filter((r) => r.resolved_status === "unresolved");
    if (unresolved.length > 0) {
      console.error(`AUDIT FAILED: ${unresolved.length} unresolved temporal field(s)`);
      for (const row of unresolved.slice(0, 25)) {
        console.error(`  - ${row.scope}/${row.field_name} (data_type=${row.data_type})`);
      }
      if (unresolved.length > 25) console.error(`  ... and ${unresolved.length - 25} more`);
      console.error("\nFix by either:");
      console.error("  (a) ALTER COLUMN to DATE  (preferred for date-only fields)");
      console.error("  (b) Tag explicitly in seed: temporal_kind='businessDate' + display_mode='date'");
      process.exit(1);
    }

    const counts = summarise(audit);
    console.log(`Audit OK — ${counts.resolved} resolved, ${counts.not_temporal} non-temporal.`);
  } finally {
    await pool.end();
  }
}

async function loadRows(pool: pg.Pool): Promise<FieldRow[]> {
  const placeholders = TEMPORAL_DATA_TYPES.map((_, i) => `$${i + 1}`).join(", ");
  const res = await pool.query<FieldRow>(
    `SELECT tenant_id, entity_version_id, name, data_type,
            temporal_kind, display_mode, affects_posting_period
     FROM control.entity_field
     WHERE is_active = true
       AND data_type IN (${placeholders})
     ORDER BY entity_version_id NULLS FIRST, name`,
    TEMPORAL_DATA_TYPES,
  );
  return res.rows;
}

function classify(row: FieldRow): AuditRow {
  const candidate: MetaEntityFieldLike = {
    dataType: row.data_type,
    temporalKind: row.temporal_kind,
    displayMode: row.display_mode,
    affectsPostingPeriod: row.affects_posting_period,
  };
  const res = resolveTemporalKind(candidate);

  const base: Omit<AuditRow, "resolved_status" | "resolved_kind" | "resolved_source" | "recommended_action"> = {
    scope: row.tenant_id ? row.tenant_id : "canonical",
    entity_version_id: row.entity_version_id ?? "",
    field_name: row.name,
    data_type: row.data_type,
    stored_temporal_kind: row.temporal_kind ?? "",
    stored_display_mode: row.display_mode ?? "",
  };

  if (res.status === "not_temporal") {
    return { ...base, resolved_status: "not_temporal", resolved_kind: "", resolved_source: "", recommended_action: "OK" };
  }
  if (res.status === "unresolved") {
    return {
      ...base,
      resolved_status: "unresolved",
      resolved_kind: "",
      resolved_source: "",
      recommended_action: row.data_type === "timestamp" || row.data_type === "datetime" ? "TAG_EXPLICITLY" : "TAG_EXPLICITLY",
    };
  }
  // resolved
  const action = recommendAction(row, res.kind, res.source);
  return {
    ...base,
    resolved_status: "resolved",
    resolved_kind: res.kind,
    resolved_source: res.source,
    recommended_action: action,
  };
}

function recommendAction(
  row: FieldRow,
  kind: "businessDate" | "instant" | "zonedDateTime",
  source: "explicit" | "inferred",
): string {
  if (kind === "businessDate" && row.data_type === "timestamptz") {
    // Field A on legacy storage — prefer ALTER, otherwise tag with display_mode='date'.
    if (source === "explicit" && row.display_mode === "date") return "OK";
    return "ALTER_TO_DATE";
  }
  if (kind === "businessDate" && row.data_type === "date") return "OK";
  if (kind === "instant" && row.data_type === "timestamptz") return "OK";
  if (kind === "zonedDateTime") return "OK";
  return "OK";
}

function summarise(audit: AuditRow[]): { resolved: number; unresolved: number; not_temporal: number } {
  let resolved = 0;
  let unresolved = 0;
  let not_temporal = 0;
  for (const r of audit) {
    if (r.resolved_status === "resolved") resolved += 1;
    else if (r.resolved_status === "unresolved") unresolved += 1;
    else not_temporal += 1;
  }
  return { resolved, unresolved, not_temporal };
}

function formatSummary(c: { resolved: number; unresolved: number; not_temporal: number }): string {
  return `\nSummary: ${c.resolved} resolved, ${c.unresolved} unresolved, ${c.not_temporal} non-temporal.`;
}

function printCsv(rows: AuditRow[]): void {
  const headers = [
    "scope",
    "entity_version_id",
    "field_name",
    "data_type",
    "stored_temporal_kind",
    "stored_display_mode",
    "resolved_status",
    "resolved_kind",
    "resolved_source",
    "recommended_action",
  ] as const;
  console.log(headers.join(","));
  for (const row of rows) {
    console.log(headers.map((h) => csvEscape(row[h])).join(","));
  }
}

function csvEscape(value: string): string {
  if (value === "") return "";
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

main().catch((err) => {
  console.error("audit-temporal-fields failed:", err);
  process.exit(1);
});
