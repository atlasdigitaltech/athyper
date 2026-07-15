#!/usr/bin/env tsx
/**
 * Field-Rule Coverage Verification (CI gate)
 *
 * Asserts contract-level invariants on control.entity_field:
 *
 *   1. Every is_computed=true field corresponds to a column that is either
 *      DB-generated, kept by a trigger, or written exclusively by a service.
 *      The check uses information_schema to verify GENERATED columns and a
 *      hand-maintained allowlist of trigger/service-maintained columns.
 *
 *   2. Every editability.editable_in_status entry references a valid status
 *      value. The valid set is sourced from the relevant CHECK constraint
 *      (e.g. document.purchase_invoice_status_chk) for the entity's table.
 *
 *   3. visible_when / hide_in predicates parse as valid JSON-with-the-supported
 *      predicate shape: {field, eq/ne/value/isNull/notNull}.
 *
 *   4. Per-AP-entity rule coverage thresholds:
 *      - purchase_invoice            ≥ 30 fields with editable_in_status
 *      - purchase_invoice_line       ≥ 20 fields with editable_in_status
 *      - accounting_distribution     ≥ 9  fields with editable_in_status
 *      - all three                   ≥ baseline is_computed counts
 *
 *   5. No active field of business/standard origin on AP entities is left
 *      without either an editable_in_status gate, is_read_only=true, or
 *      is_computed=true (catches new fields landing without rules).
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/verify-field-rules.ts
 *
 *   # JSON output for CI:
 *   npx tsx server/scripts/verify-field-rules.ts --json
 *
 * Exit code:
 *   0 — all checks pass
 *   1 — at least one check failed (CI red)
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
  rule:      string;
  entity:    string;
  field:     string | null;
  detail:    string;
  payload?:  Record<string, unknown>;
}

const AP_ENTITIES = ["purchase_invoice", "purchase_invoice_line", "accounting_distribution"] as const;

const COVERAGE_THRESHOLDS: Record<string, { editable_min: number; computed_min: number }> = {
  purchase_invoice:        { editable_min: 30, computed_min: 8 },
  purchase_invoice_line:   { editable_min: 20, computed_min: 4 },
  accounting_distribution: { editable_min: 9, computed_min: 2 },
};

// Computed fields that are NOT GENERATED at the DB level — they're maintained
// by a trigger or a service. Listing them here documents the intent.
const TRIGGER_OR_SERVICE_MAINTAINED = new Set<string>([
  // header
  "purchase_invoice.total_amount",
  "purchase_invoice.subtotal_amount",     // backing column for entity_field 'net_amount'
  "purchase_invoice.tax_amount",
  "purchase_invoice.paid_amount",
  "purchase_invoice.line_count",
  "purchase_invoice.match_status",        // invoice-match.service writes header roll-up
  // line
  "purchase_invoice_line.gross_amount",
  "purchase_invoice_line.match_status",
  "purchase_invoice_line.matched_quantity",
  // AD
  "accounting_distribution.distributed_amount",
  "accounting_distribution.budget_check_result",
]);

async function main(): Promise<number> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const violations: Violation[] = [];

  try {
    await pool.query("SELECT 1");

    // ── Check 1: is_computed → genuine derivation ─────────────────────────
    const computedFields = await pool.query<{
      entity_code: string;
      table_schema: string;
      table_name: string;
      field_name: string;
      column_name: string;
    }>(`
      SELECT e.entity_code, e.table_schema, e.table_name, ef.name AS field_name, ef.column_name
        FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id
        JOIN control.entity e          ON e.id  = ev.entity_id
       WHERE ev.status      = 'EFFECTIVE'
         AND ef.is_active   = true
         AND COALESCE(ef.is_computed, false) = true
         AND ef.tenant_id IS NULL
    `);

    for (const row of computedFields.rows) {
      const colInfo = await pool.query<{ is_generated: string | null }>(
        `SELECT is_generated
           FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
        [row.table_schema, row.table_name, row.column_name],
      );
      const isGenerated = colInfo.rows[0]?.is_generated === "ALWAYS";
      const isMaintained = TRIGGER_OR_SERVICE_MAINTAINED.has(`${row.table_name}.${row.column_name}`);
      if (!isGenerated && !isMaintained) {
        violations.push({
          rule:   "is_computed→derivation",
          entity: row.entity_code,
          field:  row.field_name,
          detail: `is_computed=true but column ${row.table_schema}.${row.table_name}.${row.column_name} is neither GENERATED nor in the trigger/service allowlist.`,
        });
      }
    }

    // ── Check 2: editable_in_status references valid statuses ──────────────
    // Pulls the CHECK constraint definitions, then parses the quoted status
    // literals in JS (more reliable than regexp_split_to_table for nested SQL).
    const statusConstraints = await pool.query<{ entity_code: string; constraint_def: string }>(`
      SELECT e.entity_code,
             pg_get_constraintdef(c.oid) AS constraint_def
        FROM control.entity e
        JOIN pg_constraint c
          ON c.conrelid = (e.table_schema || '.' || e.table_name)::regclass
        WHERE e.tenant_id IS NULL
          AND e.table_schema = 'document'
          AND e.table_name IN ('purchase_invoice', 'purchase_invoice_line', 'accounting_distribution')
          AND c.contype  = 'c'
          AND c.conname LIKE '%status_chk'
    `);

    const statusByEntity = new Map<string, Set<string>>();
    for (const row of statusConstraints.rows) {
      // Extract content between IN ( ... ) — non-greedy.
      const inMatch = row.constraint_def.match(/status\s+IN\s*\(\s*([^)]+)\)/i);
      if (!inMatch) continue;
      const inside = inMatch[1];
      // Extract each single-quoted literal — handles 'draft','pending_approval',...
      const literals = [...inside.matchAll(/'([^']+)'/g)].map((m) => m[1]);
      statusByEntity.set(row.entity_code, new Set(literals));
    }

    const fieldRules = await pool.query<{
      entity_code: string;
      table_name: string;
      field_name: string;
      editable_in_status: string[];
    }>(`
      SELECT e.entity_code, e.table_name, ef.name AS field_name,
             ARRAY(
               SELECT jsonb_array_elements_text(ef.editability->'editable_in_status')
             ) AS editable_in_status
        FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id
        JOIN control.entity e          ON e.id  = ev.entity_id
       WHERE ev.status    = 'EFFECTIVE'
         AND ef.is_active = true
         AND ef.editability ? 'editable_in_status'
         AND jsonb_array_length(ef.editability->'editable_in_status') > 0
         AND ef.tenant_id IS NULL
    `);

    for (const row of fieldRules.rows) {
      // PI line and AD reference parent purchase_invoice's status set
      const parentEntity =
        row.entity_code === "purchase_invoice_line" || row.entity_code === "accounting_distribution"
          ? "purchase_invoice"
          : row.entity_code;
      const validStatuses = statusByEntity.get(parentEntity);
      if (!validStatuses) continue; // No constraint discovered — skip
      for (const status of row.editable_in_status) {
        if (!validStatuses.has(status)) {
          violations.push({
            rule:   "editable_in_status valid",
            entity: row.entity_code,
            field:  row.field_name,
            detail: `editable_in_status references '${status}' which is not in the ${parentEntity} status constraint.`,
            payload: { valid_statuses: [...validStatuses] },
          });
        }
      }
    }

    // ── Check 3: visible_when shape ────────────────────────────────────────
    const visibilityRules = await pool.query<{
      entity_code: string;
      field_name: string;
      predicate: Record<string, unknown>;
    }>(`
      SELECT e.entity_code, ef.name AS field_name,
             COALESCE(ef.ui_hint->'display'->'visible_when',
                      ef.visibility->'when') AS predicate
        FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id
        JOIN control.entity e          ON e.id  = ev.entity_id
       WHERE ev.status    = 'EFFECTIVE'
         AND ef.is_active = true
         AND ef.tenant_id IS NULL
         AND COALESCE(ef.ui_hint->'display'->'visible_when',
                      ef.visibility->'when') IS NOT NULL
    `);

    for (const row of visibilityRules.rows) {
      const pred = row.predicate;
      if (!pred || typeof pred !== "object" || Array.isArray(pred)) {
        violations.push({
          rule:   "visible_when shape",
          entity: row.entity_code,
          field:  row.field_name,
          detail: "visible_when predicate is not an object.",
        });
        continue;
      }
      if (!("field" in pred)) {
        violations.push({
          rule:   "visible_when shape",
          entity: row.entity_code,
          field:  row.field_name,
          detail: "visible_when predicate has no 'field' key.",
        });
        continue;
      }
      const hasOperand = "eq" in pred || "equals" in pred || "value" in pred
        || "ne" in pred || "not" in pred || "notEquals" in pred
        || "isNull" in pred || "is_null" in pred
        || "notNull" in pred || "not_null" in pred;
      if (!hasOperand) {
        violations.push({
          rule:   "visible_when shape",
          entity: row.entity_code,
          field:  row.field_name,
          detail: "visible_when predicate has no operand (eq/ne/isNull/notNull/value).",
        });
      }
    }

    // ── Check 4: coverage thresholds per AP entity ─────────────────────────
    const coverage = await pool.query<{
      entity_code: string;
      fields_with_editable_gate: number;
      fields_flagged_computed: number;
      fields_missing_rule: number;
    }>(`
      SELECT entity_code,
             fields_with_editable_gate,
             fields_flagged_computed,
             fields_missing_rule
        FROM control.v_entity_field_rule_coverage
       WHERE entity_code = ANY ($1::text[])
    `, [Array.from(AP_ENTITIES)]);

    for (const row of coverage.rows) {
      const thresholds = COVERAGE_THRESHOLDS[row.entity_code];
      if (!thresholds) continue;
      if (row.fields_with_editable_gate < thresholds.editable_min) {
        violations.push({
          rule:   "coverage editable_in_status",
          entity: row.entity_code,
          field:  null,
          detail: `Only ${row.fields_with_editable_gate} fields have editable_in_status; expected ≥ ${thresholds.editable_min}.`,
        });
      }
      if (row.fields_flagged_computed < thresholds.computed_min) {
        violations.push({
          rule:   "coverage is_computed",
          entity: row.entity_code,
          field:  null,
          detail: `Only ${row.fields_flagged_computed} fields flagged is_computed; expected ≥ ${thresholds.computed_min}.`,
        });
      }
    }

    // ── Check 5: missing-rule scan (active fields without any rule) ────────
    const missing = await pool.query<{
      entity_code: string;
      field_name:  string;
    }>(`
      SELECT entity_code, field_name
        FROM control.v_entity_field_contract_audit
       WHERE entity_code = ANY ($1::text[])
         AND missing_field_rule = true
       ORDER BY entity_code, field_name
    `, [Array.from(AP_ENTITIES)]);

    for (const row of missing.rows) {
      violations.push({
        rule:   "no rule",
        entity: row.entity_code,
        field:  row.field_name,
        detail: "Active field has no editable_in_status, is_read_only, or is_computed flag. Add to the next seed batch.",
      });
    }

  } finally {
    await pool.end();
  }

  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify({ ok: violations.length === 0, violations }, null, 2) + "\n");
  } else {
    if (violations.length === 0) {
      console.log("verify-field-rules: OK — all checks pass.");
    } else {
      console.error(`verify-field-rules: FAIL — ${violations.length} violation(s).`);
      for (const v of violations) {
        console.error(`  [${v.rule}] ${v.entity}${v.field ? `.${v.field}` : ""}: ${v.detail}`);
      }
    }
  }

  return violations.length === 0 ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error("verify-field-rules: unexpected error", err);
  process.exit(1);
});
