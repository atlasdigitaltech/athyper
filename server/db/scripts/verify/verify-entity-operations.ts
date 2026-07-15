#!/usr/bin/env tsx
/**
 * Three-Plane Permission Stack — Phase 6 CI guardrail.
 *
 * verify-entity-operations
 *
 * Locks the structural invariants of `control.entity_operation`. Catches the
 * common failure modes that Phases 0-5 spent significant effort fixing so a
 * future seed PR can't silently regress them:
 *
 *   Check 1: permission_code resolves
 *     Every entity_operation row must reference an active shared.permission.
 *     Catches typos in seed files and dangling rows after a permission rename.
 *
 *   Check 2: NAVIGATE handlers on DETAIL surface include {id}
 *     A DETAIL NAVIGATE handler that doesn't carry {id} can't actually
 *     deep-link into a record — pure dead surface. Phase 0 inventory
 *     caught several of these.
 *
 *   Check 3: handler_type=NAVIGATE requires handler_target
 *     NAVIGATE without a target is unreachable.
 *
 *   Check 4: surface = HIDDEN must use placement = COMMAND
 *     Mirrors the eo_surface_hidden_chk DB constraint as a structural
 *     reminder for seed authors.
 *
 *   Check 5: no duplicate (tenant_id, entity_name, permission_code)
 *     Mirrors eo_binding_uq but surfaces a clearer error than "DUP_VAL"
 *     when a seed re-INSERT collides.
 *
 *   Check 6: lifecycle UI flows declare an independent execution_target
 *     Prevents flow:* modal metadata from being treated as a server command.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm --dir server/db run db:verify:entity-operations
 *
 * Exit code:
 *   0 — all checks pass
 *   1 — one or more rows violate a structural rule
 */

import postgres from "postgres";

// ── Configuration ─────────────────────────────────────────────────────────────

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

interface Violation {
  check: string;
  detail: string;
  row?: Record<string, unknown>;
}

// ── Checks ────────────────────────────────────────────────────────────────────

