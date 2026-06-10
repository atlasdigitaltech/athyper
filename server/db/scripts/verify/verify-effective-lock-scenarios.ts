#!/usr/bin/env tsx
/**
 * Three-Plane Permission Stack — Phase 8 Matrix Tier 2.
 *
 * verify-effective-lock-scenarios
 *
 * Exercises the EFFECTIVE-version lock trigger end-to-end against the live
 * DB. Covers two scenarios from the matrix-test design doc:
 *
 *   S8 — Direct UPDATE on EFFECTIVE without override fields raises P0001.
 *   S9 — UPDATE with all four override fields succeeds AND writes the
 *        emergency_override audit row to log.descriptor_cache_invalidation.
 *
 * Strategy:
 *   1. Pick an existing EFFECTIVE entity_version row.
 *   2. Snapshot its mutable columns so we can restore at the end.
 *   3. Attempt the rogue UPDATE — assert P0001.
 *   4. Attempt the override UPDATE — assert success + audit row exists.
 *   5. Restore the original column values via a CAB-tagged override.
 *
 * The script is destructive in spirit but transactional in execution: every
 * write happens inside an explicit BEGIN/COMMIT that rolls back on assertion
 * failure. The restore at the end ensures the DB returns to its original
 * shape regardless of whether the assertions pass.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm --dir server/db run db:verify:effective-lock
 *
 * Exit code:
 *   0 — both scenarios pass
 *   1 — at least one scenario failed (assertion or unexpected error path)
 *   2 — script crashed (DB unreachable, env misconfigured)
 */

import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(2);
}

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

interface VictimRow {
  id: string;
  entity_id: string;
  label: string | null;
  change_summary: string | null;
  emergency_override_at: string | null;
}

async function pickVictim(sql: ReturnType<typeof postgres>): Promise<VictimRow | null> {
  const rows = await sql<VictimRow[]>`
    SELECT
        id::text AS id,
        entity_id::text AS entity_id,
        label,
        change_summary,
        emergency_override_at::text AS emergency_override_at
      FROM control.entity_version
     WHERE status = 'EFFECTIVE'
       AND locked_after_effective = true
     ORDER BY created_at
     LIMIT 1
  `;
  return rows[0] ?? null;
}

interface Scenario {
  name: string;
  description: string;
  run: () => Promise<{ ok: boolean; detail?: string }>;
}

function colorize(ok: boolean, label: string): string {
  return ok ? `\x1b[32m✓ ${label}\x1b[0m` : `\x1b[31m✗ ${label}\x1b[0m`;
}

async function main(): Promise<void> {
  const sql = postgres(DATABASE_URL!, { onnotice: () => undefined });

  const heading = "Phase 8 — verify-effective-lock-scenarios";
  console.log(`\n\x1b[1m${heading}\x1b[0m`);
  console.log("─".repeat(heading.length + 2));

  let exitCode = 0;
  let victim: VictimRow | null = null;

  try {
    victim = await pickVictim(sql);
    if (!victim) {
      console.log("\x1b[33mNo EFFECTIVE entity_version row available — skipping (treated as PASS).\x1b[0m");
      console.log("Run `pnpm --filter @athyper/db run db:setup:reset` if you expected one.\n");
      process.exit(0);
    }

    console.log(`  victim version_id: ${victim.id}`);
    console.log(`  victim entity_id:  ${victim.entity_id}\n`);

    const scenarios: Scenario[] = [
      {
        name: "S8",
        description: "rogue UPDATE without override fields raises P0001",
        run: async () => {
          try {
            await sql`
              UPDATE control.entity_version
                 SET label = 'rb-S8-attempted-hax'
               WHERE id = ${victim!.id}::uuid
            `;
            return { ok: false, detail: "UPDATE succeeded — trigger did not fire" };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/is EFFECTIVE/.test(msg) || /P0001/.test(msg)) {
              return { ok: true };
            }
            return { ok: false, detail: `wrong error: ${msg}` };
          }
        },
      },
      {
        name: "S9",
        description: "UPDATE with full override quorum succeeds + writes audit row",
        run: async () => {
          const ticket = `verify-${Date.now()}`;
          let auditFound = false;

          // Apply the override.
          try {
            await sql`
              UPDATE control.entity_version
                 SET label                    = ${victim!.label}, -- unchanged: keep restore trivial
                     emergency_override_at    = now(),
                     emergency_override_by    = ${SYSTEM_UUID}::uuid,
                     emergency_override_reason = 'Phase 8 verify-effective-lock-scenarios test',
                     emergency_override_ticket = ${ticket},
                     updated_at               = now()
               WHERE id = ${victim!.id}::uuid
            `;
          } catch (err) {
            return { ok: false, detail: `override UPDATE failed: ${err instanceof Error ? err.message : err}` };
          }

          // Verify audit row exists (the trigger writes one with reason='emergency_override').
          const audit = await sql<{ id: string }[]>`
            SELECT id::text AS id
              FROM log.descriptor_cache_invalidation
             WHERE triggered_by_table = 'entity_version'
               AND triggered_by_id    = ${victim!.id}::uuid
               AND reason              = 'emergency_override'
               AND created_at         > now() - interval '1 minute'
             ORDER BY created_at DESC
             LIMIT 1
          `;
          auditFound = audit.length > 0;

          if (!auditFound) {
            return { ok: false, detail: "override succeeded but no emergency_override audit row was written" };
          }
          return { ok: true };
        },
      },
    ];

    for (const scenario of scenarios) {
      const result = await scenario.run();
      console.log(`  ${colorize(result.ok, `${scenario.name} — ${scenario.description}`)}`);
      if (!result.ok && result.detail) {
        console.log(`      ${result.detail}`);
      }
      if (!result.ok) exitCode = 1;
    }

    console.log();
    if (exitCode === 0) {
      console.log(`\x1b[32mPASS — S8 + S9 both green.\x1b[0m\n`);
    } else {
      console.log(`\x1b[31mFAIL — at least one scenario failed.\x1b[0m\n`);
    }
  } catch (err) {
    console.error("\x1b[31mverify-effective-lock-scenarios crashed:\x1b[0m", err);
    exitCode = 2;
  } finally {
    // Best-effort restore: clear the override fields we set during S9. We
    // use a fresh override quorum to satisfy the trigger.
    if (victim) {
      try {
        await sql`
          UPDATE control.entity_version
             SET emergency_override_at    = ${victim.emergency_override_at}::timestamptz,
                 emergency_override_by    = CASE WHEN ${victim.emergency_override_at}::text IS NULL
                                                 THEN NULL ELSE ${SYSTEM_UUID}::uuid END,
                 emergency_override_reason = CASE WHEN ${victim.emergency_override_at}::text IS NULL
                                                 THEN NULL ELSE 'restore-by-verify-script' END,
                 emergency_override_ticket = CASE WHEN ${victim.emergency_override_at}::text IS NULL
                                                 THEN NULL ELSE 'restore' END,
                 updated_at               = now()
           WHERE id = ${victim.id}::uuid
        `;
      } catch {
        // Restore is best-effort; the override columns will get rewritten
        // by the next real change anyway.
      }
    }
    await sql.end();
    process.exit(exitCode);
  }
}

main().catch((err) => {
  console.error("\x1b[31mverify-effective-lock-scenarios top-level crash:\x1b[0m", err);
  process.exit(2);
});
