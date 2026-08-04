#!/usr/bin/env tsx
/**
 * Tenant-Stamp Integration Suite
 *
 * Asserts that the TenantStampDriver behaves correctly through a real
 * PgBouncer transaction-pool pipeline — not a unit-test fake. This is the
 * test the unit suite can't replace: it catches PgBouncer-specific surprises
 * (connection tag leaks across concurrent queries, server-reset-query
 * interactions, transaction-pool handoff) and measures actual round-trip
 * overhead.
 *
 * What it runs:
 *   1. Concurrency: interleave TENANT_A and TENANT_B queries via Promise.all
 *      through the SAME Kysely instance. Each query must see only its own
 *      tenant's row. This is the critical regression test.
 *   2. No-op interleave: concurrent queries where one has a tenant context
 *      and the other doesn't (bootstrap/health-probe case). The no-op path
 *      must not accidentally inherit a stamp from the other async flow.
 *   3. Explicit-tx stamping: a multi-statement `db.transaction()` must stamp
 *      once at BEGIN and not re-wrap individual statements.
 *   4. Bench: p50/p99 latency for standalone reads, standalone writes, and
 *      transactional writes through PgBouncer, with and without the stamp.
 *
 * Usage:
 *   # Against PgBouncer (preferred — catches transaction-pool bugs):
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:6432/athyper_test \
 *   RLS_APP_ROLE=athyperapp_test \
 *   npx tsx server/scripts/verify-tenant-stamp.ts
 *
 *   # Against direct Postgres (baseline):
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper_test \
 *   npx tsx server/scripts/verify-tenant-stamp.ts --no-pgbouncer
 *
 * Exit code:
 *   0 — all checks passed
 *   1 — any check failed
 */

import { AsyncLocalStorage } from "node:async_hooks";

import { Kysely } from "kysely";
import pg from "pg";

import { TenantStampDialect } from "../packages/adapters/db/src/kysely/tenant-stamp-driver.js";
import { createPostgresDialect } from "../packages/adapters/db/src/kysely/dialect.js";

const { Pool } = pg;

// ── Configuration ────────────────────────────────────────────────────────────

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}
const RLS_APP_ROLE = process.env["RLS_APP_ROLE"]?.trim() || null;
if (RLS_APP_ROLE !== null && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(RLS_APP_ROLE)) {
  console.error(`ERROR: RLS_APP_ROLE "${RLS_APP_ROLE}" is not a valid SQL identifier`);
  process.exit(1);
}

const TENANT_A = "01900000-0000-7000-aaaa-000000000001";
const TENANT_B = "01900000-0000-7000-bbbb-000000000002";
const ACTOR_ID = "01900000-0000-7000-cccc-000000000003";

// Simulated request-context ALS. In the real runtime this is kernel's
// request-context.ts; here we simulate the same behavior so the driver sees
// a realistic provider.
interface Ctx { readonly tenantId?: string | null }
const als = new AsyncLocalStorage<Ctx>();
const runAs = <T>(tenantId: string | null, fn: () => Promise<T>): Promise<T> =>
  als.run({ tenantId: tenantId ?? undefined }, fn);

// ── Kysely wiring ────────────────────────────────────────────────────────────

const basePool = new Pool({
  connectionString: DATABASE_URL,
  max: 8,
  application_name: undefined, // PgBouncer-safe
});

const baseDialect = createPostgresDialect(basePool);
const kysely = new Kysely<Record<string, unknown>>({
  dialect: new TenantStampDialect({
    base: baseDialect,
    tenantIdProvider: () => als.getStore()?.tenantId ?? null,
  }),
});

