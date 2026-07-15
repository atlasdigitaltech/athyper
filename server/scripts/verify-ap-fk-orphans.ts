#!/usr/bin/env tsx
/**
 * AP FK Orphan Pre-Check (H1 gate)
 *
 * Runs BEFORE the operator validation script. For each of the 18 FK candidates
 * declared in:
 *   server/db/ddl/document/03b_constraints_ap_closure.sql   (initial set)
 *   server/db/ddl/document/03f_constraints_pea_pta_restrict.sql (HF2-2 reshape)
 * executes a LEFT JOIN to detect rows that point at non-existent parents.
 * Reports counts per FK + sample IDs.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx server/scripts/verify-ap-fk-orphans.ts
 *   npx tsx server/scripts/verify-ap-fk-orphans.ts --json
 *   npx tsx server/scripts/verify-ap-fk-orphans.ts --tenant <uuid>
 *
 * If this returns 0 violations, run the operator validation script:
 *   psql "$DATABASE_URL" -f server/db/scripts/run-ap-fk-validate.sql
 *
 * Exit:
 *   0 — all 18 FKs have zero orphans; safe to VALIDATE
 *   1 — orphans found; triage before VALIDATE
 *
 * Spec: AP Schema Hardening Plan §H1; Hardening Sprint H-Fix-2 §HF2-4
 */

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

