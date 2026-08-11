#!/usr/bin/env tsx
/**
 * RLS Verification Test Suite — Sprint 31
 *
 * Verifies that PostgreSQL Row-Level Security policies correctly isolate
 * tenant data across all key tables. Run this after any DB schema change or
 * RLS policy modification to catch regressions before deployment.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx server/db/scripts/verify/verify-rls.ts
 *   # or via package.json script:
 *   pnpm --filter @athyper/server rls:verify
 *
 *   # CI mode — verify SELECTs as a non-superuser role with RLS enforced:
 *   DATABASE_URL=postgres://athyperadmin:... RLS_APP_ROLE=athyperapp_test \
 *     pnpm --dir server/db run db:verify:rls
 *
 * What it tests:
 *   For each table under test, the script:
 *   1. Inserts one row for TENANT_A and one for TENANT_B using the connection
 *      string's role (must be superuser or BYPASSRLS for the inserts).
 *   2. If RLS_APP_ROLE is set, SET ROLE to that role so the following SELECTs
 *      run under a non-superuser identity where RLS is enforced.
 *   3. Sets app.current_tenant_id = TENANT_A for the current transaction.
 *   4. Reads the table and asserts that ONLY TENANT_A rows are visible
 *      (TENANT_B rows are hidden by RLS).
 *   5. Repeats symmetrically for TENANT_B.
 *   6. Rolls back all test data after each table test.
 *
 * Exit code:
 *   0 — all checks passed
 *   1 — one or more checks failed or an error occurred
 *
 * Note: Without RLS_APP_ROLE, this runs against whatever user DATABASE_URL
 * authenticates as. If that user is a superuser, RLS is bypassed and the
 * test will incorrectly report PASS for tables that are not actually
 * protected. CI must set RLS_APP_ROLE=athyperapp_test to get a real signal.
 */

import postgres from "postgres";

// ── Configuration ─────────────────────────────────────────────────────────────

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

// Optional role to SET ROLE into before running verification SELECTs.
// When set, the DATABASE_URL role must be a member of this role (or a superuser).
// The role itself must have LOGIN and NOBYPASSRLS so policies are enforced.
const RLS_APP_ROLE = process.env["RLS_APP_ROLE"]?.trim() || null;

// Guard rail: identifiers can't be parameterized, so allow only safe chars.
if (RLS_APP_ROLE !== null && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(RLS_APP_ROLE)) {
  console.error(`ERROR: RLS_APP_ROLE "${RLS_APP_ROLE}" is not a valid SQL identifier`);
  process.exit(1);
}

// Stable test UUIDs — chosen to be obviously synthetic (version-7 format)
let TENANT_A = "";
let TENANT_B = "";
let ACTOR_ID = "";

// ── Table descriptors ─────────────────────────────────────────────────────────

interface TableUnderTest {
  /** Fully-qualified table name, e.g. "document.content_item" */
  table:           string;
  /** Minimal INSERT values. Must include tenant_id, id, created_by. */
  values: (tenantId: string) => Record<string, unknown>;
  /** Column to SELECT to confirm visibility (typically "id") */
  idColumn?:       string;
  /** Skip this table (e.g. requires FK constraint that's hard to satisfy) */
  skip?:           boolean;
  skipReason?:     string;
}

const TABLES_UNDER_TEST: TableUnderTest[] = [
  // ── CMS ──────────────────────────────────────────────────────────────────────
  {
    table: "document.content_item",
    values: (t) => ({
      tenant_id: t, code: `rls-test-${t.slice(0, 8)}`,
      title: "RLS Test Item", kind: "page",
      locale_code: "en", slug: `rls-test-${t.slice(0, 8)}`,
      status: "DRAFT", created_by: ACTOR_ID,
    }),
  },
  // ── Comments ─────────────────────────────────────────────────────────────────
  {
    table: "document.comment",
    values: (t) => ({
      tenant_id: t, entity_type: "rls_test", entity_id: ACTOR_ID,
      commenter_id: ACTOR_ID, comment_text: "RLS test comment",
      visibility: "public", created_by: ACTOR_ID,
    }),
  },
  // ── IAM ──────────────────────────────────────────────────────────────────────
  {
    table: "master.auth_group",
    values: (t) => ({
      tenant_id: t, code: `rls-grp-${t.slice(0, 8)}`,
      name: "RLS Test Group", status: "active", created_by: ACTOR_ID,
    }),
  },
  // ── Policy ───────────────────────────────────────────────────────────────────
  {
    table: "control.content_quota",
    values: (t) => ({
      tenant_id: t, kind: "rls_test", warn_at_pct: 80, is_active: true,
      created_by: ACTOR_ID,
    }),
  },
  // ── Finance ──────────────────────────────────────────────────────────────────
  {
    table: "document.workflow_request",
    skip: true,
    skipReason: "Requires FK to workflow_definition + template — too complex to satisfy inline",
    values: () => ({}),
  },
  // ── Event ────────────────────────────────────────────────────────────────────
  {
    table: "event.webhook_subscription",
    values: (t) => ({
      tenant_id: t, target_url: "https://example.com/hook",
      topics: ["*"], max_retries: 3,
      timeout_ms: 10000, failure_count: 0, is_active: true,
      created_by: ACTOR_ID,
    }),
  },
  // ── Audit ────────────────────────────────────────────────────────────────────
  {
    table: "governance.legal_hold",
    values: (t) => ({
      tenant_id: t, hold_name: "RLS Test Hold",
      hold_code: `rls-hold-${t.slice(0, 8)}`, status: "active",
      custodian_id: ACTOR_ID, scope_log_schemas: ["log"], created_by: ACTOR_ID,
    }),
  },
];

