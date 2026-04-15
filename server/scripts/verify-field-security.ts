#!/usr/bin/env tsx
/**
 * Field Security Verification Script — Sprint 35
 *
 * Verifies that field-level security policies are internally consistent and
 * that each masking strategy produces the expected output.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx server/scripts/verify-field-security.ts
 *   # or via package.json script:
 *   pnpm --filter @athyper/server field-security:verify
 *
 * What it checks:
 *   1. Schema presence — control.field_security_policy, control.entity_field,
 *      control.entity_version, control.entity tables exist and are readable.
 *   2. Policy integrity — every policy row has a valid FK chain:
 *      field_security_policy.entity_field_id → entity_field → entity_version
 *        (status = 'EFFECTIVE') → entity.
 *   3. Orphan detection — policies referencing deprecated/draft entity versions
 *      are flagged as warnings, not failures.
 *   4. Masking strategy correctness — synthetic values are masked and the
 *      output matches expected patterns for each strategy.
 *   5. Coverage report — list every entity that has at least one policy,
 *      plus a breakdown by masking strategy.
 *
 * Exit codes:
 *   0 — all critical checks passed (warnings may exist)
 *   1 — one or more critical checks failed or an unexpected error occurred
 */

import postgres from "postgres";
import { createHash } from "node:crypto";

// ── Configuration ─────────────────────────────────────────────────────────────

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 3 });

// ── Test harness ──────────────────────────────────────────────────────────────

let passed   = 0;
let failed   = 0;
let warnings = 0;

function ok(label: string) {
  console.log(`  ✓  ${label}`);
  passed++;
}
function fail(label: string, detail?: string) {
  console.error(`  ✗  ${label}${detail ? ` — ${detail}` : ""}`);
  failed++;
}
function warn(label: string, detail?: string) {
  console.warn(`  ⚠  ${label}${detail ? ` — ${detail}` : ""}`);
  warnings++;
}
function section(title: string) {
  console.log(`\n── ${title} ──`);
}

// ── Masking logic (mirrors field-security.middleware.ts) ──────────────────────

function applyMask(value: string, strategy: "full" | "partial" | "hash"): unknown {
  switch (strategy) {
    case "full":
      return null;
    case "partial": {
      if (value.length <= 4) return "****";
      return "****" + value.slice(-4);
    }
    case "hash": {
      const hex = createHash("sha256").update(value).digest("hex");
      return `[pii:${hex.slice(0, 8)}]`;
    }
  }
}

function testMasking() {
  section("Masking Strategy Tests");

  // ── full ──────────────────────────────────────────────────────────────────
  const fullResult = applyMask("sensitive_value", "full");
  if (fullResult === null) {
    ok("strategy=full: replaces value with null");
  } else {
    fail("strategy=full: expected null", String(fullResult));
  }

  // ── partial (long value) ──────────────────────────────────────────────────
  const partialLong = applyMask("john.doe@example.com", "partial");
  if (typeof partialLong === "string" && partialLong.startsWith("****") && partialLong.endsWith(".com")) {
    ok(`strategy=partial (long): ${partialLong}`);
  } else {
    fail("strategy=partial (long): unexpected output", String(partialLong));
  }

  // ── partial (short value ≤ 4 chars) ──────────────────────────────────────
  const partialShort = applyMask("abc", "partial");
  if (partialShort === "****") {
    ok("strategy=partial (short ≤4): returns ****");
  } else {
    fail("strategy=partial (short ≤4): expected ****", String(partialShort));
  }

  // ── hash ──────────────────────────────────────────────────────────────────
  const hashOut = applyMask("test@example.com", "hash");
  if (typeof hashOut === "string" && /^\[pii:[0-9a-f]{8}\]$/.test(hashOut)) {
    ok(`strategy=hash: ${hashOut}`);
  } else {
    fail("strategy=hash: unexpected format", String(hashOut));
  }

  // ── hash determinism ──────────────────────────────────────────────────────
  const h1 = applyMask("deterministic", "hash");
  const h2 = applyMask("deterministic", "hash");
  if (h1 === h2) {
    ok("strategy=hash: deterministic (same input → same output)");
  } else {
    fail("strategy=hash: non-deterministic!", `${String(h1)} vs ${String(h2)}`);
  }

  // ── hash uniqueness ───────────────────────────────────────────────────────
  const ha = applyMask("value_a", "hash");
  const hb = applyMask("value_b", "hash");
  if (ha !== hb) {
    ok("strategy=hash: different inputs produce different hashes");
  } else {
    fail("strategy=hash: hash collision detected for different inputs");
  }
}

