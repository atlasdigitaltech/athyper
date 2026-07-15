#!/usr/bin/env tsx
/**
 * RLS Coverage Verification (CI gate)
 *
 * Asserts that every tenant-scoped table is hardened with:
 *
 *   1. ROW LEVEL SECURITY enabled AND forced (an athyperadmin BYPASS check
 *      via FORCE is the only thing that stops the schema owner from leaking
 *      across tenants in a misbehaving service).
 *   2. At least one SELECT policy whose USING expression contains the explicit
 *      `current_tenant_id_soft() IS NOT NULL AND tenant_id = ...` guard
 *      (intent-explicit fail-closed predicate; see Phase 2 of the auth
 *      hardening build report).
 *   3. Write policies (FOR INSERT/UPDATE/DELETE/ALL by non-admin role) either
 *      use the strict `current_tenant_id()` predicate (which raises on NULL)
 *      or include the same IS NOT NULL guard, AND specify a WITH CHECK on
 *      every UPDATE/ALL.
 *
 * "Tenant-scoped" is defined as: schema ∈ {master, control, document, event,
 * governance, ledger, log, snapshot} AND the table has a column named
 * `tenant_id`. Tables in `shared` (global reference data) are explicitly
 * skipped.
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/verify-rls.ts
 *
 *   # JSON output for CI:
 *   npx tsx server/scripts/verify-rls.ts --json
 *
 * Exit code:
 *   0 — every tenant-scoped table is covered
 *   1 — at least one table or policy fails verification
 */

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

const JSON_OUTPUT = process.argv.includes("--json");

const TENANT_SCOPED_SCHEMAS = [
  "master",
  "control",
  "document",
  "event",
  "governance",
  "ledger",
  "log",
  "snapshot",
] as const;

const GUARD_PATTERN_SOFT =
  /shared\.current_tenant_id_soft\(\)\s+IS\s+NOT\s+NULL\s+AND\s+tenant_id\s*=\s*shared\.current_tenant_id_soft\(\)/i;
const STRICT_TENANT_PATTERN = /tenant_id\s*=\s*shared\.current_tenant_id\(\)/i;

interface TableCoverage {
  readonly schema: string;
  readonly table: string;
  readonly hasTenantIdColumn: boolean;
  readonly rlsEnabled: boolean;
  readonly rlsForced: boolean;
  readonly policies: ReadonlyArray<{
    name: string;
    command: string;
    roles: string[];
    usingExpression: string | null;
    checkExpression: string | null;
  }>;
}

interface Finding {
  readonly schema: string;
  readonly table: string;
  readonly check: string;
  readonly detail: string;
}

async function loadCoverage(pool: pg.Pool): Promise<TableCoverage[]> {
  const tables = await pool.query<{
    schemaname: string;
    tablename: string;
    has_tenant_id: boolean;
    rls_enabled: boolean;
    rls_forced: boolean;
  }>(
    `
    SELECT
      n.nspname                                                    AS schemaname,
      c.relname                                                    AS tablename,
      EXISTS (
        SELECT 1 FROM pg_attribute a
         WHERE a.attrelid = c.oid
           AND a.attname = 'tenant_id'
           AND NOT a.attisdropped
      )                                                            AS has_tenant_id,
      c.relrowsecurity                                             AS rls_enabled,
      c.relforcerowsecurity                                        AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = ANY ($1)
    ORDER BY n.nspname, c.relname
    `,
    [TENANT_SCOPED_SCHEMAS as unknown as string[]],
  );

  const policies = await pool.query<{
    schemaname: string;
    tablename: string;
    policyname: string;
    cmd: string;
    roles: string[];
    qual: string | null;
    with_check: string | null;
  }>(
    `
    SELECT schemaname, tablename, policyname, cmd, roles::text[] AS roles, qual, with_check
      FROM pg_policies
     WHERE schemaname = ANY ($1)
    `,
    [TENANT_SCOPED_SCHEMAS as unknown as string[]],
  );

  const policyByTable = new Map<string, TableCoverage["policies"][number][]>();
  for (const row of policies.rows) {
    const key = `${row.schemaname}.${row.tablename}`;
    const entry = {
      name: row.policyname,
      command: row.cmd,
      roles: row.roles ?? [],
      usingExpression: row.qual,
      checkExpression: row.with_check,
    };
    const list = policyByTable.get(key);
    if (list) list.push(entry);
    else policyByTable.set(key, [entry]);
  }

  return tables.rows
    .filter((row) => row.has_tenant_id)
    .map((row) => ({
      schema: row.schemaname,
      table: row.tablename,
      hasTenantIdColumn: row.has_tenant_id,
      rlsEnabled: row.rls_enabled,
      rlsForced: row.rls_forced,
      policies: policyByTable.get(`${row.schemaname}.${row.tablename}`) ?? [],
    }));
}

