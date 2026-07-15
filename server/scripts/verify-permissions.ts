#!/usr/bin/env tsx
/**
 * Verify Permissions Resolve — Phase 10
 *
 * Asserts that every permission reference in the control plane resolves to a
 * row in `shared.permission`:
 *
 *   1. control.entity_operation.permission_code (FK-enforced — sanity check)
 *   2. control.entity_action_rule.required_permission (NOT FK-enforced —
 *      this is the critical check; missing references silently deny actions
 *      at runtime).
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/verify-permissions.ts
 *
 * Exit code:
 *   0 — every reference resolves
 *   1 — at least one missing reference
 */

import pg from "pg";

const { Pool } = pg;
const JSON_OUTPUT = process.argv.includes("--json");
const DATABASE_URL = process.env["DATABASE_URL"];

interface MissingActionRule {
  entity_code:         string;
  status:              string;
  action_code:         string;
  required_permission: string;
}

interface MissingOperation {
  tenant_id:       string | null;
  entity_name:     string;
  permission_code: string;
}

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // ── Check 1: entity_action_rule.required_permission resolves ─────────
    const ruleResult = await pool.query<MissingActionRule>(`
      SELECT ear.entity_code,
             ear.status,
             ear.action_code,
             ear.required_permission
        FROM control.entity_action_rule ear
       WHERE ear.capability          = 'requires_permission'
         AND ear.required_permission IS NOT NULL
         AND NOT EXISTS (
             SELECT 1 FROM shared.permission p
              WHERE p.code = ear.required_permission
         )
       ORDER BY ear.entity_code, ear.status, ear.action_code
    `);

    // ── Check 2: entity_operation.permission_code resolves ───────────────
    // (FK-enforced — should always pass; included as a defensive sanity check)
    const opResult = await pool.query<MissingOperation>(`
      SELECT eo.tenant_id::text  AS tenant_id,
             eo.entity_name,
             eo.permission_code
        FROM control.entity_operation eo
       WHERE eo.permission_code IS NOT NULL
         AND NOT EXISTS (
             SELECT 1 FROM shared.permission p
              WHERE p.code = eo.permission_code
         )
       ORDER BY eo.entity_name, eo.permission_code
    `);

    const missingRules     = ruleResult.rows;
    const missingOperations = opResult.rows;
    const totalIssues = missingRules.length + missingOperations.length;

    if (JSON_OUTPUT) {
      console.log(JSON.stringify({
        ok:                totalIssues === 0,
        missing_action_rules: missingRules,
        missing_operations:   missingOperations,
      }, null, 2));
    } else {
      console.log(`Permission reference resolution check`);
      if (totalIssues === 0) {
        console.log("✓ pass — every action_rule.required_permission and entity_operation.permission_code resolves");
      } else {
        if (missingRules.length) {
          console.error(`✗ Missing action_rule.required_permission (${missingRules.length}):`);
          for (const r of missingRules) {
            console.error(`  ${r.entity_code} / ${r.status} / ${r.action_code} → required '${r.required_permission}'`);
          }
        }
        if (missingOperations.length) {
          console.error(`✗ Missing entity_operation.permission_code (${missingOperations.length}):`);
          for (const o of missingOperations) {
            console.error(`  ${o.entity_name} → permission '${o.permission_code}' (tenant=${o.tenant_id ?? "platform"})`);
          }
        }
        console.error(`\nHint: seed missing permissions in server/db/seed/platform/002_permission_model/017_permission.sql`);
      }
    }

    process.exit(totalIssues === 0 ? 0 : 1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
