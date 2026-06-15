#!/usr/bin/env tsx
/**
 * PIL asset_treatment Verification (P3 pre-VALIDATE / CI gate)
 *
 * Runs after backfill-pil-asset-treatment.ts. Confirms that every PIL row has
 * a valid asset_treatment + asset_class_id + target_asset_id triplet so the
 * CHECK constraints can be VALIDATEd safely.
 *
 * Checks:
 *   1. asset_treatment NULL — any row still NULL after backfill (means
 *      backfill missed it; investigate).
 *   2. asset_treatment in valid enum (none/expense_low_value/class_pending/target_asset).
 *   3. asset_class_required — asset_treatment <> 'none' must have asset_class_id.
 *   4. asset_target_required — asset_treatment = 'target_asset' must have target_asset_id.
 *   5. orphan asset_class_id — points at a non-existent master.asset_class.
 *   6. orphan target_asset_id — points at a non-existent master.asset.
 *   7. class mismatch — target_asset.asset_class_id <> PIL.asset_class_id.
 *   8. company mismatch — target_asset.company_code_id <> PI.company_code_id.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx server/scripts/verify-asset-treatment-mapping.ts
 *   npx tsx server/scripts/verify-asset-treatment-mapping.ts --json
 *
 * Exit:
 *   0 — all checks pass; safe to ALTER COLUMN SET NOT NULL and VALIDATE constraints
 *   1 — violations found
 *
 * Spec: docs/specs/purchase_invoice_field_design.md §3.2
 */

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

const JSON_OUTPUT = process.argv.includes("--json");

interface Violation {
  rule:    string;
  pil_id:  string;
  detail:  string;
  payload?: Record<string, unknown>;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const violations: Violation[] = [];

