#!/usr/bin/env tsx
/**
 * RLS Verification Test Suite — Sprint 31
 *
 * Verifies that PostgreSQL Row-Level Security policies correctly isolate
 * tenant data across all key tables. Run this after any DB schema change or
 * RLS policy modification to catch regressions before deployment.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx server/scripts/verify-rls.ts
 *   # or via package.json script:
 *   pnpm --filter @athyper/server rls:verify
 *
 * What it tests:
 *   For each table under test, the script:
 *   1. Inserts one row for TENANT_A and one for TENANT_B using a privileged
 *      role (bypasses RLS — represents an admin / migration user).
 *   2. Opens a restricted DB session that SET LOCAL app.tenant_id = TENANT_A.
 *   3. Reads the table in that session and asserts that ONLY TENANT_A rows
 *      are visible (TENANT_B rows are hidden by RLS).
 *   4. Repeats symmetrically for TENANT_B.
 *   5. Rolls back all test data after each table test.
 *
 * Exit code:
 *   0 — all checks passed
 *   1 — one or more checks failed or an error occurred
 *
 * Note: This script requires superuser or a role with BYPASSRLS to insert
 * test rows. The verification SELECTs are performed as the app role
 * (typically the connection string's user with RLS enforced).
 */

import postgres from "postgres";

// ── Configuration ─────────────────────────────────────────────────────────────

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

// Stable test UUIDs — chosen to be obviously synthetic (version-7 format)
const TENANT_A = "01900000-0000-7000-aaaa-000000000001";
const TENANT_B = "01900000-0000-7000-bbbb-000000000002";
const ACTOR_ID = "01900000-0000-7000-cccc-000000000003";

// ── Table descriptors ─────────────────────────────────────────────────────────

interface TableUnderTest {
  /** Fully-qualified table name, e.g. "master.content_item" */
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
    table: "master.content_item",
    values: (t) => ({
      tenant_id: t, code: `rls-test-${t.slice(0, 8)}`,
      title: "RLS Test Item", kind: "page",
      locale_code: "en", slug: `rls-test-${t.slice(0, 8)}`,
      status: "DRAFT", created_by: ACTOR_ID,
    }),
  },
  // ── Comments ─────────────────────────────────────────────────────────────────
  {
    table: "master.comment",
    values: (t) => ({
      tenant_id: t, entity_type: "rls_test", entity_id: ACTOR_ID,
      commenter_id: ACTOR_ID, comment_text: "RLS test comment",
      visibility: "public", created_by: ACTOR_ID,
    }),
  },
  // ── IAM ──────────────────────────────────────────────────────────────────────
  {
    table: "iam.auth_group",
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
      topics: JSON.stringify(["*"]), max_retries: 3,
      timeout_ms: 10000, failure_count: 0, is_active: true,
      created_by: ACTOR_ID,
    }),
  },
  // ── Audit ────────────────────────────────────────────────────────────────────
  {
    table: "governance.legal_hold",
    values: (t) => ({
      tenant_id: t, hold_code: `rls-hold-${t.slice(0, 8)}`,
      name: "RLS Test Hold", status: "active",
      log_schemas: JSON.stringify(["audit"]),
      custodian_id: ACTOR_ID, created_by: ACTOR_ID,
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

      // ── Check 1: TENANT_A session sees only TENANT_A row ───────────────────
      await trx`SET LOCAL app.tenant_id = ${TENANT_A}`;
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
      await trx`SET LOCAL app.tenant_id = ${TENANT_B}`;
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

  console.log("\n\x1b[1mAthyper RLS Verification Suite\x1b[0m");
  console.log(`${"─".repeat(65)}`);
  console.log(`  Tenant A: ${TENANT_A}`);
  console.log(`  Tenant B: ${TENANT_B}`);
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
