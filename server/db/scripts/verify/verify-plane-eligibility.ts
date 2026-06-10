#!/usr/bin/env tsx
/**
 * Three-Plane Permission Stack — Phase 6 CI guardrail.
 *
 * verify-plane-eligibility
 *
 * Locks the Phase 1 invariants on `plane_eligibility`:
 *
 *   Check 1: every active shared.permission has plane_eligibility cardinality > 0
 *     A permission with no plane is unreachable — the compiler filter
 *     `WHERE plane_eligibility @> ARRAY[$plane]` drops it on every plane.
 *     The DDL CHECK enforces this at write time; the verify script catches
 *     stale rows that predate the constraint.
 *
 *   Check 2: every platform control.entity has plane_eligibility cardinality > 0
 *     Same reasoning — an entity with no plane is unreachable.
 *
 *   Check 3: cross-plane entity_operation.plane_filter ⊆ entity.plane_eligibility
 *     If an operation declares a plane via plane_filter, that plane must
 *     be in the parent entity's plane_eligibility — otherwise the
 *     operation is unreachable.
 *
 *   Check 4: no plane_eligibility value outside {neon, admin, mesh}
 *     Mirrors the DDL CHECK constraint as a structural guard for seeds
 *     that bypass the constraint via array_append shenanigans.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm --dir server/db run db:verify:plane-eligibility
 *
 * Exit code:
 *   0 — every active row carries a non-empty, well-formed plane_eligibility
 *   1 — at least one row violates the invariant
 */

import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

const VALID_PLANES = new Set(["neon", "admin", "mesh"]);

interface Violation {
  check: string;
  detail: string;
  row?: Record<string, unknown>;
}

async function runChecks(sql: ReturnType<typeof postgres>): Promise<Violation[]> {
  const violations: Violation[] = [];

  // Check 1: permission plane_eligibility cardinality.
  const emptyPermissionPlanes = await sql<{ id: string; code: string; plane_eligibility: string[] }[]>`
    SELECT id::text AS id, code, plane_eligibility
      FROM shared.permission
     WHERE status = 'active'
       AND cardinality(plane_eligibility) = 0
  `;
  for (const row of emptyPermissionPlanes) {
    violations.push({
      check: "permission_has_plane",
      detail: `shared.permission ${row.code} has empty plane_eligibility`,
      row,
    });
  }

  // Check 1b: permission plane_eligibility values are in the valid set.
  const badPermissionPlanes = await sql<{ id: string; code: string; plane_eligibility: string[] }[]>`
    SELECT id::text AS id, code, plane_eligibility
      FROM shared.permission
     WHERE status = 'active'
       AND NOT (plane_eligibility <@ ARRAY['neon','admin','mesh']::text[])
  `;
  for (const row of badPermissionPlanes) {
    violations.push({
      check: "permission_plane_values",
      detail: `shared.permission ${row.code} has plane_eligibility=${JSON.stringify(row.plane_eligibility)} (must be subset of {neon,admin,mesh})`,
      row,
    });
  }

  // Check 2: platform entity plane_eligibility cardinality.
  const emptyEntityPlanes = await sql<{ id: string; entity_code: string; plane_eligibility: string[] }[]>`
    SELECT id::text AS id, entity_code, plane_eligibility
      FROM control.entity
     WHERE tenant_id IS NULL
       AND is_active = true
       AND cardinality(plane_eligibility) = 0
  `;
  for (const row of emptyEntityPlanes) {
    violations.push({
      check: "entity_has_plane",
      detail: `control.entity ${row.entity_code} (platform) has empty plane_eligibility`,
      row,
    });
  }

  // Check 3: plane_filter ⊆ entity.plane_eligibility.
  const planeFilterMismatch = await sql<{
    id: string;
    entity_name: string;
    permission_code: string;
    plane_filter: string[];
    entity_planes: string[];
  }[]>`
    SELECT
        eo.id::text                AS id,
        eo.entity_name,
        eo.permission_code,
        eo.plane_filter,
        e.plane_eligibility        AS entity_planes
      FROM control.entity_operation eo
      JOIN control.entity e
        ON e.entity_code = eo.entity_name
       AND e.tenant_id IS NULL
     WHERE eo.plane_filter IS NOT NULL
       AND NOT (eo.plane_filter <@ e.plane_eligibility)
  `;
  for (const row of planeFilterMismatch) {
    violations.push({
      check: "plane_filter_subset_of_entity",
      detail:
        `entity_operation ${row.entity_name}.${row.permission_code} plane_filter=${JSON.stringify(row.plane_filter)} ` +
        `is not a subset of entity.plane_eligibility=${JSON.stringify(row.entity_planes)}`,
      row,
    });
  }

  // Check 4: every plane_filter value is in {neon, admin, mesh}.
  const badPlaneFilter = await sql<{
    id: string; entity_name: string; permission_code: string; plane_filter: string[];
  }[]>`
    SELECT id::text AS id, entity_name, permission_code, plane_filter
      FROM control.entity_operation
     WHERE plane_filter IS NOT NULL
       AND NOT (plane_filter <@ ARRAY['neon','admin','mesh']::text[])
  `;
  for (const row of badPlaneFilter) {
    violations.push({
      check: "plane_filter_values",
      detail: `entity_operation ${row.entity_name}.${row.permission_code} plane_filter=${JSON.stringify(row.plane_filter)} contains an invalid plane`,
      row,
    });
    // Silence the lint warning: VALID_PLANES is documented above.
    void VALID_PLANES;
  }

  return violations;
}

function report(violations: Violation[]): void {
  const heading = "Phase 6 — verify-plane-eligibility";
  console.log(`\n\x1b[1m${heading}\x1b[0m`);
  console.log("─".repeat(heading.length + 2));

  if (violations.length === 0) {
    console.log("\x1b[32mAll permission and entity plane_eligibility rows pass.\x1b[0m");
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
    }
    if (group.length > 10) console.log(`  …and ${group.length - 10} more`);
  }
  console.log(`\n\x1b[31mFAIL — ${violations.length} violation${violations.length === 1 ? "" : "s"}\x1b[0m\n`);
}

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
  console.error("\x1b[31mverify-plane-eligibility crashed:\x1b[0m", err);
  process.exit(2);
});