function isNonAdminRole(roles: readonly string[]): boolean {
  if (roles.length === 0) return true; // PUBLIC
  return !roles.every((r) => r.toLowerCase() === "athyperadmin");
}

function verifyTable(table: TableCoverage): Finding[] {
  const findings: Finding[] = [];

  if (!table.rlsEnabled) {
    findings.push({
      schema: table.schema,
      table: table.table,
      check: "rls_enabled",
      detail: "ROW LEVEL SECURITY is not enabled on a tenant-scoped table",
    });
  }
  if (!table.rlsForced) {
    findings.push({
      schema: table.schema,
      table: table.table,
      check: "rls_forced",
      detail: "FORCE ROW LEVEL SECURITY is not set — schema-owner queries bypass",
    });
  }

  const selectPolicies = table.policies.filter(
    (p) => p.command === "SELECT" || p.command === "ALL",
  );
  const tenantSelectPolicy = selectPolicies.find(
    (p) =>
      isNonAdminRole(p.roles)
      && p.usingExpression
      && GUARD_PATTERN_SOFT.test(p.usingExpression),
  );
  if (!tenantSelectPolicy) {
    findings.push({
      schema: table.schema,
      table: table.table,
      check: "guard_predicate",
      detail:
        "No non-admin SELECT/ALL policy includes the explicit "
        + "`current_tenant_id_soft() IS NOT NULL AND tenant_id = current_tenant_id_soft()` guard",
    });
  }

  // Every UPDATE/ALL write policy by a non-admin role must include WITH CHECK.
  for (const policy of table.policies) {
    if (policy.command !== "UPDATE" && policy.command !== "ALL") continue;
    if (!isNonAdminRole(policy.roles)) continue;
    if (!policy.checkExpression) {
      findings.push({
        schema: table.schema,
        table: table.table,
        check: "write_with_check",
        detail: `${policy.command} policy "${policy.name}" is missing WITH CHECK`,
      });
    } else {
      // Write predicates must use either the strict variant or the soft+guard.
      const ok =
        STRICT_TENANT_PATTERN.test(policy.checkExpression)
        || GUARD_PATTERN_SOFT.test(policy.checkExpression);
      if (!ok) {
        findings.push({
          schema: table.schema,
          table: table.table,
          check: "write_predicate_strict",
          detail:
            `${policy.command} policy "${policy.name}" WITH CHECK does not use `
            + "current_tenant_id() (strict) or the soft+guard predicate",
        });
      }
    }
  }

  return findings;
}

async function run(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
  try {
    const coverage = await loadCoverage(pool);
    const allFindings: Finding[] = [];
    for (const table of coverage) {
      for (const f of verifyTable(table)) {
        allFindings.push(f);
      }
    }

    if (JSON_OUTPUT) {
      console.log(JSON.stringify(
        {
          schemaVersion: 1,
          kind: "athyper.release.evidence",
          artifact: "rlsVerification",
          passed: allFindings.length === 0,
          tablesScanned: coverage.length,
          findings: allFindings,
        },
        null,
        2,
      ));
    } else {
      console.log(`\n\x1b[1mRLS coverage — ${coverage.length} tenant-scoped tables scanned\x1b[0m`);
      console.log("─".repeat(75));
      if (allFindings.length === 0) {
        console.log("  \x1b[32mOK\x1b[0m  every tenant-scoped table is hardened");
      } else {
        for (const f of allFindings) {
          console.log(`  \x1b[31mFAIL\x1b[0m  ${f.schema}.${f.table}  ${f.check}`);
          console.log(`        ${f.detail}`);
        }
        console.log(`\n  ${allFindings.length} finding(s) across ${new Set(allFindings.map((f) => `${f.schema}.${f.table}`)).size} table(s)`);
      }
    }

    if (allFindings.length > 0) process.exit(1);
  } finally {
    await pool.end();
  }
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
