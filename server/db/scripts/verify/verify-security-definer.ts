#!/usr/bin/env tsx
/**
 * SECURITY DEFINER Verification Suite — Finding F9 (infra review April 2026)
 *
 * Audits every SECURITY DEFINER function in the database against the hardening
 * contract codified in server/db/sql/99_security/800_security_hardening.sql:
 *
 *   1. OWNER  — must be `athyperadmin`. A definer function runs with the
 *               owner's privileges, so an owner other than athyperadmin
 *               breaks the privilege-isolation intent.
 *   2. PUBLIC — must NOT have EXECUTE. When a new SECURITY DEFINER function
 *               is created without `REVOKE EXECUTE FROM PUBLIC`, any session
 *               can call it bypassing RLS. This is the exact failure mode
 *               F9 exists to catch.
 *   3. ROLE   — `athyperapp` must have EXECUTE. The runtime app role
 *               connects as athyperapp (NOBYPASSRLS); without this grant
 *               every call fails at runtime.
 *   4. SEARCH_PATH — the function must set `search_path=` explicitly
 *               (via `SET search_path = ...` on the function). Without it
 *               the function inherits the caller's search_path, which is a
 *               privilege-escalation vector: a caller could prepend a schema
 *               containing a trojan function with the same name as one the
 *               definer calls internally.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm --dir server/db run db:verify:secdef
 *
 * Exit code:
 *   0 — all SECURITY DEFINER functions pass all four checks
 *   1 — one or more functions failed a check OR the script errored
 *
 * Output:
 *   Per-function table (schema.function signature | owner | public | role | search_path)
 *   followed by a summary line. Failures are coloured red; passes green.
 *
 * System schemas (pg_*, information_schema, pg_toast) are excluded.
 * Operators and aggregates with prosecdef=true are included — this is
 * intentional, since they are equally exposed to the SQL privilege model.
 */

import postgres from "postgres";

// ── Configuration ─────────────────────────────────────────────────────────────

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

const EXPECTED_OWNER = process.env["SECDEF_EXPECTED_OWNER"]?.trim() || "athyperadmin";
const EXPECTED_GRANTEE = process.env["SECDEF_EXPECTED_GRANTEE"]?.trim() || "athyperapp";

// Guard rail: identifiers can't be parameterised in pg_has_function_privilege,
// so allow only safe chars. Mirrors verify-rls.ts:56.
for (const [name, value] of [["SECDEF_EXPECTED_OWNER", EXPECTED_OWNER], ["SECDEF_EXPECTED_GRANTEE", EXPECTED_GRANTEE]] as const) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    console.error(`ERROR: ${name} "${value}" is not a valid SQL identifier`);
    process.exit(1);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SecDefFunctionRow {
  schema_name:     string;
  function_name:   string;
  signature:       string;   // e.g. "master.fn_register_tenant(text, text, text, ...)"
  owner:           string;
  public_has_exec: boolean;
  role_has_exec:   boolean;  // EXPECTED_GRANTEE has EXECUTE
  has_search_path: boolean;
  proconfig:       string[] | null;
}

type Rule = "OWNER" | "PUBLIC" | "ROLE" | "SEARCH_PATH";