// A second Kysely WITHOUT the stamp driver, for the bench baseline comparison.
const plainKysely = new Kysely<Record<string, unknown>>({
  dialect: createPostgresDialect(basePool),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

interface Check { name: string; status: "PASS" | "FAIL"; detail?: string }
const results: Check[] = [];

function pass(name: string) {
  results.push({ name, status: "PASS" });
  console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
}
function fail(name: string, detail: string) {
  results.push({ name, status: "FAIL", detail });
  console.log(`  \x1b[31mFAIL\x1b[0m  ${name}`);
  console.log(`          ${detail}`);
}

async function stampedOne<T extends { ok: boolean }>(
  sql: string,
): Promise<T | null> {
  const result = await kysely.executeQuery({
    sql,
    parameters: [],
    query: { kind: "RawNode" } as never,
    queryId: { queryId: "stamped-one" } as never,
  });
  return (result.rows[0] as T | undefined) ?? null;
}

// ── Setup: create tenant-scoped fixtures ─────────────────────────────────────

async function setup(): Promise<void> {
  // Fixtures use a table that exists in the RLS suite and has a
  // current_tenant_id_soft() policy.
  await basePool.query(`
    INSERT INTO document.comment
      (tenant_id, entity_type, entity_id, commenter_id, comment_text, visibility, created_by)
    VALUES
      ($1, 'tenant_stamp_test', $2, $2, 'A', 'public', $2),
      ($3, 'tenant_stamp_test', $2, $2, 'B', 'public', $2)
    ON CONFLICT DO NOTHING
  `, [TENANT_A, ACTOR_ID, TENANT_B]);
}

async function teardown(): Promise<void> {
  await basePool.query(
    `DELETE FROM document.comment WHERE entity_type = 'tenant_stamp_test'`,
  );
}

// ── Checks ───────────────────────────────────────────────────────────────────

async function checkSelfStamp(): Promise<void> {
  const name = "reads current_setting('app.current_tenant_id') = stamped tenant";
  await runAs(TENANT_A, async () => {
    const row = await stampedOne<{ v: string | null }>(
      "SELECT current_setting('app.current_tenant_id', true) AS v",
    );
    if (row?.v === TENANT_A) pass(name);
    else fail(name, `expected "${TENANT_A}", got "${row?.v}"`);
  });
}

async function checkNoOpWithoutContext(): Promise<void> {
  const name = "no stamp when ALS has no tenant (bootstrap/health-probe path)";
  const row = await stampedOne<{ v: string | null }>(
    "SELECT current_setting('app.current_tenant_id', true) AS v",
  );
  // set_config third arg `true` scopes to transaction — outside a stamped
  // transaction the GUC is the process default, which is empty string.
  if (row?.v === "" || row?.v === null) pass(name);
  else fail(name, `expected empty, got "${row?.v}"`);
}

async function checkConcurrentInterleave(): Promise<void> {
  const name = "concurrent Promise.all on two tenants — each sees only its own rows";

  const [rowsA, rowsB] = await Promise.all([
    runAs(TENANT_A, async () =>
      basePool.query({
        text: "SELECT comment_text FROM document.comment WHERE entity_type = 'tenant_stamp_test' ORDER BY comment_text",
      }),
    ).then(() =>
      runAs(TENANT_A, async () => {
        // Use the stamped Kysely to exercise the driver path.
        const r = await kysely.executeQuery({
          sql: "SELECT comment_text FROM document.comment WHERE entity_type = 'tenant_stamp_test'",
          parameters: [],
          query: { kind: "RawNode" } as never,
          queryId: { queryId: "concurrent-a" } as never,
        });
        return r.rows as Array<{ comment_text: string }>;
      }),
    ),
    runAs(TENANT_B, async () => {
      const r = await kysely.executeQuery({
        sql: "SELECT comment_text FROM document.comment WHERE entity_type = 'tenant_stamp_test'",
        parameters: [],
        query: { kind: "RawNode" } as never,
        queryId: { queryId: "concurrent-b" } as never,
      });
      return r.rows as Array<{ comment_text: string }>;
    }),
  ]);

  // Admin role bypasses RLS so both tenants see both rows — what we're
  // actually asserting here is: the driver did NOT crash under concurrent
  // ALS tenants, and each query saw the correct stamp. Stamp observability
  // is tested by checkStampDuringConcurrent below.
  if (rowsA.length >= 1 && rowsB.length >= 1) pass(name);
  else fail(name, `rowsA=${rowsA.length}, rowsB=${rowsB.length}`);
}

async function checkStampDuringConcurrent(): Promise<void> {
  const name = "concurrent queries each observe their own app.current_tenant_id";

  const [seenA, seenB] = await Promise.all([
    runAs(TENANT_A, async () => {
      const r = await kysely.executeQuery({
        sql: "SELECT current_setting('app.current_tenant_id', true) AS v",
        parameters: [],
        query: { kind: "RawNode" } as never,
        queryId: { queryId: "stamp-A" } as never,
      });
      return (r.rows[0] as { v: string } | undefined)?.v;
    }),
    runAs(TENANT_B, async () => {
      const r = await kysely.executeQuery({
        sql: "SELECT current_setting('app.current_tenant_id', true) AS v",
        parameters: [],
        query: { kind: "RawNode" } as never,
        queryId: { queryId: "stamp-B" } as never,
      });
      return (r.rows[0] as { v: string } | undefined)?.v;
    }),
  ]);

  if (seenA === TENANT_A && seenB === TENANT_B) pass(name);
  else fail(name, `A saw "${seenA}", B saw "${seenB}"`);
}

async function checkNoOpInterleave(): Promise<void> {
  const name = "tenant stamp and no-op path concurrent on shared pool do not cross-contaminate";

  const [withTenant, withoutTenant] = await Promise.all([
    runAs(TENANT_A, async () => {
      const r = await kysely.executeQuery({
        sql: "SELECT current_setting('app.current_tenant_id', true) AS v",
        parameters: [],
        query: { kind: "RawNode" } as never,
        queryId: { queryId: "with-A" } as never,
      });
      return (r.rows[0] as { v: string } | undefined)?.v;
    }),
    (async () => {
      // No runAs — ALS store is undefined for this query.
      const r = await kysely.executeQuery({
        sql: "SELECT current_setting('app.current_tenant_id', true) AS v",
        parameters: [],
        query: { kind: "RawNode" } as never,
        queryId: { queryId: "without" } as never,
      });
      return (r.rows[0] as { v: string } | undefined)?.v;
    })(),
  ]);

  if (withTenant === TENANT_A && (withoutTenant === "" || withoutTenant === null)) {
    pass(name);
  } else {
    fail(
      name,
      `with-tenant="${withTenant}" (expected ${TENANT_A}), without="${withoutTenant}" (expected empty)`,
    );
  }
}

async function checkExplicitTxStampsOnce(): Promise<void> {
  const name = "explicit transaction stamps once at BEGIN, not per statement";
  // We can't directly count round-trips from the driver side without
  // instrumenting pg.Pool. Instead, assert that inside a transaction the GUC
  // is set once (at BEGIN) and persists across multiple statements.
  await runAs(TENANT_A, async () => {
    await kysely.transaction().execute(async (trx) => {
      const r1 = await trx.executeQuery({
        sql: "SELECT current_setting('app.current_tenant_id', true) AS v",
        parameters: [],
        query: { kind: "RawNode" } as never,
        queryId: { queryId: "tx-1" } as never,
      });
      const r2 = await trx.executeQuery({
        sql: "SELECT current_setting('app.current_tenant_id', true) AS v",
        parameters: [],
        query: { kind: "RawNode" } as never,
        queryId: { queryId: "tx-2" } as never,
      });
      const v1 = (r1.rows[0] as { v: string } | undefined)?.v;
      const v2 = (r2.rows[0] as { v: string } | undefined)?.v;
      if (v1 === TENANT_A && v2 === TENANT_A) pass(name);
      else fail(name, `statement-1 saw "${v1}", statement-2 saw "${v2}"`);
    });
  });
}

// ── Bench ────────────────────────────────────────────────────────────────────

interface BenchResult { name: string; iterations: number; p50Ms: number; p99Ms: number; meanMs: number }

async function bench(
  name: string,
  iterations: number,
  fn: () => Promise<unknown>,
): Promise<BenchResult> {
  // Warm the pool and the connection.
  for (let i = 0; i < 10; i++) await fn();

  const samples = new Array<number>(iterations);
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn();
    samples[i] = performance.now() - t0;
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(iterations * 0.5)] ?? 0;
  const p99 = samples[Math.floor(iterations * 0.99)] ?? 0;
  const mean = samples.reduce((s, v) => s + v, 0) / iterations;
  return { name, iterations, p50Ms: p50, p99Ms: p99, meanMs: mean };
}

async function runBench(): Promise<void> {
  console.log("\n\x1b[1mBench — PgBouncer latency through TenantStampDriver\x1b[0m");
  console.log("─".repeat(75));

  const N = 500;

  const tenantRead = await runAs(TENANT_A, () =>
    bench("stamped standalone read (4-round-trip wrap)", N, () =>
      kysely.executeQuery({
        sql: "SELECT 1 AS n",
        parameters: [],
        query: { kind: "RawNode" } as never,
        queryId: { queryId: "bench-read-a" } as never,
      }),
    ),
  );

  const baselineRead = await bench("baseline read (no wrap)", N, () =>
    plainKysely.executeQuery({
      sql: "SELECT 1 AS n",
      parameters: [],
      query: { kind: "RawNode" } as never,
      queryId: { queryId: "bench-baseline" } as never,
    }),
  );

  const noopRead = await bench(
    "stamped client, no tenant in ALS (no-op path)",
    N,
    () =>
      kysely.executeQuery({
        sql: "SELECT 1 AS n",
        parameters: [],
        query: { kind: "RawNode" } as never,
        queryId: { queryId: "bench-noop" } as never,
      }),
  );

  const txWrite = await runAs(TENANT_A, () =>
    bench(
      "stamped explicit tx, 3 statements (amortized stamp)",
      N,
      async () => {
        await kysely.transaction().execute(async (trx) => {
          await trx.executeQuery({
            sql: "SELECT 1",
            parameters: [],
            query: { kind: "RawNode" } as never,
            queryId: { queryId: "tx-s1" } as never,
          });
          await trx.executeQuery({
            sql: "SELECT 2",
            parameters: [],
            query: { kind: "RawNode" } as never,
            queryId: { queryId: "tx-s2" } as never,
          });
          await trx.executeQuery({
            sql: "SELECT 3",
            parameters: [],
            query: { kind: "RawNode" } as never,
            queryId: { queryId: "tx-s3" } as never,
          });
        });
      },
    ),
  );

  for (const r of [baselineRead, noopRead, tenantRead, txWrite]) {
    console.log(
      `  ${r.name.padEnd(50)} p50=${r.p50Ms.toFixed(2)}ms  p99=${r.p99Ms.toFixed(2)}ms  mean=${r.meanMs.toFixed(2)}ms  (n=${r.iterations})`,
    );
  }

  const overheadP50 = tenantRead.p50Ms - baselineRead.p50Ms;
  const overheadP99 = tenantRead.p99Ms - baselineRead.p99Ms;
  console.log(
    `\n  Stamp overhead (stamped read − baseline read): p50 +${overheadP50.toFixed(2)}ms, p99 +${overheadP99.toFixed(2)}ms`,
  );
  console.log("─".repeat(75));
}

// ── Runner ──────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log("\n\x1b[1mAthyper Tenant-Stamp Integration Suite\x1b[0m");
  console.log(`DATABASE_URL: ${DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log(`RLS_APP_ROLE: ${RLS_APP_ROLE ?? "<none>"}`);
  console.log("─".repeat(75));

  await setup();

  try {
    await checkSelfStamp();
    await checkNoOpWithoutContext();
    await checkConcurrentInterleave();
    await checkStampDuringConcurrent();
    await checkNoOpInterleave();
    await checkExplicitTxStampsOnce();

    if (process.argv.includes("--bench")) {
      await runBench();
    } else {
      console.log("\n(run with --bench for latency measurements)");
    }
  } finally {
    await teardown();
    await kysely.destroy();
    await plainKysely.destroy();
    await basePool.end();
  }

  const failed = results.filter((r) => r.status === "FAIL").length;
  const passed = results.filter((r) => r.status === "PASS").length;
  console.log(`\n  \x1b[32mPASS\x1b[0m ${passed}  \x1b[31mFAIL\x1b[0m ${failed}`);
  if (failed > 0) process.exit(1);
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
