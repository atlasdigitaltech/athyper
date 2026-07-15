#!/usr/bin/env tsx
/**
 * P2P FK Preflight (Plan 0 gate)
 *
 * Read-only checker for the FK coverage roll-out in Plan 1 of the P2P plan.
 * For every (child_table.child_col → parent_table.parent_col) pair declared
 * in FK_MATRIX below, reports:
 *
 *   - status  PRESENT|MISSING    — does pg_constraint already enforce it?
 *   - orphans count + sample ids — how many child rows point at a non-
 *                                  existent parent (would block ADD CONSTRAINT)
 *
 * Run BEFORE editing document/03_constraints.sql. Two checkpoint modes for
 * unambiguous rollout gating:
 *
 *   default (no mode flag) — informational; exits 0 unless MISSING FKs have
 *                            orphans. Use during incremental rollout when
 *                            some FKs are intentionally not yet present.
 *
 *   --guard                — orphan check only. Exits non-zero if any
 *                            MISSING FK has orphans, regardless of coverage.
 *                            Use as a PR gate while batches are still landing.
 *
 *   --enforce              — coverage + orphans. Exits non-zero if ANY
 *                            planned FK is MISSING or has orphans. Use after
 *                            the final batch ships to assert full coverage.
 *
 *   --allow-orphans        — bypass the orphan gate (e.g. when running with
 *                            app.rebuild_force=true and a quarantine table).
 *
 * Usage:
 *   DATABASE_URL=... npx tsx server/scripts/p2p-fk-preflight.ts
 *   npx tsx server/scripts/p2p-fk-preflight.ts --guard
 *   npx tsx server/scripts/p2p-fk-preflight.ts --enforce
 *   npx tsx server/scripts/p2p-fk-preflight.ts --json
 *   npx tsx server/scripts/p2p-fk-preflight.ts --allow-orphans
 *   npx tsx server/scripts/p2p-fk-preflight.ts --filter receipt
 *
 * Exit:
 *   0 — gate satisfied for the chosen mode
 *   1 — gate violated (orphans in --guard; orphans or coverage in --enforce)
 *   2 — runtime error (DB connect, SQL fault)
 *
 * Spec: P2P plan §Plan 0 (preflight) / Plan 1 (FK rollout matrix)
 */

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

const JSON_OUTPUT   = process.argv.includes("--json");
const ALLOW_ORPHANS = process.argv.includes("--allow-orphans");
const MODE_GUARD    = process.argv.includes("--guard");
const MODE_ENFORCE  = process.argv.includes("--enforce");
if (MODE_GUARD && MODE_ENFORCE) {
  // eslint-disable-next-line no-console
  console.error("ERROR: --guard and --enforce are mutually exclusive");
  process.exit(2);
}
const FILTER = (() => {
  const i = process.argv.indexOf("--filter");
  return i >= 0 ? (process.argv[i + 1] ?? "") : "";
})();

type OnDelete = "CASCADE" | "RESTRICT" | "SET NULL";

interface FkPlanRow {
  /** Stable name to attach in the eventual ADD CONSTRAINT. */
  constraint:    string;
  /** Grouping bucket for the report. */
  group:         "parent_to_line" | "upstream_chain" | "version_chain";
  child_table:   string;
  child_col:     string;
  parent_table:  string;
  parent_col:    string;
  on_delete:     OnDelete;
  /** When true: NULL is a legal value; orphan check skips NULL rows. */
  child_nullable: boolean;
}

/**
 * Locked FK matrix from the final P2P plan (Plan 1 §A / §B / §C).
 * Column existence verified against live DB on 2026-06-20.
 *
 * Notes on what the live schema does and does not have:
 *   - POC line uses confirmation_id (NOT purchase_order_confirmation_id)
 *   - delivery_note has commitment_id but NO purchase_order_confirmation_id
 *     (DN bypasses POC today; if added later, append a dn_poc_fk row)
 *   - reversal_of_id exists on receipt, service_sheet, purchase_invoice,
 *     journal_entry — use that for the reversal-chain self-FK
 *   - reversed_by_id exists only on journal_entry
 */