  try {
    // ── 1. asset_treatment NULL ───────────────────────────────────────────────
    const nullTreatment = await pool.query<{ id: string }>(`
      SELECT id FROM document.purchase_invoice_line WHERE asset_treatment IS NULL LIMIT 100
    `);
    for (const r of nullTreatment.rows) {
      violations.push({
        rule:   "ASSET_TREATMENT_NULL_AFTER_BACKFILL",
        pil_id: r.id,
        detail: "Row still has NULL asset_treatment — re-run backfill",
      });
    }

    // ── 2. invalid enum ───────────────────────────────────────────────────────
    const invalidEnum = await pool.query<{ id: string; asset_treatment: string }>(`
      SELECT id, asset_treatment FROM document.purchase_invoice_line
       WHERE asset_treatment NOT IN ('none','expense_low_value','class_pending','target_asset')
         AND asset_treatment IS NOT NULL
       LIMIT 100
    `);
    for (const r of invalidEnum.rows) {
      violations.push({
        rule:    "ASSET_TREATMENT_INVALID_VALUE",
        pil_id:  r.id,
        detail:  "asset_treatment is not in the locked enum",
        payload: { asset_treatment: r.asset_treatment },
      });
    }

    // ── 3. asset_class_required ───────────────────────────────────────────────
    const classRequired = await pool.query<{ id: string; asset_treatment: string }>(`
      SELECT id, asset_treatment FROM document.purchase_invoice_line
       WHERE asset_treatment IS NOT NULL
         AND asset_treatment <> 'none'
         AND asset_class_id IS NULL
       LIMIT 200
    `);
    for (const r of classRequired.rows) {
      violations.push({
        rule:    "ASSET_CLASS_REQUIRED",
        pil_id:  r.id,
        detail:  "asset_treatment requires asset_class_id but it is NULL",
        payload: { asset_treatment: r.asset_treatment },
      });
    }

    // ── 4. asset_target_required ──────────────────────────────────────────────
    const targetRequired = await pool.query<{ id: string }>(`
      SELECT id FROM document.purchase_invoice_line
       WHERE asset_treatment = 'target_asset' AND target_asset_id IS NULL
       LIMIT 200
    `);
    for (const r of targetRequired.rows) {
      violations.push({
        rule:   "ASSET_TARGET_REQUIRED",
        pil_id: r.id,
        detail: "asset_treatment='target_asset' requires target_asset_id but it is NULL",
      });
    }

    // ── 5. orphan asset_class_id ──────────────────────────────────────────────
    const orphanClass = await pool.query<{ id: string; asset_class_id: string }>(`
      SELECT pil.id, pil.asset_class_id
        FROM document.purchase_invoice_line pil
   LEFT JOIN master.asset_class ac ON ac.id = pil.asset_class_id AND ac.tenant_id = pil.tenant_id
       WHERE pil.asset_class_id IS NOT NULL AND ac.id IS NULL
       LIMIT 200
    `);
    for (const r of orphanClass.rows) {
      violations.push({
        rule:    "ASSET_CLASS_ORPHAN",
        pil_id:  r.id,
        detail:  "PIL.asset_class_id does not resolve to a master.asset_class row",
        payload: { asset_class_id: r.asset_class_id },
      });
    }

    // ── 6. orphan target_asset_id ─────────────────────────────────────────────
    const orphanTarget = await pool.query<{ id: string; target_asset_id: string }>(`
      SELECT pil.id, pil.target_asset_id
        FROM document.purchase_invoice_line pil
   LEFT JOIN master.asset a ON a.id = pil.target_asset_id AND a.tenant_id = pil.tenant_id
       WHERE pil.target_asset_id IS NOT NULL AND a.id IS NULL
       LIMIT 200
    `);
    for (const r of orphanTarget.rows) {
      violations.push({
        rule:    "ASSET_TARGET_ORPHAN",
        pil_id:  r.id,
        detail:  "PIL.target_asset_id does not resolve to a master.asset row",
        payload: { target_asset_id: r.target_asset_id },
      });
    }

    // ── 7. class mismatch ─────────────────────────────────────────────────────
    const classMismatch = await pool.query<{
      id:                       string;
      pil_class_id:             string;
      target_class_id:          string;
    }>(`
      SELECT pil.id,
             pil.asset_class_id AS pil_class_id,
             a.asset_class_id   AS target_class_id
        FROM document.purchase_invoice_line pil
        JOIN master.asset a ON a.id = pil.target_asset_id AND a.tenant_id = pil.tenant_id
       WHERE pil.target_asset_id IS NOT NULL
         AND pil.asset_class_id IS NOT NULL
         AND pil.asset_class_id <> a.asset_class_id
       LIMIT 200
    `);
    for (const r of classMismatch.rows) {
      violations.push({
        rule:    "ASSET_TARGET_CLASS_MISMATCH",
        pil_id:  r.id,
        detail:  "PIL.asset_class_id differs from target_asset.asset_class_id",
        payload: { pil_class_id: r.pil_class_id, target_class_id: r.target_class_id },
      });
    }

    // ── 8. company mismatch ──────────────────────────────────────────────────
    const companyMismatch = await pool.query<{
      id:                  string;
      pi_company_code:     string;
      target_company_code: string;
    }>(`
      SELECT pil.id,
             pi.company_code_id  AS pi_company_code,
             a.company_code_id   AS target_company_code
        FROM document.purchase_invoice_line pil
        JOIN document.purchase_invoice pi ON pi.id = pil.purchase_invoice_id AND pi.tenant_id = pil.tenant_id
        JOIN master.asset           a  ON a.id = pil.target_asset_id        AND a.tenant_id  = pil.tenant_id
       WHERE pil.target_asset_id IS NOT NULL
         AND pi.company_code_id <> a.company_code_id
       LIMIT 200
    `);
    for (const r of companyMismatch.rows) {
      violations.push({
        rule:    "ASSET_TARGET_COMPANY_MISMATCH",
        pil_id:  r.id,
        detail:  "PI.company_code_id differs from target_asset.company_code_id",
        payload: { pi_company_code: r.pi_company_code, target_company_code: r.target_company_code },
      });
    }

    // ── Report ───────────────────────────────────────────────────────────────
    if (JSON_OUTPUT) {
      console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2));
    } else {
      console.log("=== PIL asset_treatment Verification ===");
      console.log(`Violations: ${violations.length}`);
      console.log();
      if (violations.length > 0) {
        console.log("--- Violations ---");
        for (const v of violations) {
          console.log(`  [${v.rule}] pil=${v.pil_id} :: ${v.detail}`);
          if (v.payload) console.log(`    ${JSON.stringify(v.payload)}`);
        }
        console.log();
        console.log("FAIL — fix violations before VALIDATE / SET NOT NULL.");
      } else {
        console.log("OK — safe to ALTER COLUMN asset_treatment SET NOT NULL and VALIDATE constraints.");
      }
    }

    process.exit(violations.length > 0 ? 1 : 0);
  } catch (err) {
    console.error("ERROR:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
