#!/usr/bin/env tsx
/**
 * Three-Plane Permission Stack — Phase 6 operational guardrail.
 *
 * verify-cache-invalidation-backlog
 *
 * Surfaces operational health of the Phase 5 cache-invalidation listener.
 * The listener (server/src/services/cache-invalidation/listener.ts) is
 * expected to drain log.descriptor_cache_invalidation within seconds of a
 * trigger fire, with the 30s poller as a fallback. If unprocessed rows
 * accumulate beyond a small threshold the listener is wedged.
 *
 *   Check 1: no unprocessed rows older than 2 hours
 *     The poller's 1-hour lookback window means anything older than 1h
 *     will be silently skipped — by 2h it's definitely dead.
 *
 *   Check 2: backlog count under 1000 rows
 *     Even healthy spikes (mass entity_version publish) should drain within
 *     the next poll cycle. Sustained 1000+ rows indicates Redis or
 *     listener failure.
 *
 *   Check 3: error-rate sanity — no >100 invalidation rows in a single
 *            minute. The trigger writes one row per write; this would
 *            indicate a runaway loop or seed misconfiguration.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm --dir server/db run db:verify:cache-backlog
 *
 * Exit code:
 *   0 — backlog is healthy
 *   1 — at least one threshold is breached
 *
 * Note:
 *   This script is opt-in (not part of `db:verify`). Wire it into the
 *   ops alerting cron, not the PR-time CI suite — the steady-state log
 *   table is healthy by definition; a PR-time check would only catch
 *   weird CI fixtures.
 */

import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

const STALE_HOURS    = parseInt(process.env["BACKLOG_STALE_HOURS"]    ?? "2", 10);
const BACKLOG_LIMIT  = parseInt(process.env["BACKLOG_LIMIT"]          ?? "1000", 10);
const BURST_LIMIT    = parseInt(process.env["BACKLOG_BURST_LIMIT"]    ?? "100", 10);

interface Stats {
  stale_rows:      number;
  total_unprocessed: number;
  max_burst:       number;
  oldest_iso:      string | null;
  newest_iso:      string | null;
}

async function loadStats(sql: ReturnType<typeof postgres>): Promise<Stats> {
  const result = await sql<Stats[]>`
    WITH bursts AS (
      SELECT date_trunc('minute', created_at) AS minute, COUNT(*)::int AS n
        FROM log.descriptor_cache_invalidation
       WHERE created_at > now() - interval '1 hour'
       GROUP BY 1
    )
    SELECT
        (SELECT COUNT(*)::int FROM log.descriptor_cache_invalidation
          WHERE processed_at IS NULL
            AND created_at < now() - interval '${sql.unsafe(String(STALE_HOURS))} hours'
        ) AS stale_rows,
        (SELECT COUNT(*)::int FROM log.descriptor_cache_invalidation
          WHERE processed_at IS NULL
        ) AS total_unprocessed,
        COALESCE((SELECT MAX(n) FROM bursts), 0) AS max_burst,
        (SELECT MIN(created_at)::text FROM log.descriptor_cache_invalidation
          WHERE processed_at IS NULL
        ) AS oldest_iso,
        (SELECT MAX(created_at)::text FROM log.descriptor_cache_invalidation
          WHERE processed_at IS NULL
        ) AS newest_iso
  `;
  return result[0]!;
}

function report(stats: Stats): boolean {
  const heading = "Phase 6 — verify-cache-invalidation-backlog";
  console.log(`\n\x1b[1m${heading}\x1b[0m`);
  console.log("─".repeat(heading.length + 2));
  console.log(`  Threshold:    stale-rows < ${STALE_HOURS}h, total-unprocessed < ${BACKLOG_LIMIT}, per-minute burst < ${BURST_LIMIT}`);
  console.log(`  Total unprocessed:           ${stats.total_unprocessed}`);
  console.log(`  Stale (> ${STALE_HOURS}h):              ${stats.stale_rows}`);
  console.log(`  Max per-minute burst (1h):    ${stats.max_burst}`);
  console.log(`  Oldest unprocessed:          ${stats.oldest_iso ?? "—"}`);
  console.log(`  Newest unprocessed:          ${stats.newest_iso ?? "—"}`);

  const failures: string[] = [];
  if (stats.stale_rows > 0) {
    failures.push(`${stats.stale_rows} row${stats.stale_rows === 1 ? "" : "s"} older than ${STALE_HOURS}h — listener wedged or down`);
  }
  if (stats.total_unprocessed > BACKLOG_LIMIT) {
    failures.push(`backlog ${stats.total_unprocessed} > ${BACKLOG_LIMIT}`);
  }
  if (stats.max_burst > BURST_LIMIT) {
    failures.push(`${stats.max_burst} rows in a single minute > ${BURST_LIMIT} — investigate runaway invalidations`);
  }

  if (failures.length === 0) {
    console.log(`\n\x1b[32mPASS — cache invalidation pipeline is healthy.\x1b[0m\n`);
    return true;
  }

  for (const f of failures) console.log(`\n\x1b[31m✗ ${f}\x1b[0m`);
  console.log(`\n\x1b[31mFAIL — ${failures.length} threshold breach${failures.length === 1 ? "" : "es"}\x1b[0m\n`);
  return false;
}

async function main(): Promise<void> {
  const sql = postgres(DATABASE_URL!, { onnotice: () => undefined });
  try {
    const stats = await loadStats(sql);
    const passed = report(stats);
    process.exit(passed ? 0 : 1);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("\x1b[31mverify-cache-invalidation-backlog crashed:\x1b[0m", err);
  process.exit(2);
});
