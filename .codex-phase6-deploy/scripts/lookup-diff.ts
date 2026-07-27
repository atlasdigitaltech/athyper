#!/usr/bin/env tsx
/**
 * Lookup Migration Diff Audit — 45-04
 *
 * Connects to two PostgreSQL databases (F1 legacy + New) and compares
 * control.lookup_value platform rows (tenant_id IS NULL) by (domain_code, code).
 *
 * Outputs:
 *   lookup-diff-<timestamp>.json   — machine-readable full report
 *   lookup-diff-<timestamp>.md     — human-readable summary
 *
 * Usage:
 *   F1_DATABASE_URL=postgres://... NEW_DATABASE_URL=postgres://... \
 *     npx tsx server/scripts/lookup-diff.ts [--output-dir ./reports]
 *
 *   # or via package.json script:
 *   F1_DATABASE_URL=... NEW_DATABASE_URL=... \
 *     pnpm --filter @athyper/runtime-server lookup:diff
 *
 * Categories in the report:
 *   added_in_new     — (domain_code, code) present in New but not in F1
 *   missing_from_new — (domain_code, code) present in F1 but not in New
 *   changed          — present in both but name / sort_order / metadata / status differ
 *   critical         — subset of missing_from_new + changed where is_system=true
 *
 * Exit code:
 *   0 — diff completed (even if mismatches found; inspect the report)
 *   1 — configuration error or DB connection failure
 */

import fs from "node:fs";
import path from "node:path";
import postgres, { type Sql } from "postgres";

// ── Config ────────────────────────────────────────────────────────────────────

const F1_URL  = process.env["F1_DATABASE_URL"];
const NEW_URL = process.env["NEW_DATABASE_URL"] ?? process.env["DATABASE_URL"];

if (!F1_URL) {
  console.error("ERROR: F1_DATABASE_URL environment variable is required");
  process.exit(1);
}
if (!NEW_URL) {
  console.error("ERROR: NEW_DATABASE_URL (or DATABASE_URL) environment variable is required");
  process.exit(1);
}

const outputDir = (() => {
  const idx = process.argv.indexOf("--output-dir");
  return idx !== -1 && process.argv[idx + 1]
    ? process.argv[idx + 1]!
    : process.cwd();
})();

// ── Types ─────────────────────────────────────────────────────────────────────

interface LookupRow {
  domain_code:  string;
  code:         string;
  name:         string;
  sort_order:   number;
  metadata:     Record<string, unknown>;
  status:       string;
  is_system:    boolean;
}

interface ChangedField {
  field:      string;
  f1_value:   unknown;
  new_value:  unknown;
}

interface ChangedEntry {
  domain_code:  string;
  code:         string;
  is_system:    boolean;
  changes:      ChangedField[];
}

interface DiffReport {
  generated_at:     string;
  f1_db:            string;
  new_db:           string;
  summary: {
    f1_total:           number;
    new_total:          number;
    added_in_new:       number;
    missing_from_new:   number;
    changed:            number;
    critical_total:     number;
  };
  added_in_new:     LookupRow[];
  missing_from_new: LookupRow[];
  changed:          ChangedEntry[];
  critical: {
    missing_system_values:  LookupRow[];
    changed_system_values:  ChangedEntry[];
  };
}

// ── DB Queries ────────────────────────────────────────────────────────────────

async function fetchPlatformValues(sql: Sql): Promise<LookupRow[]> {
  const rows = await sql<LookupRow[]>`
    SELECT
      domain_code,
      code,
      name,
      sort_order::int  AS sort_order,
      COALESCE(metadata, '{}'::jsonb) AS metadata,
      status,
      is_system
    FROM control.lookup_value
    WHERE tenant_id IS NULL
    ORDER BY domain_code, code
  `;
  return rows;
}

// ── Comparison helpers ────────────────────────────────────────────────────────

/** Stable serialisation for metadata objects used in diff comparison */
function stableJson(v: unknown): string {
  if (v === null || v === undefined) return "{}";
  return JSON.stringify(
    v,
    (_, val) =>
      val !== null && typeof val === "object" && !Array.isArray(val)
        ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
        : val,
  );
}

function rowKey(row: LookupRow): string {
  return `${row.domain_code}::${row.code}`;
}

