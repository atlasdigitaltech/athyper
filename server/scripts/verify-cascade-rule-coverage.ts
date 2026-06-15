#!/usr/bin/env tsx
/**
 * Cascade Rule Coverage Verification (P0 / P1 / P4 CI gate)
 *
 * Asserts that every field declared as "cascading" in the canonical spec
 * has a populated control.entity_field.defaults row.
 *
 * Coverage targets (v1.2):
 *   • purchase_invoice_line:
 *       cost_center_id, profit_center_id, project_id, site_id,
 *       budget_allocation_id, business_intent_id   (6 fields, seeded P0)
 *   • pricing_component (P1+):
 *       business_intent_id                          (1 field, seeded P1)
 *
 * Schema validation:
 *   • default_value_source.kind ∈ ('parent_field','tenant_config','supplier_config','static')
 *   • when kind=parent_field, parent_entity + parent_field non-empty
 *   • override_detection.compare_to non-empty (or null for non-detecting fields)
 *   • on_parent_change ∈ ('preserve','prompt','inherit','recompute')
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/verify-cascade-rule-coverage.ts
 *
 *   # JSON output for CI:
 *   npx tsx server/scripts/verify-cascade-rule-coverage.ts --json
 *
 * Exit code:
 *   0 — all expected cascade fields have valid defaults
 *   1 — at least one missing or invalid (CI red)
 *
 * Spec: docs/specs/purchase_invoice_field_design.md §4
 */

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

const JSON_OUTPUT = process.argv.includes("--json");

interface ExpectedCascade {
  entity_code: string;
  field_name:  string;
  required:    boolean;   // false = present-but-may-be-null (e.g., business_intent_id has no parent today)
}

// Coverage matrix per v1.2 §4
const EXPECTED_CASCADES: ExpectedCascade[] = [
  // PIL — P0
  { entity_code: "purchase_invoice_line", field_name: "cost_center_id",       required: true },
  { entity_code: "purchase_invoice_line", field_name: "profit_center_id",     required: true },
  { entity_code: "purchase_invoice_line", field_name: "project_id",           required: true },
  { entity_code: "purchase_invoice_line", field_name: "site_id",              required: true },
  { entity_code: "purchase_invoice_line", field_name: "budget_allocation_id", required: true },
  { entity_code: "purchase_invoice_line", field_name: "business_intent_id",   required: true },

  // PC — P1 (only run when PC entity is registered; absence is non-fatal here)
  { entity_code: "pricing_component",     field_name: "business_intent_id",   required: false },
];

interface Violation {
  rule:        string;
  entity_code: string;
  field_name:  string;
  detail:      string;
  payload?:    Record<string, unknown>;
}

interface DefaultsRow {
  defaults: Record<string, unknown> | null;
}

const VALID_SOURCE_KINDS         = new Set(["parent_field","tenant_config","supplier_config","static"]);
const VALID_ON_PARENT_CHANGE     = new Set(["preserve","prompt","inherit","recompute"]);

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const violations: Violation[] = [];

  try {
    for (const expected of EXPECTED_CASCADES) {
      const result = await pool.query<DefaultsRow & { exists_count: string }>(`
        WITH ev AS (
          SELECT ev.id AS version_id
            FROM control.entity_version ev
            JOIN control.entity e ON e.id = ev.entity_id
           WHERE e.table_schema = 'document'
             AND e.table_name   = $1
             AND e.tenant_id IS NULL
             AND ev.version_no  = 1
           LIMIT 1
        )
        SELECT
          ef.defaults,
          (SELECT COUNT(*)::text FROM ev) AS exists_count
        FROM ev
        LEFT JOIN control.entity_field ef
          ON ef.entity_version_id = ev.version_id
         AND ef.name              = $2
        LIMIT 1
      `, [expected.entity_code, expected.field_name]);

      const row = result.rows[0];

      // Entity not registered
      if (!row || row.exists_count === "0") {
        if (expected.required) {
          violations.push({
            rule:        "ENTITY_NOT_REGISTERED",
            entity_code: expected.entity_code,
            field_name:  expected.field_name,
            detail:      `entity_version not found for ${expected.entity_code}`,
          });
        }
        continue;
      }

      // Field not registered or defaults null
      if (!row.defaults) {
        if (expected.required) {
          violations.push({
            rule:        "CASCADE_DEFAULTS_MISSING",
            entity_code: expected.entity_code,
            field_name:  expected.field_name,
            detail:      "control.entity_field.defaults is NULL for this cascading field",
          });
        }
        continue;
      }

      // Validate shape
      const defaults = row.defaults as Record<string, unknown>;
      const source   = defaults["default_value_source"] as Record<string, unknown> | undefined;
      const detect   = defaults["override_detection"]  as Record<string, unknown> | null | undefined;
      const onChange = defaults["on_parent_change"];

      if (!source) {
        violations.push({
          rule:        "DEFAULT_VALUE_SOURCE_MISSING",
          entity_code: expected.entity_code,
          field_name:  expected.field_name,
          detail:      "defaults.default_value_source is missing",
        });
        continue;
      }

      const kind = source["kind"];
      if (typeof kind !== "string" || !VALID_SOURCE_KINDS.has(kind)) {
        violations.push({
          rule:        "INVALID_SOURCE_KIND",
          entity_code: expected.entity_code,
          field_name:  expected.field_name,
          detail:      `default_value_source.kind="${kind}" is not in (${Array.from(VALID_SOURCE_KINDS).join(",")})`,
        });
      }

      if (kind === "parent_field") {
        if (!source["parent_entity"] || !source["parent_field"]) {
          violations.push({
            rule:        "PARENT_FIELD_INCOMPLETE",
            entity_code: expected.entity_code,
            field_name:  expected.field_name,
            detail:      "kind=parent_field requires both parent_entity and parent_field",
            payload:     { source },
          });
        }
        // override_detection should also be present for parent_field cascades
        if (!detect) {
          violations.push({
            rule:        "OVERRIDE_DETECTION_MISSING",
            entity_code: expected.entity_code,
            field_name:  expected.field_name,
            detail:      "kind=parent_field should declare override_detection for UI label rendering",
          });
        }
      }

      if (typeof onChange !== "string" || !VALID_ON_PARENT_CHANGE.has(onChange)) {
        violations.push({
          rule:        "INVALID_ON_PARENT_CHANGE",
          entity_code: expected.entity_code,
          field_name:  expected.field_name,
          detail:      `on_parent_change="${onChange}" is not in (${Array.from(VALID_ON_PARENT_CHANGE).join(",")})`,
        });
      }
    }

    // -------------------------------------------------------------------------
    // Report
    // -------------------------------------------------------------------------
    if (JSON_OUTPUT) {
      console.log(JSON.stringify({
        ok:           violations.length === 0,
        violations,
        expected:     EXPECTED_CASCADES.length,
        violation_count: violations.length,
      }, null, 2));
    } else {
      console.log("=== Cascade Rule Coverage Verification ===");
      console.log(`Expected cascade fields: ${EXPECTED_CASCADES.length}`);
      console.log(`Violations:              ${violations.length}`);
      console.log();

      if (violations.length > 0) {
        console.log("--- Violations ---");
        for (const v of violations) {
          console.log(`  [${v.rule}] ${v.entity_code}.${v.field_name}`);
          console.log(`    ${v.detail}`);
          if (v.payload) console.log(`    ${JSON.stringify(v.payload)}`);
        }
        console.log();
        console.log("FAIL — fix the seed 043_entity_field_rules_pi_pil_cascade.sql.");
      } else {
        console.log("OK — all expected cascade fields have valid defaults.");
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