// ── Result types ───────────────────────────────────────────────────────────────

interface CheckResult {
  table:      string;
  status:     "PASS" | "FAIL" | "SKIP" | "ERROR";
  message?:   string;
  durationMs: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(s: string, n: number) { return s.padEnd(n, " "); }

function colorize(status: CheckResult["status"]) {
  switch (status) {
    case "PASS":  return `\x1b[32m${status}\x1b[0m`;
    case "FAIL":  return `\x1b[31m${status}\x1b[0m`;
    case "SKIP":  return `\x1b[33m${status}\x1b[0m`;
    case "ERROR": return `\x1b[35m${status}\x1b[0m`;
  }
  return status;
}

// ── Core verifier ─────────────────────────────────────────────────────────────

async function verifyTable(
  sql: ReturnType<typeof postgres>,
  descriptor: TableUnderTest,
): Promise<CheckResult> {
  const { table, values, idColumn = "id", skip, skipReason } = descriptor;
  const start = Date.now();

  if (skip) {
    return { table, status: "SKIP", message: skipReason, durationMs: 0 };
  }

  try {
    // All operations in a single transaction; rolled back at the end
    await sql.begin(async (trx) => {
      // Insert test rows for both tenants using BYPASSRLS (privileged connection)
      const rowA = await trx`
        INSERT INTO ${trx.unsafe(table)} ${trx(values(TENANT_A))}
        RETURNING ${trx.unsafe(idColumn)}
      `;
      const idA = rowA[0]?.[idColumn as keyof typeof rowA[0]];

      const rowB = await trx`
        INSERT INTO ${trx.unsafe(table)} ${trx(values(TENANT_B))}
        RETURNING ${trx.unsafe(idColumn)}
      `;
      const idB = rowB[0]?.[idColumn as keyof typeof rowB[0]];

      if (!idA || !idB) throw new Error("INSERT did not return an id");

      // Drop admin/BYPASSRLS privilege before running the RLS checks — otherwise
      // a superuser connection silently passes every test. RLS_APP_ROLE is
      // validated as an identifier above, so interpolation here is safe.
      if (RLS_APP_ROLE !== null) {
        await trx.unsafe(`SET LOCAL ROLE ${RLS_APP_ROLE}`);
      }

      // ── Check 1: TENANT_A session sees only TENANT_A row ───────────────────
      await trx`SELECT set_config('app.current_tenant_id', ${TENANT_A}, true)`;
      const seenByA = await trx`
        SELECT ${trx.unsafe(idColumn)} FROM ${trx.unsafe(table)}
        WHERE tenant_id = ${TENANT_A} OR tenant_id = ${TENANT_B}
      `;
      const idsSeenByA = seenByA.map((r) => String(r[idColumn as keyof typeof r]));

      if (idsSeenByA.includes(String(idB))) {
        throw new Error(
          `TENANT_A session can see TENANT_B row (${idB}) — RLS NOT enforced on ${table}`
        );
      }
      if (!idsSeenByA.includes(String(idA))) {
        throw new Error(
          `TENANT_A session cannot see its own row (${idA}) — RLS over-restrictive on ${table}`
        );
      }

      // ── Check 2: TENANT_B session sees only TENANT_B row ───────────────────
      await trx`SELECT set_config('app.current_tenant_id', ${TENANT_B}, true)`;
      const seenByB = await trx`
        SELECT ${trx.unsafe(idColumn)} FROM ${trx.unsafe(table)}
        WHERE tenant_id = ${TENANT_A} OR tenant_id = ${TENANT_B}
      `;
      const idsSeenByB = seenByB.map((r) => String(r[idColumn as keyof typeof r]));

      if (idsSeenByB.includes(String(idA))) {
        throw new Error(
          `TENANT_B session can see TENANT_A row (${idA}) — RLS NOT enforced on ${table}`
        );
      }
      if (!idsSeenByB.includes(String(idB))) {
        throw new Error(
          `TENANT_B session cannot see its own row (${idB}) — RLS over-restrictive on ${table}`
        );
      }

      // Rollback via exception to clean up test data automatically
      throw new Error("__rollback__");
    });
    return {
      table,
      status: "ERROR",
      message: "RLS verification transaction completed without rollback",
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "__rollback__") {
      // Expected rollback path — test passed
      return { table, status: "PASS", durationMs: Date.now() - start };
    }
    if (msg.startsWith("TENANT_A") || msg.startsWith("TENANT_B")) {
      return { table, status: "FAIL", message: msg, durationMs: Date.now() - start };
    }
    return { table, status: "ERROR", message: msg, durationMs: Date.now() - start };
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
  const sql = postgres(DATABASE_URL!, {
    // Use a single connection to keep SET LOCAL session variables scoped
    max:         1,
    // app_role must have RLS enforced (not BYPASSRLS)
    // For BYPASSRLS inserts in the same session, we rely on the transaction
    // isolation — real policy enforcement happens via SET LOCAL.
    onnotice:    () => {},
  });

  const tenantRows = await sql<{ id: string }[]>`
    SELECT id
    FROM master.tenant
    WHERE status = 'active' AND code <> 'system'
    ORDER BY code
    LIMIT 2
  `;
  if (tenantRows.length < 2) {
    await sql.end();
    throw new Error("RLS verification requires at least two active non-system tenants");
  }
  TENANT_A = tenantRows[0].id;
  TENANT_B = tenantRows[1].id;

  const actorRows = await sql<{ id: string }[]>`
    SELECT id
    FROM master.principal
    WHERE tenant_id = ${TENANT_A} AND status = 'active'
    ORDER BY id
    LIMIT 1
  `;
  if (actorRows.length < 1) {
    await sql.end();
    throw new Error(`RLS verification requires an active principal for tenant ${TENANT_A}`);
  }
  ACTOR_ID = actorRows[0].id;

  console.log("\n\x1b[1mAthyper RLS Verification Suite\x1b[0m");
  console.log(`${"─".repeat(65)}`);
  console.log(`  Tenant A:   ${TENANT_A}`);
  console.log(`  Tenant B:   ${TENANT_B}`);
  console.log(
    `  RLS role:   ${RLS_APP_ROLE ?? "\x1b[33m<none — using DATABASE_URL role>\x1b[0m"}`
  );
  if (RLS_APP_ROLE === null) {
    console.log(
      `  \x1b[33m⚠  Without RLS_APP_ROLE, a superuser DATABASE_URL will bypass RLS\x1b[0m`
    );
    console.log(
      `  \x1b[33m   and all tests will report PASS even when policies are not enforced.\x1b[0m`
    );
  }
  console.log(`${"─".repeat(65)}\n`);

  const results: CheckResult[] = [];

  for (const descriptor of TABLES_UNDER_TEST) {
    const result = await verifyTable(sql, descriptor);
    results.push(result);

    const statusStr = colorize(result.status);
    const tableStr  = pad(result.table, 40);
    const durStr    = result.durationMs > 0 ? `${result.durationMs}ms` : "  -";
    console.log(`  ${statusStr}  ${tableStr}  ${durStr}`);
    if (result.message && result.status !== "SKIP") {
      console.log(`         \x1b[31m↳ ${result.message}\x1b[0m`);
    }
    if (result.message && result.status === "SKIP") {
      console.log(`         \x1b[33m↳ ${result.message}\x1b[0m`);
    }
  }

  await sql.end();

  const passed  = results.filter((r) => r.status === "PASS").length;
  const failed  = results.filter((r) => r.status === "FAIL").length;
  const errored = results.filter((r) => r.status === "ERROR").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;

  console.log(`\n${"─".repeat(65)}`);
  console.log(
    `  ${colorize("PASS")} ${passed}  ` +
    `${colorize("FAIL")} ${failed}  ` +
    `${colorize("ERROR")} ${errored}  ` +
    `\x1b[33mSKIP\x1b[0m ${skipped}`
  );
  console.log(`${"─".repeat(65)}\n`);

  if (failed > 0 || errored > 0) {
    console.error("\x1b[31mRLS verification FAILED — see errors above\x1b[0m\n");
    process.exit(1);
  }

  console.log("\x1b[32mAll RLS checks passed\x1b[0m\n");
  process.exit(0);
}

void run();