function diffRow(f1: LookupRow, nw: LookupRow): ChangedField[] {
  const diffs: ChangedField[] = [];

  if (f1.name !== nw.name) {
    diffs.push({ field: "name", f1_value: f1.name, new_value: nw.name });
  }
  if (f1.sort_order !== nw.sort_order) {
    diffs.push({ field: "sort_order", f1_value: f1.sort_order, new_value: nw.sort_order });
  }
  if (stableJson(f1.metadata) !== stableJson(nw.metadata)) {
    diffs.push({ field: "metadata", f1_value: f1.metadata, new_value: nw.metadata });
  }
  if (f1.status !== nw.status) {
    diffs.push({ field: "status", f1_value: f1.status, new_value: nw.status });
  }
  return diffs;
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderMarkdown(report: DiffReport): string {
  const lines: string[] = [];
  const { summary } = report;

  lines.push("# Lookup Migration Diff Report");
  lines.push(`**Generated:** ${report.generated_at}`);
  lines.push(`**F1 DB:** \`${redactUrl(report.f1_db)}\``);
  lines.push(`**New DB:** \`${redactUrl(report.new_db)}\``);
  lines.push("");

  // Summary table
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|---|---:|");
  lines.push(`| F1 platform values | ${summary.f1_total} |`);
  lines.push(`| New platform values | ${summary.new_total} |`);
  lines.push(`| Added in New (not in F1) | ${summary.added_in_new} |`);
  lines.push(`| **Missing from New** | **${summary.missing_from_new}** |`);
  lines.push(`| Changed (name/sort/metadata/status) | ${summary.changed} |`);
  lines.push(`| **Critical mismatches (is_system=true)** | **${summary.critical_total}** |`);
  lines.push("");

  if (summary.critical_total > 0) {
    lines.push("> **⚠ CRITICAL:** System lookup values are missing or changed. These may break enum validation, workflow routing, and FK references.");
    lines.push("");
  } else {
    lines.push("> ✅ No critical system-lookup mismatches.");
    lines.push("");
  }

  // Critical: missing system values
  if (report.critical.missing_system_values.length > 0) {
    lines.push("## Critical: System Values Missing from New");
    lines.push("");
    lines.push("| domain_code | code | name | sort_order | status |");
    lines.push("|---|---|---|---:|---|");
    for (const r of report.critical.missing_system_values) {
      lines.push(`| \`${r.domain_code}\` | \`${r.code}\` | ${r.name} | ${r.sort_order} | ${r.status} |`);
    }
    lines.push("");
  }

  // Critical: changed system values
  if (report.critical.changed_system_values.length > 0) {
    lines.push("## Critical: System Values Changed in New");
    lines.push("");
    for (const entry of report.critical.changed_system_values) {
      lines.push(`### \`${entry.domain_code} / ${entry.code}\``);
      lines.push("");
      lines.push("| Field | F1 value | New value |");
      lines.push("|---|---|---|");
      for (const c of entry.changes) {
        lines.push(`| ${c.field} | \`${JSON.stringify(c.f1_value)}\` | \`${JSON.stringify(c.new_value)}\` |`);
      }
      lines.push("");
    }
  }

  // Missing from New
  if (report.missing_from_new.length > 0) {
    lines.push("## Values Missing from New (all)");
    lines.push("");
    lines.push("| domain_code | code | name | is_system | status |");
    lines.push("|---|---|---|---|---|");
    for (const r of report.missing_from_new) {
      const flag = r.is_system ? "⚠ system" : "tenant-ext";
      lines.push(`| \`${r.domain_code}\` | \`${r.code}\` | ${r.name} | ${flag} | ${r.status} |`);
    }
    lines.push("");
  }

  // Added in New
  if (report.added_in_new.length > 0) {
    lines.push("## Values Added in New (not in F1)");
    lines.push("");
    lines.push("| domain_code | code | name | is_system | status |");
    lines.push("|---|---|---|---|---|");
    for (const r of report.added_in_new) {
      const flag = r.is_system ? "system" : "tenant-ext";
      lines.push(`| \`${r.domain_code}\` | \`${r.code}\` | ${r.name} | ${flag} | ${r.status} |`);
    }
    lines.push("");
  }

  // Changed (non-critical)
  const nonCriticalChanged = report.changed.filter((e) => !e.is_system);
  if (nonCriticalChanged.length > 0) {
    lines.push("## Changed Values (non-system)");
    lines.push("");
    for (const entry of nonCriticalChanged) {
      lines.push(`### \`${entry.domain_code} / ${entry.code}\``);
      lines.push("");
      lines.push("| Field | F1 value | New value |");
      lines.push("|---|---|---|");
      for (const c of entry.changes) {
        lines.push(`| ${c.field} | \`${JSON.stringify(c.f1_value)}\` | \`${JSON.stringify(c.new_value)}\` |`);
      }
      lines.push("");
    }
  }

  if (summary.missing_from_new === 0 && summary.changed === 0 && summary.added_in_new === 0) {
    lines.push("## Result");
    lines.push("");
    lines.push("✅ **Clean match.** F1 and New platform lookup values are identical.");
    lines.push("");
  }

  lines.push("---");
  lines.push("_Generated by `server/scripts/lookup-diff.ts`_");
  lines.push("");

  return lines.join("\n");
}

/** Redact credentials from connection string for safe logging */
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    u.password = "***";
    return u.toString();
  } catch {
    return url.replace(/:([^/@]+)@/, ":***@");
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Lookup Migration Diff Audit");
  console.log("───────────────────────────────────────────────────────────────");
  console.log(`F1 DB : ${redactUrl(F1_URL!)}`);
  console.log(`New DB: ${redactUrl(NEW_URL!)}`);
  console.log("");

  let f1Sql: Sql | null = null;
  let newSql: Sql | null = null;

  try {
    f1Sql  = postgres(F1_URL!,  { max: 2, idle_timeout: 10, connect_timeout: 10, onnotice: () => {} });
    newSql = postgres(NEW_URL!, { max: 2, idle_timeout: 10, connect_timeout: 10, onnotice: () => {} });

    console.log("Fetching F1 platform lookup values…");
    const f1Rows = await fetchPlatformValues(f1Sql);
    console.log(`  → ${f1Rows.length} rows`);

    console.log("Fetching New platform lookup values…");
    const newRows = await fetchPlatformValues(newSql);
    console.log(`  → ${newRows.length} rows`);

    // Build maps
    const f1Map  = new Map<string, LookupRow>(f1Rows.map((r) => [rowKey(r), r]));
    const newMap = new Map<string, LookupRow>(newRows.map((r) => [rowKey(r), r]));

    // Compute diff
    const addedInNew:     LookupRow[]     = [];
    const missingFromNew: LookupRow[]     = [];
    const changed:        ChangedEntry[]  = [];

    // Present in New but not F1
    for (const [key, row] of newMap) {
      if (!f1Map.has(key)) {
        addedInNew.push(row);
      }
    }

    // Present in F1 — check for missing or changed
    for (const [key, f1Row] of f1Map) {
      const newRow = newMap.get(key);
      if (!newRow) {
        missingFromNew.push(f1Row);
      } else {
        const diffs = diffRow(f1Row, newRow);
        if (diffs.length > 0) {
          changed.push({
            domain_code: f1Row.domain_code,
            code:        f1Row.code,
            is_system:   f1Row.is_system,
            changes:     diffs,
          });
        }
      }
    }

    // Sort for stable output
    addedInNew.sort((a, b) => a.domain_code.localeCompare(b.domain_code) || a.code.localeCompare(b.code));
    missingFromNew.sort((a, b) => a.domain_code.localeCompare(b.domain_code) || a.code.localeCompare(b.code));
    changed.sort((a, b) => a.domain_code.localeCompare(b.domain_code) || a.code.localeCompare(b.code));

    // Critical subset
    const missingSystemValues = missingFromNew.filter((r) => r.is_system);
    const changedSystemValues  = changed.filter((e) => e.is_system);

    const report: DiffReport = {
      generated_at: new Date().toISOString(),
      f1_db:        redactUrl(F1_URL!),
      new_db:       redactUrl(NEW_URL!),
      summary: {
        f1_total:         f1Rows.length,
        new_total:        newRows.length,
        added_in_new:     addedInNew.length,
        missing_from_new: missingFromNew.length,
        changed:          changed.length,
        critical_total:   missingSystemValues.length + changedSystemValues.length,
      },
      added_in_new:     addedInNew,
      missing_from_new: missingFromNew,
      changed,
      critical: {
        missing_system_values: missingSystemValues,
        changed_system_values:  changedSystemValues,
      },
    };

    // Console summary
    console.log("");
    console.log("Diff summary:");
    console.log(`  Added in New (not in F1) : ${addedInNew.length}`);
    console.log(`  Missing from New         : ${missingFromNew.length}`);
    console.log(`  Changed                  : ${changed.length}`);
    console.log(`  Critical mismatches      : ${report.summary.critical_total}`);

    if (report.summary.critical_total > 0) {
      console.log("");
      console.warn("⚠  CRITICAL mismatches detected:");
      if (missingSystemValues.length > 0) {
        console.warn(`   Missing system values (${missingSystemValues.length}):`);
        for (const r of missingSystemValues) {
          console.warn(`     ${r.domain_code} / ${r.code}  ("${r.name}")`);
        }
      }
      if (changedSystemValues.length > 0) {
        console.warn(`   Changed system values (${changedSystemValues.length}):`);
        for (const e of changedSystemValues) {
          const fieldNames = e.changes.map((c) => c.field).join(", ");
          console.warn(`     ${e.domain_code} / ${e.code}  [${fieldNames}]`);
        }
      }
    }

    // Write output files
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const jsonFile = path.join(outputDir, `lookup-diff-${ts}.json`);
    const mdFile   = path.join(outputDir, `lookup-diff-${ts}.md`);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf-8");
    fs.writeFileSync(mdFile, renderMarkdown(report), "utf-8");

    console.log("");
    console.log(`Reports written:`);
    console.log(`  JSON : ${jsonFile}`);
    console.log(`  MD   : ${mdFile}`);
    console.log("");

    if (report.summary.critical_total > 0) {
      console.error("Exit 1: critical mismatches require attention before go-live.");
      process.exit(1);
    }
    process.exit(0);

  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  } finally {
    await f1Sql?.end();
    await newSql?.end();
  }
}

void main();