const FK_MATRIX: FkPlanRow[] = [
  // ── §A. Parent header → line (CASCADE) ──────────────────────────────────
  { constraint: "cl_commitment_fk",            group: "parent_to_line", child_table: "document.commitment_line",                  child_col: "commitment_id",                  parent_table: "document.commitment",                  parent_col: "id", on_delete: "CASCADE", child_nullable: false },
  { constraint: "cp_commitment_fk",            group: "parent_to_line", child_table: "document.commitment_procurement",           child_col: "commitment_id",                  parent_table: "document.commitment",                  parent_col: "id", on_delete: "CASCADE", child_nullable: false },
  { constraint: "prl_pr_fk",                   group: "parent_to_line", child_table: "document.purchase_requisition_line",        child_col: "purchase_requisition_id",        parent_table: "document.purchase_requisition",        parent_col: "id", on_delete: "CASCADE", child_nullable: false },
  { constraint: "pocl_poc_fk",                 group: "parent_to_line", child_table: "document.purchase_order_confirmation_line", child_col: "confirmation_id",                parent_table: "document.purchase_order_confirmation", parent_col: "id", on_delete: "CASCADE", child_nullable: false },
  { constraint: "dnl_dn_fk",                   group: "parent_to_line", child_table: "document.delivery_note_line",               child_col: "delivery_note_id",               parent_table: "document.delivery_note",               parent_col: "id", on_delete: "CASCADE", child_nullable: false },
  { constraint: "rcpl_receipt_fk",             group: "parent_to_line", child_table: "document.receipt_line",                     child_col: "receipt_id",                     parent_table: "document.receipt",                     parent_col: "id", on_delete: "CASCADE", child_nullable: false },
  { constraint: "sshl_ssh_fk",                 group: "parent_to_line", child_table: "document.service_sheet_line",               child_col: "service_sheet_id",               parent_table: "document.service_sheet",               parent_col: "id", on_delete: "CASCADE", child_nullable: false },

  // ── §B. Upstream chain (RESTRICT) ───────────────────────────────────────
  { constraint: "cp_requisition_fk",           group: "upstream_chain", child_table: "document.commitment_procurement",           child_col: "requisition_id",                 parent_table: "document.purchase_requisition",        parent_col: "id", on_delete: "RESTRICT", child_nullable: true  },
  { constraint: "cl_requisition_line_fk",      group: "upstream_chain", child_table: "document.commitment_line",                  child_col: "requisition_line_id",            parent_table: "document.purchase_requisition_line",   parent_col: "id", on_delete: "RESTRICT", child_nullable: true  },
  { constraint: "poc_commitment_fk",           group: "upstream_chain", child_table: "document.purchase_order_confirmation",      child_col: "commitment_id",                  parent_table: "document.commitment",                  parent_col: "id", on_delete: "RESTRICT", child_nullable: false },
  { constraint: "pocl_commitment_line_fk",     group: "upstream_chain", child_table: "document.purchase_order_confirmation_line", child_col: "commitment_line_id",             parent_table: "document.commitment_line",             parent_col: "id", on_delete: "RESTRICT", child_nullable: true  },
  { constraint: "dn_commitment_fk",            group: "upstream_chain", child_table: "document.delivery_note",                    child_col: "commitment_id",                  parent_table: "document.commitment",                  parent_col: "id", on_delete: "RESTRICT", child_nullable: false },
  { constraint: "dnl_commitment_line_fk",      group: "upstream_chain", child_table: "document.delivery_note_line",               child_col: "commitment_line_id",             parent_table: "document.commitment_line",             parent_col: "id", on_delete: "RESTRICT", child_nullable: true  },
  { constraint: "rcp_commitment_fk",           group: "upstream_chain", child_table: "document.receipt",                          child_col: "commitment_id",                  parent_table: "document.commitment",                  parent_col: "id", on_delete: "RESTRICT", child_nullable: false },
  { constraint: "rcp_delivery_note_fk",        group: "upstream_chain", child_table: "document.receipt",                          child_col: "delivery_note_id",               parent_table: "document.delivery_note",               parent_col: "id", on_delete: "RESTRICT", child_nullable: true  },
  { constraint: "rcpl_commitment_line_fk",     group: "upstream_chain", child_table: "document.receipt_line",                     child_col: "commitment_line_id",             parent_table: "document.commitment_line",             parent_col: "id", on_delete: "RESTRICT", child_nullable: true  },
  { constraint: "rcpl_delivery_note_line_fk",  group: "upstream_chain", child_table: "document.receipt_line",                     child_col: "delivery_note_line_id",          parent_table: "document.delivery_note_line",          parent_col: "id", on_delete: "RESTRICT", child_nullable: true  },
  { constraint: "ssh_commitment_fk",           group: "upstream_chain", child_table: "document.service_sheet",                    child_col: "commitment_id",                  parent_table: "document.commitment",                  parent_col: "id", on_delete: "RESTRICT", child_nullable: false },
  { constraint: "sshl_commitment_line_fk",     group: "upstream_chain", child_table: "document.service_sheet_line",               child_col: "commitment_line_id",             parent_table: "document.commitment_line",             parent_col: "id", on_delete: "RESTRICT", child_nullable: true  },
  { constraint: "pi_commitment_fk",            group: "upstream_chain", child_table: "document.purchase_invoice",                 child_col: "commitment_id",                  parent_table: "document.commitment",                  parent_col: "id", on_delete: "RESTRICT", child_nullable: true  },
  { constraint: "pil_commitment_line_fk",      group: "upstream_chain", child_table: "document.purchase_invoice_line",            child_col: "commitment_line_id",             parent_table: "document.commitment_line",             parent_col: "id", on_delete: "RESTRICT", child_nullable: true  },
  { constraint: "pil_receipt_line_fk",         group: "upstream_chain", child_table: "document.purchase_invoice_line",            child_col: "receipt_line_id",                parent_table: "document.receipt_line",                parent_col: "id", on_delete: "RESTRICT", child_nullable: true  },
  { constraint: "pil_service_sheet_line_fk",   group: "upstream_chain", child_table: "document.purchase_invoice_line",            child_col: "service_sheet_line_id",          parent_table: "document.service_sheet_line",          parent_col: "id", on_delete: "RESTRICT", child_nullable: true  },

  // ── §C. Version + reversal self-FKs (SET NULL for version, RESTRICT for reversal) ──
  { constraint: "pr_previous_version_fk",      group: "version_chain",  child_table: "document.purchase_requisition",             child_col: "previous_version_id",            parent_table: "document.purchase_requisition",        parent_col: "id", on_delete: "SET NULL", child_nullable: true },
  { constraint: "cmt_previous_version_fk",     group: "version_chain",  child_table: "document.commitment",                       child_col: "previous_version_id",            parent_table: "document.commitment",                  parent_col: "id", on_delete: "SET NULL", child_nullable: true },
  { constraint: "poc_previous_version_fk",     group: "version_chain",  child_table: "document.purchase_order_confirmation",      child_col: "previous_version_id",            parent_table: "document.purchase_order_confirmation", parent_col: "id", on_delete: "SET NULL", child_nullable: true },
  { constraint: "dn_previous_version_fk",      group: "version_chain",  child_table: "document.delivery_note",                    child_col: "previous_version_id",            parent_table: "document.delivery_note",               parent_col: "id", on_delete: "SET NULL", child_nullable: true },
  { constraint: "rcp_previous_version_fk",     group: "version_chain",  child_table: "document.receipt",                          child_col: "previous_version_id",            parent_table: "document.receipt",                     parent_col: "id", on_delete: "SET NULL", child_nullable: true },
  { constraint: "ssh_previous_version_fk",     group: "version_chain",  child_table: "document.service_sheet",                    child_col: "previous_version_id",            parent_table: "document.service_sheet",               parent_col: "id", on_delete: "SET NULL", child_nullable: true },
  { constraint: "pi_previous_version_fk",      group: "version_chain",  child_table: "document.purchase_invoice",                 child_col: "previous_version_id",            parent_table: "document.purchase_invoice",            parent_col: "id", on_delete: "SET NULL", child_nullable: true },
  { constraint: "cmt_renewed_from_fk",         group: "version_chain",  child_table: "document.commitment",                       child_col: "renewed_from_id",                parent_table: "document.commitment",                  parent_col: "id", on_delete: "SET NULL", child_nullable: true },
  { constraint: "rcp_reversal_of_fk",          group: "version_chain",  child_table: "document.receipt",                          child_col: "reversal_of_id",                 parent_table: "document.receipt",                     parent_col: "id", on_delete: "RESTRICT", child_nullable: true },
  { constraint: "ssh_reversal_of_fk",          group: "version_chain",  child_table: "document.service_sheet",                    child_col: "reversal_of_id",                 parent_table: "document.service_sheet",               parent_col: "id", on_delete: "RESTRICT", child_nullable: true },
  { constraint: "pi_reversal_of_fk",           group: "version_chain",  child_table: "document.purchase_invoice",                 child_col: "reversal_of_id",                 parent_table: "document.purchase_invoice",            parent_col: "id", on_delete: "RESTRICT", child_nullable: true },
  { constraint: "je_reversal_of_fk",           group: "version_chain",  child_table: "document.journal_entry",                    child_col: "reversal_of_id",                 parent_table: "document.journal_entry",               parent_col: "id", on_delete: "RESTRICT", child_nullable: true },
  { constraint: "je_reversed_by_fk",           group: "version_chain",  child_table: "document.journal_entry",                    child_col: "reversed_by_id",                 parent_table: "document.journal_entry",               parent_col: "id", on_delete: "RESTRICT", child_nullable: true },
];