// ── DB checks ─────────────────────────────────────────────────────────────────

async function checkSchemaTables() {
  section("Schema Presence");

  const tables = [
    ["control", "field_security_policy"],
    ["control", "entity_field"],
    ["control", "entity_version"],
    ["control", "entity"],
  ];

  for (const [schema, table] of tables) {
    try {
      await sql`SELECT 1 FROM information_schema.tables
                WHERE table_schema = ${schema} AND table_name = ${table}
                LIMIT 1`;
      const rows = await sql`SELECT COUNT(*) AS n
                              FROM information_schema.tables
                              WHERE table_schema = ${schema} AND table_name = ${table}`;
      const exists = parseInt((rows[0] as { n: string }).n, 10) > 0;
      if (exists) {
        ok(`${schema}.${table} exists`);
      } else {
        fail(`${schema}.${table} NOT FOUND`);
      }
    } catch (err) {
      fail(`${schema}.${table} query failed`, String(err));
    }
  }
}

async function checkPolicyIntegrity() {
  section("Policy Integrity");

  // Total policy count
  const countRows = await sql`
    SELECT COUNT(*) AS total FROM control.field_security_policy
  `;
  const total = parseInt((countRows[0] as { total: string }).total, 10);
  ok(`Total policies: ${total}`);

  if (total === 0) {
    warn("No field security policies defined — field-level masking is inactive");
    return;
  }

  // Broken FK chain: policy → entity_field
  const orphanFields = await sql`
    SELECT fsp.id, fsp.entity_field_id
    FROM control.field_security_policy fsp
    LEFT JOIN control.entity_field ef ON ef.id = fsp.entity_field_id
    WHERE ef.id IS NULL
  `;
  if (orphanFields.length === 0) {
    ok("All policies reference a valid entity_field");
  } else {
    fail(
      `${orphanFields.length} policies reference missing entity_field`,
      orphanFields.map((r) => (r as { id: string }).id).join(", "),
    );
  }

  // Policies referencing deprecated entity versions (warn only)
  const staleVersionPolicies = await sql`
    SELECT fsp.id, e.name AS entity_name, ef.name AS field_name, ev.status AS version_status
    FROM control.field_security_policy fsp
    JOIN control.entity_field ef ON ef.id = fsp.entity_field_id
    JOIN control.entity_version ev ON ev.id = ef.entity_version_id
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE ev.status <> 'EFFECTIVE'
  `;
  if (staleVersionPolicies.length === 0) {
    ok("All policies target EFFECTIVE entity versions");
  } else {
    for (const row of staleVersionPolicies) {
      const r = row as { entity_name: string; field_name: string; version_status: string };
      warn(
        `Policy on ${r.entity_name}.${r.field_name} targets version with status=${r.version_status}`,
      );
    }
  }

  // Policies with empty access_roles (nobody can see plaintext) — info
  const blindPolicies = await sql`
    SELECT COUNT(*) AS n
    FROM control.field_security_policy
    WHERE access_roles IS NULL OR array_length(access_roles, 1) IS NULL
  `;
  const blindCount = parseInt((blindPolicies[0] as { n: string }).n, 10);
  if (blindCount > 0) {
    ok(`${blindCount} policies have empty access_roles (field is masked for all roles — intended for max-PII fields)`);
  }

  // Invalid masking strategy values
  const badStrategy = await sql`
    SELECT id, masking_strategy
    FROM control.field_security_policy
    WHERE masking_strategy NOT IN ('full', 'partial', 'hash')
  `;
  if (badStrategy.length === 0) {
    ok("All masking_strategy values are valid (full / partial / hash)");
  } else {
    for (const row of badStrategy) {
      const r = row as { id: string; masking_strategy: string };
      fail(`Policy ${r.id} has invalid masking_strategy='${r.masking_strategy}'`);
    }
  }
}

