#!/usr/bin/env tsx
/**
 * Three-Plane Permission Stack — Phase 6 CI guardrail.
 *
 * verify-permission-aliases
 *
 * Locks the D6 decision: canonical action code is `update`; `edit` is the
 * deprecated alias. control.permission_alias defines the alias map, and any
 * entity_operation row that still references an alias_code as its
 * permission_code is a regression — Phase 1 seed file 096_edit_to_update_
 * normalization.sql migrated the existing rows; this script blocks new
 * regressions.
 *
 * The check has two intensities:
 *
 *   - WARN (always emitted): an entity_operation references an alias_code.
 *                            The compiler still resolves it via the alias
 *                            map, but it's a future-fragile pattern.
 *
 *   - FAIL (only after hard_fail_after): when the alias row's deadline has
 *                                        passed, the warn becomes a fail.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm --dir server/db run db:verify:permission-aliases
 *
 * Exit code:
 *   0 — no aliased entity_operation rows OR all are before their hard_fail_after
 *   1 — at least one row has an expired hard_fail_after deadline
 *
 * Output:
 *   Counts of warned-vs-blocked rows + a sample of each.
 */

import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

interface AliasUsage {
  id: string;
  entity_name: string;
  permission_code: string;
  canonical_code: string;
  hard_fail_after: string | null;
  deadline_passed: boolean;
}

async function loadAliasUsage(sql: ReturnType<typeof postgres>): Promise<AliasUsage[]> {
  return sql<AliasUsage[]>`
    SELECT
        eo.id::text                          AS id,
        eo.entity_name                        AS entity_name,
        eo.permission_code                    AS permission_code,
        pa.canonical_code                     AS canonical_code,
        pa.hard_fail_after::text              AS hard_fail_after,
        (pa.hard_fail_after IS NOT NULL
           AND pa.hard_fail_after <= now())   AS deadline_passed
      FROM control.entity_operation eo
      JOIN control.permission_alias pa
        ON pa.alias_code = eo.permission_code
     WHERE eo.is_enabled = true
     ORDER BY eo.entity_name, eo.permission_code
  `;
}

function report(rows: AliasUsage[]): boolean {
  const heading = "Phase 6 — verify-permission-aliases";
  console.log(`\n\x1b[1m${heading}\x1b[0m`);
  console.log("─".repeat(heading.length + 2));

  if (rows.length === 0) {
    console.log("\x1b[32mNo entity_operation rows reference an alias_code.\x1b[0m");
    return true;
  }

  const warned = rows.filter((r) => !r.deadline_passed);
  const blocked = rows.filter((r) => r.deadline_passed);

  if (warned.length > 0) {
    console.log(`\n\x1b[33m⚠ ${warned.length} alias use${warned.length === 1 ? "" : "s"} pending migration:\x1b[0m`);
    for (const r of warned.slice(0, 10)) {
      const deadline = r.hard_fail_after ? `hard_fail_after=${r.hard_fail_after}` : "no deadline";
      console.log(`  ${r.entity_name}.${r.permission_code} → ${r.canonical_code}  (${deadline})`);
    }
    if (warned.length > 10) console.log(`  …and ${warned.length - 10} more`);
  }

  if (blocked.length > 0) {
    console.log(`\n\x1b[31m✗ ${blocked.length} alias use${blocked.length === 1 ? "" : "s"} past hard_fail_after deadline:\x1b[0m`);
    for (const r of blocked.slice(0, 10)) {
      console.log(`  ${r.entity_name}.${r.permission_code} → ${r.canonical_code}  (hard_fail_after=${r.hard_fail_after})`);
    }
    if (blocked.length > 10) console.log(`  …and ${blocked.length - 10} more`);
    console.log(`\n\x1b[31mFAIL — migrate these rows to the canonical code before re-running.\x1b[0m\n`);
    return false;
  }

  console.log(`\n\x1b[33mPASS-WITH-WARN — ${warned.length} pending alias use${warned.length === 1 ? "" : "s"}.\x1b[0m\n`);
  return true;
}

async function main(): Promise<void> {
  const sql = postgres(DATABASE_URL!, { onnotice: () => undefined });
  try {
    const rows = await loadAliasUsage(sql);
    const passed = report(rows);
    process.exit(passed ? 0 : 1);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("\x1b[31mverify-permission-aliases crashed:\x1b[0m", err);
  process.exit(2);
});