interface FkReport {
  constraint: string;
  group:      FkPlanRow["group"];
  pair:       string;
  status:     "PRESENT" | "MISSING";
  orphans:    number;
  sample_ids: string[];
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function constraintExists(fk: FkPlanRow): Promise<boolean> {
  const [childSchema, childTable] = fk.child_table.split(".");
  const result = await pool.query<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
        FROM pg_constraint c
        JOIN pg_class      r ON r.oid = c.conrelid
        JOIN pg_namespace  n ON n.oid = r.relnamespace
        JOIN pg_attribute  a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
       WHERE c.contype = 'f'
         AND n.nspname = $1
         AND r.relname = $2
         AND a.attname = $3
    ) AS exists
    `,
    [childSchema, childTable, fk.child_col],
  );
  return result.rows[0]?.exists ?? false;
}

async function countOrphans(fk: FkPlanRow): Promise<{ count: number; samples: string[] }> {
  const nullClause = fk.child_nullable ? `AND c.${fk.child_col} IS NOT NULL` : "";
  const result = await pool.query<{ id: string }>(
    `
    SELECT c.id::text AS id
      FROM ${fk.child_table} c
      LEFT JOIN ${fk.parent_table} p
        ON p.${fk.parent_col} = c.${fk.child_col}
       AND p.tenant_id        = c.tenant_id
     WHERE p.${fk.parent_col} IS NULL
       ${nullClause}
     LIMIT 5
    `,
  );
  const samples = result.rows.map((r) => r.id);

  const countResult = await pool.query<{ count: string }>(
    `
    SELECT count(*)::text AS count
      FROM ${fk.child_table} c
      LEFT JOIN ${fk.parent_table} p
        ON p.${fk.parent_col} = c.${fk.child_col}
       AND p.tenant_id        = c.tenant_id
     WHERE p.${fk.parent_col} IS NULL
       ${nullClause}
    `,
  );
  return { count: Number(countResult.rows[0]?.count ?? 0), samples };
}

async function main(): Promise<void> {
  const planned = FILTER
    ? FK_MATRIX.filter((fk) =>
        fk.constraint.includes(FILTER)
        || fk.child_table.includes(FILTER)
        || fk.parent_table.includes(FILTER))
    : FK_MATRIX;

  const reports: FkReport[] = [];
  for (const fk of planned) {
    const present = await constraintExists(fk);
    const pair    = `${fk.child_table}.${fk.child_col} → ${fk.parent_table}.${fk.parent_col}`;
    if (present) {
      reports.push({
        constraint: fk.constraint,
        group:      fk.group,
        pair,
        status:     "PRESENT",
        orphans:    0,
        sample_ids: [],
      });
      continue;
    }
    const { count, samples } = await countOrphans(fk);
    reports.push({
      constraint: fk.constraint,
      group:      fk.group,
      pair,
      status:     "MISSING",
      orphans:    count,
      sample_ids: samples,
    });
  }

  await pool.end();

  if (JSON_OUTPUT) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ reports }, null, 2));
  } else {
    printReport(reports);
  }

  const blockingOrphans = reports.filter((r) => r.status === "MISSING" && r.orphans > 0);
  const missingCount    = reports.filter((r) => r.status === "MISSING").length;

  // --guard (or default): orphan-only gate
  if (blockingOrphans.length > 0 && !ALLOW_ORPHANS) {
    // eslint-disable-next-line no-console
    console.error(
      `\nFAIL: ${blockingOrphans.length} planned FK(s) have orphan rows. ` +
      `Resolve the orphans first or re-run with --allow-orphans.`,
    );
    process.exit(1);
  }

  // --enforce: also require full coverage
  if (MODE_ENFORCE && missingCount > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `\nFAIL (--enforce): ${missingCount} planned FK(s) are still MISSING. ` +
      `Coverage gate not satisfied.`,
    );
    process.exit(1);
  }

  process.exit(0);
}

function printReport(reports: FkReport[]): void {
  const buckets: Array<[FkPlanRow["group"], string]> = [
    ["parent_to_line", "Parent → line (CASCADE)"],
    ["upstream_chain", "Upstream chain (RESTRICT)"],
    ["version_chain",  "Version chain (SET NULL / RESTRICT)"],
  ];

  for (const [groupKey, heading] of buckets) {
    const subset = reports.filter((r) => r.group === groupKey);
    if (subset.length === 0) continue;
    // eslint-disable-next-line no-console
    console.log(`\n## ${heading}\n`);
    // eslint-disable-next-line no-console
    console.log("| Constraint | Status | Orphans | Pair |");
    // eslint-disable-next-line no-console
    console.log("|---|---|---:|---|");
    for (const r of subset) {
      const orphans = r.status === "PRESENT" ? "—" : String(r.orphans);
      // eslint-disable-next-line no-console
      console.log(`| ${r.constraint} | ${r.status} | ${orphans} | \`${r.pair}\` |`);
    }
    const blockers = subset.filter((r) => r.status === "MISSING" && r.orphans > 0);
    if (blockers.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`\n*Sample orphan ids (first 5):*`);
      for (const b of blockers) {
        // eslint-disable-next-line no-console
        console.log(`  - ${b.constraint}: ${b.sample_ids.join(", ")}`);
      }
    }
  }

  const totalMissing = reports.filter((r) => r.status === "MISSING").length;
  const totalOrphans = reports.reduce((acc, r) => acc + r.orphans, 0);
  // eslint-disable-next-line no-console
  console.log(
    `\nSummary: ${reports.length} planned, ${reports.length - totalMissing} present, ` +
    `${totalMissing} missing, ${totalOrphans} orphan rows total.`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("ERROR:", err);
  pool.end().catch(() => undefined);
  process.exit(2);
});
