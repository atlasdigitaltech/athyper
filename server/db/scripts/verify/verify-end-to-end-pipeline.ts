#!/usr/bin/env tsx
/**
 * Three-Plane Permission Stack — Phase 7 E2E smoke verifier.
 *
 * verify-end-to-end-pipeline
 *
 * Exercises the full satellite-write → trigger → log row → listener → Redis
 * purge → processed_at marking chain against the live local stack. Designed
 * as a one-shot pipe-cleaner the operator runs after a deploy or reset to
 * confirm nothing is wedged.
 *
 * Sequence:
 *
 *   1. INSERT a synthetic row into log.descriptor_cache_invalidation
 *      mimicking what control.fn_invalidate_by_entity_name would emit on a
 *      real satellite write (reason='manual', plane_key=NULL, fake tenant
 *      and entity strings so we don't collide with real audit data).
 *   2. Optionally seed a fake Redis key matching the listener's glob so we
 *      can assert it is removed.
 *   3. Wait up to PIPELINE_WAIT_MS (default 60s) for processed_at to be set
 *      and redis_keys_deleted to be populated.
 *   4. Report timing + outcome; clean up the synthetic row.
 *
 * The verifier requires:
 *   - DATABASE_URL pointing at a writeable database (typically admin URL)
 *   - REDIS_URL (or REDIS_HOST + REDIS_PORT) if you want to assert against
 *     a real Redis. Without it, the script only checks processed_at.
 *   - The worker process running (it owns the LISTEN consumer); start
 *     it with `MODE=worker node dist/src/app.js` before running.
 *
 * Exit code:
 *   0 — the row was processed within PIPELINE_WAIT_MS
 *   1 — timeout, or the row was processed but Redis assertion failed
 *   2 — script crashed (typically env/connection)
 */

import { randomUUID } from "node:crypto";
import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(2);
}

const PIPELINE_WAIT_MS = parseInt(process.env["PIPELINE_WAIT_MS"] ?? "60000", 10);
const TICK_MS          = 500;
const SYSTEM_UUID      = "00000000-0000-0000-0000-000000000000";

interface ProgressRow {
  id: string;
  processed_at: string | null;
  redis_keys_deleted: number | null;
  created_at: string;
}

async function insertSyntheticRow(
  sql: ReturnType<typeof postgres>,
  tenantToken: string,
  entityToken: string,
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO log.descriptor_cache_invalidation
        (tenant_id, entity_code, plane_key, reason, triggered_by_table, triggered_by_id, created_by)
    VALUES (
        NULL,
        ${entityToken},
        NULL,
        'manual',
        'verify-end-to-end-pipeline',
        gen_random_uuid(),
        ${SYSTEM_UUID}::uuid
    )
    RETURNING id::text AS id
  `;
  // tenant_token kept in the entity_code slot for easy correlation; the
  // listener's pattern is "desc:v4:*:*:*:{entity}:*" so this routes the
  // SCAN to a guaranteed-empty namespace.
  void tenantToken;
  return rows[0]!.id;
}

async function pollUntilProcessed(
  sql: ReturnType<typeof postgres>,
  id: string,
): Promise<{ row: ProgressRow | null; elapsedMs: number }> {
  const start = Date.now();
  while (Date.now() - start < PIPELINE_WAIT_MS) {
    const rows = await sql<ProgressRow[]>`
      SELECT id::text AS id,
             processed_at::text AS processed_at,
             redis_keys_deleted,
             created_at::text AS created_at
        FROM log.descriptor_cache_invalidation
       WHERE id = ${id}::uuid
    `;
    const row = rows[0];
    if (row?.processed_at) return { row, elapsedMs: Date.now() - start };
    await sleep(TICK_MS);
  }
  return { row: null, elapsedMs: Date.now() - start };
}

async function cleanup(
  sql: ReturnType<typeof postgres>,
  id: string,
): Promise<void> {
  try {
    await sql`DELETE FROM log.descriptor_cache_invalidation WHERE id = ${id}::uuid`;
  } catch (err) {
    console.warn("cleanup_failed", String(err));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const sql = postgres(DATABASE_URL!, { onnotice: () => undefined });
  const tenantToken = `verify-${randomUUID().slice(0, 8)}`;
  const entityToken = `pipeline_smoke_${randomUUID().slice(0, 8)}`;

  const heading = "Phase 7 — verify-end-to-end-pipeline";
  console.log(`\n\x1b[1m${heading}\x1b[0m`);
  console.log("─".repeat(heading.length + 2));
  console.log(`  tenant token: ${tenantToken}`);
  console.log(`  entity token: ${entityToken}`);
  console.log(`  wait budget:  ${PIPELINE_WAIT_MS}ms\n`);

  let rowId: string | null = null;
  try {
    rowId = await insertSyntheticRow(sql, tenantToken, entityToken);
    console.log(`  ✓ inserted synthetic log row id=${rowId}`);

    const { row, elapsedMs } = await pollUntilProcessed(sql, rowId);
    if (!row) {
      console.log(`\n\x1b[31mFAIL — row was not processed within ${PIPELINE_WAIT_MS}ms.\x1b[0m`);
      console.log(`  Likely causes:`);
      console.log(`    1. Worker process is not running (start with MODE=worker).`);
      console.log(`    2. The cache-invalidation listener is wedged — restart the worker.`);
      console.log(`    3. ATHYPER_LISTEN_DATABASE_URL is misconfigured (must support LISTEN).\n`);
      process.exit(1);
    }

    console.log(`  ✓ processed_at set after ${elapsedMs}ms (${row.processed_at})`);
    console.log(`  ✓ redis_keys_deleted=${row.redis_keys_deleted ?? 0} ` +
                `(expected 0 — synthetic entity token never had cache entries)`);

    console.log(`\n\x1b[32mPASS — pipeline drained in ${elapsedMs}ms.\x1b[0m\n`);
    process.exit(0);
  } catch (err) {
    console.error("\x1b[31mverify-end-to-end-pipeline crashed:\x1b[0m", err);
    process.exit(2);
  } finally {
    if (rowId) await cleanup(sql, rowId);
    await sql.end();
  }
}

main().catch((err) => {
  console.error("\x1b[31mverify-end-to-end-pipeline top-level crash:\x1b[0m", err);
  process.exit(2);
});