interface CheckResult {
  signature: string;
  status:    "PASS" | "FAIL";
  failures:  Rule[];           // list of the specific rule names that failed
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(s: string, n: number) { return s.padEnd(n, " "); }

function colorize(status: "PASS" | "FAIL") {
  return status === "PASS" ? `\x1b[32m${status}\x1b[0m` : `\x1b[31m${status}\x1b[0m`;
}

function ruleSymbol(passed: boolean) {
  return passed ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
}

// ── Core verifier ─────────────────────────────────────────────────────────────

async function loadFunctions(
  sql: ReturnType<typeof postgres>,
): Promise<SecDefFunctionRow[]> {
  // Use 0 (PUBLIC pseudo-role oid) for has_function_privilege's PUBLIC check.
  // Per postgres docs, grantee=0 in aclitem corresponds to PUBLIC and
  // has_function_privilege accepts 0 for that check.
  const rows = await sql<SecDefFunctionRow[]>`
    SELECT
      n.nspname                                               AS schema_name,
      p.proname                                               AS function_name,
      n.nspname || '.' || p.proname || '(' ||
        pg_get_function_identity_arguments(p.oid) || ')'      AS signature,
      r.rolname                                               AS owner,
      has_function_privilege(0, p.oid, 'EXECUTE')             AS public_has_exec,
      has_function_privilege(${EXPECTED_GRANTEE}, p.oid, 'EXECUTE') AS role_has_exec,
      EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
      )                                                       AS has_search_path,
      p.proconfig                                             AS proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles r     ON r.oid = p.proowner
    WHERE p.prosecdef = true
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname NOT LIKE 'pg_%'
    ORDER BY n.nspname, p.proname
  `;
  return rows;
}

function evaluate(row: SecDefFunctionRow): CheckResult {
  const failures: Rule[] = [];
  if (row.owner !== EXPECTED_OWNER)  failures.push("OWNER");
  if (row.public_has_exec)           failures.push("PUBLIC");
  if (!row.role_has_exec)            failures.push("ROLE");
  if (!row.has_search_path)          failures.push("SEARCH_PATH");
  return {
    signature: row.signature,
    status:    failures.length === 0 ? "PASS" : "FAIL",
    failures,
  };
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
  const sql = postgres(DATABASE_URL!, {
    max: 1,
    onnotice: () => {},
  });

  console.log("\n\x1b[1mAthyper SECURITY DEFINER Verification Suite\x1b[0m");
  console.log(`${"─".repeat(80)}`);
  console.log(`  Expected owner:   ${EXPECTED_OWNER}`);
  console.log(`  Expected grantee: ${EXPECTED_GRANTEE}`);
  console.log(`${"─".repeat(80)}\n`);

  let rows: SecDefFunctionRow[] = [];
  try {
    rows = await loadFunctions(sql);
  } catch (err) {
    console.error(`\x1b[31mERROR loading functions: ${String(err)}\x1b[0m`);
    await sql.end();
    process.exit(1);
  }

  if (rows.length === 0) {
    console.log("  \x1b[33m⚠  No SECURITY DEFINER functions found.\x1b[0m");
    console.log(
      "  \x1b[33m   If this is a fresh DB, run DDL migrations first:\x1b[0m"
    );
    console.log("  \x1b[33m     pnpm --filter @athyper/db run db:setup:ddl\x1b[0m");
    await sql.end();
    // Zero functions to audit is not a pass — make it explicit.
    process.exit(1);
  }

  // ── Header row ─────────────────────────────────────────────────────────────
  console.log(
    `  ${pad("SIG", 56)}  ${pad("OWN", 3)} ${pad("PUB", 3)} ${pad("ROL", 3)} ${pad("SP", 3)}  STATUS`
  );
  console.log(`  ${"─".repeat(78)}`);

  const results: CheckResult[] = [];
  for (const row of rows) {
    const result = evaluate(row);
    results.push(result);

    const sigStr = pad(
      row.signature.length > 54 ? row.signature.slice(0, 51) + "..." : row.signature,
      56,
    );
    const own = ruleSymbol(row.owner === EXPECTED_OWNER);
    const pub = ruleSymbol(!row.public_has_exec);
    const rol = ruleSymbol(row.role_has_exec);
    const sp  = ruleSymbol(row.has_search_path);

    console.log(`  ${sigStr}  ${own}   ${pub}   ${rol}   ${sp}    ${colorize(result.status)}`);

    if (result.status === "FAIL") {
      for (const rule of result.failures) {
        const detail = detailFor(rule, row);
        console.log(`         \x1b[31m↳ ${rule}: ${detail}\x1b[0m`);
      }
    }
  }

  await sql.end();

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  console.log(`\n${"─".repeat(80)}`);
  console.log(
    `  ${colorize("PASS")} ${passed}  ${colorize("FAIL")} ${failed}  \x1b[90m(total ${results.length})\x1b[0m`,
  );

  if (failed > 0) {
    console.log(
      `\n  \x1b[31mFix failures in server/db/ddl/security/800_security_hardening.sql\x1b[0m`
    );
    console.log(
      `  \x1b[90m  (ALTER FUNCTION ... OWNER TO ${EXPECTED_OWNER}; REVOKE EXECUTE FROM PUBLIC;\x1b[0m`
    );
    console.log(
      `  \x1b[90m   GRANT EXECUTE TO ${EXPECTED_GRANTEE}; ALTER FUNCTION ... SET search_path = ...)\x1b[0m`
    );
  }

  process.exit(failed > 0 ? 1 : 0);
}

function detailFor(rule: Rule, row: SecDefFunctionRow): string {
  switch (rule) {
    case "OWNER":       return `owned by '${row.owner}', expected '${EXPECTED_OWNER}'`;
    case "PUBLIC":      return `PUBLIC has EXECUTE — add REVOKE EXECUTE ON FUNCTION ${row.signature} FROM PUBLIC`;
    case "ROLE":        return `'${EXPECTED_GRANTEE}' lacks EXECUTE — add GRANT EXECUTE ON FUNCTION ${row.signature} TO ${EXPECTED_GRANTEE}`;
    case "SEARCH_PATH": return `no explicit search_path — add ALTER FUNCTION ${row.signature} SET search_path = ...`;
  }
}

run().catch((err) => {
  console.error(`\x1b[31mFATAL: ${String(err)}\x1b[0m`);
  process.exit(1);
});
