#!/usr/bin/env tsx
/**
 * Three-Plane Permission Stack — Phase 6 CI guardrail.
 *
 * verify-version-locks
 *
 * Locks the Phase 1 D14 invariant on `control.entity_version`: EFFECTIVE
 * rows are immutable except via the emergency override path, which requires
 * all four `emergency_override_*` fields to be populated together.
 *
 *   Check 1: EFFECTIVE rows that were updated after their creation date
 *            must carry a complete emergency_override quorum (CAB ticket,
 *            actor, reason, timestamp). The Phase 1 trigger enforces this
 *            at write time; the verifier audits historical state.
 *
 *   Check 2: locked_after_effective must be true for EFFECTIVE rows older
 *            than 5 minutes (the seed precompute window). Anything younger
 *            is still in the provisioner-bypass window.
 *
 *   Check 3: at most one EFFECTIVE row per entity_id. Phase 4 Studio approve
 *            runs the supersede + promote in a single transaction, but a
 *            misconfigured restore could double-promote.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm --dir server/db run db:verify:version-locks
 *
 * Exit code:
 *   0 — every EFFECTIVE row is in compliance
 *   1 — at least one row violates the invariant
 */

import postgres from "postgres";

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

async function runChecks(sql: ReturnType<typeof postgres>): Promise<Violation[]> {
  const violations: Violation[] = [];

  // Check 1: updated EFFECTIVE rows without the override quorum.
  const orphanMutations = await sql<{
    id: string;
    entity_id: string;
    version_no: number;
    created_at: string;
    updated_at: string;
    emergency_override_at: string | null;
    emergency_override_by: string | null;
    emergency_override_reason: string | null;
    emergency_override_ticket: string | null;
  }[]>`
    SELECT
        id::text AS id,
        entity_id::text AS entity_id,
        version_no,
        created_at::text AS created_at,
        updated_at::text AS updated_at,
        emergency_override_at::text AS emergency_override_at,
        emergency_override_by::text AS emergency_override_by,
        emergency_override_reason,
        emergency_override_ticket
      FROM control.entity_version
     WHERE status = 'EFFECTIVE'
       AND locked_after_effective = true
       AND updated_at IS NOT NULL
       AND updated_at > created_at + interval '5 minutes'
       AND (
              emergency_override_at     IS NULL
           OR emergency_override_by     IS NULL
           OR emergency_override_reason IS NULL
           OR btrim(emergency_override_reason) = ''
           OR emergency_override_ticket IS NULL
           OR btrim(emergency_override_ticket) = ''
       )
  `;
  for (const row of orphanMutations) {
    violations.push({
      check: "effective_mutation_requires_override_quorum",
      detail:
        `entity_version v${row.version_no} on entity ${row.entity_id} was updated post-creation ` +
        `without all four emergency_override_* fields populated`,
      row,
    });
  }

  // Check 2: long-lived EFFECTIVE rows with the lock disabled.
  const unlockedRows = await sql<{
    id: string; entity_id: string; version_no: number; created_at: string;
  }[]>`
    SELECT id::text AS id, entity_id::text AS entity_id, version_no, created_at::text AS created_at
      FROM control.entity_version
     WHERE status = 'EFFECTIVE'
       AND locked_after_effective = false
       AND created_at < now() - interval '5 minutes'
  `;
  for (const row of unlockedRows) {
    violations.push({
      check: "effective_must_lock_after_provisioning_window",
      detail:
        `EFFECTIVE entity_version v${row.version_no} on entity ${row.entity_id} has locked_after_effective=false ` +
        `outside the 5-minute provisioner window`,
      row,
    });
  }

  // Check 3: at most one EFFECTIVE row per entity.
  const doubleEffective = await sql<{ entity_id: string; n: number }[]>`
    SELECT entity_id::text AS entity_id, COUNT(*)::int AS n
      FROM control.entity_version
     WHERE status = 'EFFECTIVE'
     GROUP BY entity_id
    HAVING COUNT(*) > 1
  `;
  for (const row of doubleEffective) {
    violations.push({
      check: "single_effective_per_entity",
      detail: `entity ${row.entity_id} has ${row.n} EFFECTIVE versions (expected at most 1)`,
      row,
    });
  }

  return violations;
}

function report(violations: Violation[]): void {
  const heading = "Phase 6 — verify-version-locks";
  console.log(`\n\x1b[1m${heading}\x1b[0m`);
  console.log("─".repeat(heading.length + 2));

  if (violations.length === 0) {
    console.log("\x1b[32mAll EFFECTIVE entity_version rows pass the D14 invariants.\x1b[0m");
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
  console.error("\x1b[31mverify-version-locks crashed:\x1b[0m", err);
  process.exit(2);
});