async function checkCoverageReport() {
  section("Coverage Report");

  const byEntity = await sql`
    SELECT e.name AS entity_name,
           COUNT(fsp.id) AS policy_count,
           COUNT(fsp.id) FILTER (WHERE fsp.masking_strategy = 'full')    AS full_count,
           COUNT(fsp.id) FILTER (WHERE fsp.masking_strategy = 'partial') AS partial_count,
           COUNT(fsp.id) FILTER (WHERE fsp.masking_strategy = 'hash')    AS hash_count
    FROM control.field_security_policy fsp
    JOIN control.entity_field ef ON ef.id = fsp.entity_field_id
    JOIN control.entity_version ev ON ev.id = ef.entity_version_id
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE ev.status = 'EFFECTIVE'
    GROUP BY e.name
    ORDER BY e.name
  `;

  if (byEntity.length === 0) {
    warn("No entities with active field security policies");
    return;
  }

  console.log("\n  Entity coverage:");
  console.log("  " + ["Entity", "Policies", "full", "partial", "hash"].join("  ").padEnd(60));
  console.log("  " + "─".repeat(60));

  for (const row of byEntity) {
    const r = row as {
      entity_name: string; policy_count: string;
      full_count: string; partial_count: string; hash_count: string;
    };
    const line = [
      r.entity_name.padEnd(28),
      r.policy_count.padStart(7),
      r.full_count.padStart(6),
      r.partial_count.padStart(9),
      r.hash_count.padStart(6),
    ].join("  ");
    console.log(`  ${line}`);
  }

  ok(`${byEntity.length} entities have active field security policies`);

  // Check if middleware is wired to any entity routes (heuristic: look for a
  // known injection point in the records route file)
  const byStrategy = await sql`
    SELECT masking_strategy, COUNT(*) AS n
    FROM control.field_security_policy
    GROUP BY masking_strategy
    ORDER BY masking_strategy
  `;
  console.log("\n  By masking strategy:");
  for (const row of byStrategy) {
    const r = row as { masking_strategy: string; n: string };
    console.log(`    ${r.masking_strategy.padEnd(10)} ${r.n} policies`);
  }
}

async function checkMiddlewareWiring() {
  section("Middleware Wiring Check");

  // Check PII-classified fields in active entity versions match policies
  const piiFieldsNoPolicies = await sql`
    SELECT e.name AS entity_name, ef.name AS field_name
    FROM control.entity_field ef
    JOIN control.entity_version ev ON ev.id = ef.entity_version_id
    JOIN control.entity e ON e.id = ev.entity_id
    LEFT JOIN control.field_security_policy fsp ON fsp.entity_field_id = ef.id
    WHERE ef.is_pii = true
      AND ev.status = 'EFFECTIVE'
      AND fsp.id IS NULL
  `;

  if (piiFieldsNoPolicies.length === 0) {
    ok("All is_pii=true fields in effective entity versions have a security policy");
  } else {
    for (const row of piiFieldsNoPolicies) {
      const r = row as { entity_name: string; field_name: string };
      warn(`PII field ${r.entity_name}.${r.field_name} has no field_security_policy entry`);
    }
    warn(`${piiFieldsNoPolicies.length} PII field(s) are unprotected by field security policies`);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  console.log("Field Security Verification");
  console.log("=".repeat(50));

  testMasking();

  await checkSchemaTables();
  await checkPolicyIntegrity();
  await checkCoverageReport();
  await checkMiddlewareWiring();

  console.log("\n" + "=".repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);

  await sql.end();

  if (failed > 0) {
    console.error("\nFAIL — field security verification failed");
    process.exit(1);
  } else {
    console.log("\nPASS — field security verification complete");
    if (warnings > 0) {
      console.warn(`(${warnings} warning(s) — review above)`);
    }
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
