#!/usr/bin/env tsx
/**
 * Reference-Relation Coverage Verification
 *
 * Asserts that every entity_field declaring a reference target via
 * reference_config.target_entity has a matching belongs_to/fk row in
 * control.entity_relation. This is the contract the runtime read-path
 * label enricher depends on: descriptor says "render this as a reference
 * label" â†’ the enricher needs the relation row to know how to resolve
 * the target.
 *
 * Mismatches surfaced:
 *   â€¢ MISSING_RELATION       â€” entity_field has target_entity but no
 *                              entity_relation row with fk_field = column.
 *   â€¢ TARGET_MISMATCH        â€” entity_field.reference_config.target_entity
 *                              disagrees with entity_relation.target_entity.
 *   â€¢ RESOLUTION_KIND_WRONG  â€” relation found but resolution_kind != 'fk'.
 *                              (Polymorphic refs are intentionally skipped
 *                              â€” they have no single fk_field to match.)
 *
 * Skip rules:
 *   â€¢ Polymorphic fields (validation->>'polymorphic' = 'true').
 *   â€¢ System audit FKs without reference_config (created_by, updated_by,
 *     etc.) â€” those don't claim a contract, so no contract to violate.
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/verify-reference-relation-coverage.ts
 *
 *   npx tsx server/scripts/verify-reference-relation-coverage.ts --json
 *
 * Exit code:
 *   0 â€” every reference field has a matching belongs_to/fk relation.
 *   1 â€” at least one drift; fix entity_relation seed (043_control_entity_relation_contract.sql).
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
  rule:          string;
  entity_code:   string;
  field_name:    string;
  column_name:   string;
  target_entity: string;
  detail:        string;
  payload?:      Record<string, unknown>;
}

interface DriftRow {
  entity_code:           string;
  field_name:            string;
  column_name:           string;
  field_target_entity:   string;
  relation_present:      boolean;
  relation_target_entity: string | null;
  relation_resolution:   string | null;
  relation_kind:         string | null;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const violations: Violation[] = [];
  let checked = 0;

  try {
    // Pull every platform (tenant_id IS NULL) entity_field that declares a
    // reference target via reference_config.target_entity. LEFT JOIN against
    // entity_relation on (entity_version_id, fk_field = column_name) to
    // detect missing or mismatched relation rows in one query.
    const result = await pool.query<DriftRow>(`
      WITH ref_fields AS (
        SELECT
          e.entity_code,
          ef.entity_version_id,
          ef.name        AS field_name,
          ef.column_name,
          ef.reference_config->>'target_entity' AS field_target_entity,
          ef.validation
        FROM control.entity_field ef
        JOIN control.entity_version ev ON ev.id = ef.entity_version_id
        JOIN control.entity         e  ON e.id  = ev.entity_id
        WHERE ef.tenant_id IS NULL
          AND e.tenant_id  IS NULL
          AND ev.tenant_id IS NULL
          AND ef.is_active = true
          AND ef.reference_config IS NOT NULL
          AND ef.reference_config ? 'target_entity'
          AND COALESCE(ef.validation->>'polymorphic', 'false') <> 'true'
      )
      SELECT
        rf.entity_code,
        rf.field_name,
        rf.column_name,
        rf.field_target_entity,
        (er.id IS NOT NULL)         AS relation_present,
        er.target_entity            AS relation_target_entity,
        er.resolution_kind          AS relation_resolution,
        er.relation_kind            AS relation_kind
      FROM ref_fields rf
      LEFT JOIN control.entity_relation er
        ON er.entity_version_id = rf.entity_version_id
       AND er.fk_field          = rf.column_name
       AND er.tenant_id         IS NULL
      ORDER BY rf.entity_code, rf.field_name
    `);

    for (const row of result.rows) {
      checked += 1;

      if (!row.relation_present) {
        violations.push({
          rule:          "MISSING_RELATION",
          entity_code:   row.entity_code,
          field_name:    row.field_name,
          column_name:   row.column_name,
          target_entity: row.field_target_entity,
          detail:        `entity_field declares reference_config.target_entity='${row.field_target_entity}' but no entity_relation row with fk_field='${row.column_name}' exists`,
        });
        continue;
      }

      if (row.relation_target_entity !== row.field_target_entity) {
        violations.push({
          rule:          "TARGET_MISMATCH",
          entity_code:   row.entity_code,
          field_name:    row.field_name,
          column_name:   row.column_name,
          target_entity: row.field_target_entity,
          detail:        `descriptor target='${row.field_target_entity}' disagrees with relation target='${row.relation_target_entity}'`,
          payload:       { relation_target: row.relation_target_entity },
        });
      }

      if (row.relation_resolution !== "fk" && row.relation_resolution !== "array_fk") {
        violations.push({
          rule:          "RESOLUTION_KIND_WRONG",
          entity_code:   row.entity_code,
          field_name:    row.field_name,
          column_name:   row.column_name,
          target_entity: row.field_target_entity,
          detail:        `relation resolution_kind='${row.relation_resolution}' (expected 'fk' or 'array_fk' for descriptor-declared FK fields)`,
          payload:       { relation_kind: row.relation_kind },
        });
      }
    }

    if (JSON_OUTPUT) {
      console.log(JSON.stringify({
        ok:              violations.length === 0,
        checked,
        violation_count: violations.length,
        violations,
      }, null, 2));
    } else {
      console.log("=== Reference-Relation Coverage Verification ===");
      console.log(`Reference fields checked: ${checked}`);
      console.log(`Violations:               ${violations.length}`);
      console.log();

      if (violations.length > 0) {
        console.log("--- Violations ---");
        for (const v of violations) {
          console.log(`  [${v.rule}] ${v.entity_code}.${v.field_name} (col=${v.column_name}, target=${v.target_entity})`);
          console.log(`    ${v.detail}`);
          if (v.payload) console.log(`    ${JSON.stringify(v.payload)}`);
        }
        console.log();
        console.log("FAIL â€” add the missing belongs_to/fk rows to the canonical server/db/seed/meta-entity pack");
        console.log("       (or align the descriptor reference_config.target_entity with the existing relation).");
      } else {
        console.log("OK â€” every reference_config field has a matching belongs_to/fk relation.");
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