async function runChecks(sql: ReturnType<typeof postgres>): Promise<Violation[]> {
  const violations: Violation[] = [];

  // Check 1: permission_code resolves to an active permission.
  const orphans = await sql<{ id: string; entity_name: string; permission_code: string }[]>`
    SELECT eo.id::text AS id, eo.entity_name, eo.permission_code
      FROM control.entity_operation eo
      LEFT JOIN shared.permission p
        ON p.code = eo.permission_code AND p.status = 'active'
     WHERE p.code IS NULL
  `;
  for (const row of orphans) {
    violations.push({
      check: "permission_code_resolves",
      detail: `entity_operation references unknown/inactive permission_code='${row.permission_code}'`,
      row,
    });
  }

  // Check 2: NAVIGATE handler on DETAIL/BOTH must include {id} placeholder.
  const naviMissingId = await sql<{
    id: string; entity_name: string; permission_code: string;
    surface: string; handler_target: string | null;
  }[]>`
    SELECT eo.id::text AS id, eo.entity_name, eo.permission_code,
           eo.surface, eo.handler_target
      FROM control.entity_operation eo
     WHERE eo.handler_type = 'NAVIGATE'
       AND eo.surface IN ('DETAIL', 'BOTH')
       AND eo.is_record_required = true
       AND (eo.handler_target IS NULL OR position('{id}' IN eo.handler_target) = 0)
  `;
  for (const row of naviMissingId) {
    violations.push({
      check: "navigate_detail_requires_{id}",
      detail: `DETAIL NAVIGATE handler missing {id} placeholder (target='${row.handler_target ?? "NULL"}')`,
      row,
    });
  }

  // Check 3: NAVIGATE requires non-null handler_target.
  const naviMissingTarget = await sql<{
    id: string; entity_name: string; permission_code: string;
  }[]>`
    SELECT eo.id::text AS id, eo.entity_name, eo.permission_code
      FROM control.entity_operation eo
     WHERE eo.handler_type = 'NAVIGATE'
       AND (eo.handler_target IS NULL OR btrim(eo.handler_target) = '')
  `;
  for (const row of naviMissingTarget) {
    violations.push({
      check: "navigate_requires_handler_target",
      detail: "NAVIGATE handler is unreachable without handler_target",
      row,
    });
  }

  // Check 4: HIDDEN surface must use COMMAND placement.
  const hiddenWrongPlacement = await sql<{
    id: string; entity_name: string; permission_code: string; placement: string;
  }[]>`
    SELECT eo.id::text AS id, eo.entity_name, eo.permission_code, eo.placement
      FROM control.entity_operation eo
     WHERE eo.surface = 'HIDDEN' AND eo.placement <> 'COMMAND'
  `;
  for (const row of hiddenWrongPlacement) {
    violations.push({
      check: "hidden_surface_uses_command_placement",
      detail: `HIDDEN surface row has placement='${row.placement}' (expected 'COMMAND')`,
      row,
    });
  }

  // Check 5: no duplicate active rows per (tenant, entity, permission_code).
  const duplicates = await sql<{
    tenant_id: string | null; entity_name: string; permission_code: string; n: number;
  }[]>`
    SELECT tenant_id::text AS tenant_id, entity_name, permission_code, COUNT(*)::int AS n
      FROM control.entity_operation
     WHERE is_enabled = true
     GROUP BY tenant_id, entity_name, permission_code
    HAVING COUNT(*) > 1
  `;
  for (const row of duplicates) {
    violations.push({
      check: "no_duplicate_binding",
      detail: `${row.n} active entity_operation rows share (tenant=${row.tenant_id ?? "platform"}, entity=${row.entity_name}, code=${row.permission_code})`,
      row,
    });
  }

  // Check 6: the registered lifecycle operations must carry an explicit
  // lifecycle command while retaining their independently configurable flow UI.
  const missingExecutionTargets = await sql<{
    tenant_id: string | null; entity_name: string; permission_code: string;
    handler_target: string | null; execution_target: string | null;
  }[]>`
    WITH expected(entity_name, permission_code, execution_target) AS (
      VALUES
        ('purchase_requisition', 'submit',  'lifecycle:submit'),
        ('receipt',              'submit',  'lifecycle:submit'),
        ('service_sheet',        'submit',  'lifecycle:submit'),
        ('purchase_invoice',     'submit',  'lifecycle:submit'),
        ('purchase_invoice',     'post',    'lifecycle:post'),
        ('purchase_invoice',     'reverse', 'lifecycle:reverse')
    )
    SELECT eo.tenant_id::text AS tenant_id, eo.entity_name, eo.permission_code,
           eo.handler_target, eo.execution_target
      FROM control.entity_operation eo
      JOIN expected x
        ON x.entity_name = eo.entity_name
       AND x.permission_code = eo.permission_code
     WHERE eo.is_enabled = true
       AND eo.handler_target LIKE 'flow:%'
       AND eo.execution_target IS DISTINCT FROM x.execution_target
  `;
  for (const row of missingExecutionTargets) {
    violations.push({
      check: "lifecycle_flow_has_execution_target",
      detail: `UI target '${row.handler_target ?? "NULL"}' requires execution target for ${row.entity_name}.${row.permission_code}`,
      row,
    });
  }

  return violations;
}

// ── Reporter ─────────────────────────────────────────────────────────────────

function report(violations: Violation[]): void {
  const heading = "Phase 6 — verify-entity-operations";
  const bar = "─".repeat(heading.length + 2);
  console.log(`\n\x1b[1m${heading}\x1b[0m`);
  console.log(bar);

  if (violations.length === 0) {
    console.log("\x1b[32mAll checks passed.\x1b[0m");
    return;
  }

  const grouped = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = grouped.get(v.check) ?? [];
    list.push(v);
    grouped.set(v.check, list);
  }

  for (const [check, group] of grouped) {
    console.log(`\n\x1b[31m✗ ${check}\x1b[0m (${group.length} violation${group.length === 1 ? "" : "s"})`);
    for (const v of group.slice(0, 10)) {
      console.log(`  ${v.detail}`);
      if (v.row) console.log(`    ${JSON.stringify(v.row)}`);
    }
    if (group.length > 10) console.log(`  …and ${group.length - 10} more`);
  }
  console.log(`\n\x1b[31mFAIL — ${violations.length} violation${violations.length === 1 ? "" : "s"}\x1b[0m\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const sql = postgres(DATABASE_URL!, { onnotice: () => undefined });
  try {
    const violations = await runChecks(sql);
    report(violations);
    process.exit(violations.length === 0 ? 0 : 1);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("\x1b[31mverify-entity-operations crashed:\x1b[0m", err);
  process.exit(2);
});