const JSON_OUTPUT = process.argv.includes("--json");
const TENANT_ID = (() => {
  const i = process.argv.indexOf("--tenant");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

interface FkCandidate {
  constraint:   string;
  child_table:  string;
  child_cols:   { tenant: string; ref: string };
  parent_table: string;
  parent_cols:  { tenant: string; id: string };
  /** Whether the child ref column is nullable (orphans only flagged for NOT NULL). */
  child_nullable: boolean;
}

const FKS: FkCandidate[] = [
  // §1
  { constraint: "pil_invoice_fk",        child_table: "document.purchase_invoice_line",   child_cols: { tenant: "tenant_id", ref: "purchase_invoice_id" }, parent_table: "document.purchase_invoice", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: false },
  // §2 — Phase D.4 dropped the three identity FKs (ipsnap/iasnap/ibsnap)
  // along with the legacy tables. Only the tax snapshot FKs remain.
  { constraint: "itsnap_pi_fk",          child_table: "document.invoice_tax_snapshot",     child_cols: { tenant: "tenant_id", ref: "purchase_invoice_id" }, parent_table: "document.purchase_invoice", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: false },
  { constraint: "itsnap_pil_fk",         child_table: "document.invoice_tax_snapshot",     child_cols: { tenant: "tenant_id", ref: "invoice_line_id" },     parent_table: "document.purchase_invoice_line", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: true },
  // §3
  { constraint: "imc_invoice_fk",        child_table: "document.invoice_match_case",       child_cols: { tenant: "tenant_id", ref: "purchase_invoice_id" }, parent_table: "document.purchase_invoice", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: false },
  { constraint: "imx_case_fk",           child_table: "document.match_exception",          child_cols: { tenant: "tenant_id", ref: "invoice_match_case_id" }, parent_table: "document.invoice_match_case", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: false },
  { constraint: "imx_pil_fk",            child_table: "document.match_exception",          child_cols: { tenant: "tenant_id", ref: "invoice_line_id" },      parent_table: "document.purchase_invoice_line", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: false },
  // §4
  { constraint: "pta_invoice_fk",        child_table: "document.payment_term_application", child_cols: { tenant: "tenant_id", ref: "invoice_id" },          parent_table: "document.purchase_invoice", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: false },
  { constraint: "pta_invoice_line_fk",   child_table: "document.payment_term_application", child_cols: { tenant: "tenant_id", ref: "invoice_line_id" },     parent_table: "document.purchase_invoice_line", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: true },
  // §5
  { constraint: "pea_payment_fk",        child_table: "document.payment_entry_allocation", child_cols: { tenant: "tenant_id", ref: "payment_entry_id" },    parent_table: "document.payment_entry", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: false },
  { constraint: "pea_invoice_fk",        child_table: "document.payment_entry_allocation", child_cols: { tenant: "tenant_id", ref: "purchase_invoice_id" }, parent_table: "document.purchase_invoice", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: true },
  { constraint: "pea_pta_fk",            child_table: "document.payment_entry_allocation", child_cols: { tenant: "tenant_id", ref: "payment_term_application_id" }, parent_table: "document.payment_term_application", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: true },
  // §6
  { constraint: "prem_payment_fk",       child_table: "document.payment_remittance_output", child_cols: { tenant: "tenant_id", ref: "payment_entry_id" },   parent_table: "document.payment_entry", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: false },
  // §7
  { constraint: "ptdr_payment_fk",       child_table: "document.payment_term_discount_result", child_cols: { tenant: "tenant_id", ref: "payment_id" },       parent_table: "document.payment_entry", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: false },
  { constraint: "ptdr_invoice_fk",       child_table: "document.payment_term_discount_result", child_cols: { tenant: "tenant_id", ref: "invoice_id" },       parent_table: "document.purchase_invoice", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: false },
  // §8
  { constraint: "jl_je_fk",              child_table: "document.journal_line",             child_cols: { tenant: "tenant_id", ref: "journal_entry_id" },    parent_table: "document.journal_entry", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: false },
  { constraint: "jlr_jl_fk",             child_table: "document.journal_line_reference",   child_cols: { tenant: "tenant_id", ref: "journal_line_id" },     parent_table: "document.journal_line", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: false },
  // §9
  { constraint: "pe_bsl_fk",             child_table: "document.payment_entry",            child_cols: { tenant: "tenant_id", ref: "bank_statement_line_id" }, parent_table: "document.bank_statement_line", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: true },
  { constraint: "bsl_recon_case_fk",     child_table: "document.bank_statement_line",      child_cols: { tenant: "tenant_id", ref: "recon_case_id" },        parent_table: "document.bank_recon_case", parent_cols: { tenant: "tenant_id", id: "id" }, child_nullable: true },
];

interface OrphanReport {
  constraint:    string;
  orphan_count:  number;
  sample_ids:    string[];
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const reports: OrphanReport[] = [];
  let totalOrphans = 0;

  try {
    for (const fk of FKS) {
      const tenantFilter = TENANT_ID
        ? `AND c.${fk.child_cols.tenant} = '${TENANT_ID}'::uuid`
        : "";
      const nullableFilter = fk.child_nullable
        ? `AND c.${fk.child_cols.ref} IS NOT NULL`
        : "";

      const sampleCol = "id";
      const query = `
        SELECT c.${sampleCol}::text AS id
          FROM ${fk.child_table} c
     LEFT JOIN ${fk.parent_table} p
            ON p.${fk.parent_cols.tenant} = c.${fk.child_cols.tenant}
           AND p.${fk.parent_cols.id}     = c.${fk.child_cols.ref}
         WHERE c.${fk.child_cols.ref} IS NOT NULL
           AND p.${fk.parent_cols.id} IS NULL
           ${nullableFilter}
           ${tenantFilter}
         LIMIT 10
      `;
      const countQuery = `
        SELECT COUNT(*)::text AS n
          FROM ${fk.child_table} c
     LEFT JOIN ${fk.parent_table} p
            ON p.${fk.parent_cols.tenant} = c.${fk.child_cols.tenant}
           AND p.${fk.parent_cols.id}     = c.${fk.child_cols.ref}
         WHERE c.${fk.child_cols.ref} IS NOT NULL
           AND p.${fk.parent_cols.id} IS NULL
           ${tenantFilter}
      `;

      const samples = await pool.query<{ id: string }>(query);
      const countRow = await pool.query<{ n: string }>(countQuery);
      const n = parseInt(countRow.rows[0]?.n ?? "0", 10);

      if (n > 0) {
        reports.push({
          constraint:   fk.constraint,
          orphan_count: n,
          sample_ids:   samples.rows.map((r) => r.id),
        });
        totalOrphans += n;
      }
    }

    if (JSON_OUTPUT) {
      console.log(JSON.stringify({
        ok:                 totalOrphans === 0,
        total_orphans:      totalOrphans,
        constraints_dirty:  reports.length,
        constraints_total:  FKS.length,
        reports,
      }, null, 2));
    } else {
      console.log("=== AP FK Orphan Pre-Check ===");
      console.log(`Constraints checked:  ${FKS.length}`);
      console.log(`Constraints w/ orphans: ${reports.length}`);
      console.log(`Total orphan rows:    ${totalOrphans}`);
      console.log();
      if (reports.length > 0) {
        console.log("--- Reports ---");
        for (const r of reports) {
          console.log(`  [${r.constraint}] ${r.orphan_count} orphan(s)`);
          for (const id of r.sample_ids) console.log(`    sample: ${id}`);
        }
        console.log();
        console.log("FAIL — triage orphans before issuing 03c_constraints_ap_validate.sql");
      } else {
        console.log("OK — all 22 FKs are orphan-free. Safe to VALIDATE.");
      }
    }

    process.exit(totalOrphans > 0 ? 1 : 0);
  } catch (err) {
    console.error("ERROR:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
