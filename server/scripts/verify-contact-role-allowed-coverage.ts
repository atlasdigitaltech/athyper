#!/usr/bin/env tsx
/**
 * Contact-Role Allowed-Coverage Verifier
 *
 * Asserts that every contact_link row in the database is using a purpose value
 * permitted by its owner_type.allowed_contact_purposes whitelist. Acts as the
 * advisory enforcement of the master.owner_type matrix without promoting the
 * array to a runtime CHECK constraint.
 *
 * Companion to: verify-address-role-allowed-coverage.ts (not yet written;
 * follows the same pattern when address parity is needed).
 *
 * What it checks:
 *   1. Vocabulary integrity: every contact_link.purpose value exists in the
 *      master.contact_link_purpose lookup domain (catches typos / stale data).
 *   2. Owner-type containment: every (owner_type, purpose) pair is permitted
 *      by master.owner_type.allowed_contact_purposes for that owner_type.
 *   3. Auth-purpose qualifier invariant: rows with purpose in
 *      ('login','recovery','mfa','verification') MUST have role_qualifier IS NULL.
 *      (Enforced by contact_link_auth_no_qualifier_chk CHECK; this verifier
 *      is the regression test for the constraint.)
 *   4. Role-qualifier soft validation: if role_qualifier IS NOT NULL, it should
 *      exist in master.contact_role_qualifier lookup. (Soft — warns, not fails,
 *      since free-text is allowed.)
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *   npx tsx server/scripts/verify-contact-role-allowed-coverage.ts
 *
 * Exit code:
 *   0 — all checks passed
 *   1 — any hard-fail check failed
 */

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  details?: string;
  rows?: Array<Record<string, unknown>>;
}

const results: CheckResult[] = [];

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    await checkPurposeVocabulary(pool);
    await checkOwnerTypeContainment(pool);
    await checkAuthQualifierInvariant(pool);
    await checkRoleQualifierSoftValidation(pool);
  } finally {
    await pool.end();
  }

  // Report
  console.log("\n──────────────────────────────────────────────────────");
  console.log(" Contact-Role Allowed-Coverage Verifier");
  console.log("──────────────────────────────────────────────────────");

  let failures = 0;
  let warnings = 0;
  for (const r of results) {
    const symbol = r.status === "pass" ? "✓" : r.status === "warn" ? "⚠" : "✗";
    console.log(`  ${symbol}  ${r.name}`);
    if (r.details) console.log(`        ${r.details}`);
    if (r.rows && r.rows.length > 0) {
      for (const row of r.rows.slice(0, 10)) {
        console.log(`        ${JSON.stringify(row)}`);
      }
      if (r.rows.length > 10) {
        console.log(`        … and ${r.rows.length - 10} more`);
      }
    }
    if (r.status === "fail") failures += 1;
    if (r.status === "warn") warnings += 1;
  }
  console.log("──────────────────────────────────────────────────────");
  console.log(
    ` ${results.length} check(s) — ${failures} failure(s), ${warnings} warning(s)`,
  );
  console.log("──────────────────────────────────────────────────────\n");

  process.exit(failures > 0 ? 1 : 0);
}

// ── Check 1: vocabulary integrity ───────────────────────────────────────────
async function checkPurposeVocabulary(pool: pg.Pool): Promise<void> {
  const sql = `
    SELECT DISTINCT cl.purpose
      FROM master.contact_link cl
     WHERE cl.purpose IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM control.lookup_value lv
          WHERE lv.domain_code = 'master.contact_link_purpose'
            AND lv.code = cl.purpose
            AND lv.tenant_id IS NULL
       );
  `;
  const r = await pool.query(sql);
  if (r.rowCount === 0) {
    results.push({
      name: "vocabulary integrity (purpose values exist in lookup)",
      status: "pass",
    });
  } else {
    results.push({
      name: "vocabulary integrity (purpose values exist in lookup)",
      status: "fail",
      details:
        "contact_link rows use purpose values not present in master.contact_link_purpose seed:",
      rows: r.rows,
    });
  }
}

// ── Check 2: owner_type ↔ allowed_contact_purposes containment ──────────────
async function checkOwnerTypeContainment(pool: pg.Pool): Promise<void> {
  const sql = `
    SELECT
        cl.owner_type,
        cl.purpose,
        count(*) AS row_count,
        ot.allowed_contact_purposes
      FROM master.contact_link cl
      JOIN master.owner_type ot
        ON  ot.code = cl.owner_type
        AND ot.tenant_id IS NULL
     WHERE cl.purpose IS NOT NULL
       AND NOT (cl.purpose = ANY (ot.allowed_contact_purposes))
     GROUP BY cl.owner_type, cl.purpose, ot.allowed_contact_purposes
     ORDER BY cl.owner_type, cl.purpose;
  `;
  const r = await pool.query(sql);
  if (r.rowCount === 0) {
    results.push({
      name: "owner_type containment (purpose ∈ allowed_contact_purposes)",
      status: "pass",
    });
  } else {
    results.push({
      name: "owner_type containment (purpose ∈ allowed_contact_purposes)",
      status: "fail",
      details:
        "contact_link rows use purpose not whitelisted by owner_type.allowed_contact_purposes:",
      rows: r.rows,
    });
  }
}

// ── Check 3: auth-purpose forbids role_qualifier ────────────────────────────
async function checkAuthQualifierInvariant(pool: pg.Pool): Promise<void> {
  const sql = `
    SELECT cl.id, cl.tenant_id, cl.owner_type, cl.purpose,
           cl.role_qualifier, cl.channel_type, cl.value
      FROM master.contact_link cl
     WHERE cl.purpose IN ('login', 'recovery', 'mfa', 'verification')
       AND cl.role_qualifier IS NOT NULL;
  `;
  const r = await pool.query(sql);
  if (r.rowCount === 0) {
    results.push({
      name: "auth-purpose qualifier invariant (role_qualifier IS NULL)",
      status: "pass",
    });
  } else {
    results.push({
      name: "auth-purpose qualifier invariant (role_qualifier IS NULL)",
      status: "fail",
      details:
        "contact_link_auth_no_qualifier_chk CHECK should have blocked these rows — DDL drift suspected:",
      rows: r.rows,
    });
  }
}

// ── Check 4: role_qualifier soft validation ─────────────────────────────────
async function checkRoleQualifierSoftValidation(pool: pg.Pool): Promise<void> {
  const sql = `
    SELECT DISTINCT cl.role_qualifier
      FROM master.contact_link cl
     WHERE cl.role_qualifier IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM control.lookup_value lv
          WHERE lv.domain_code = 'master.contact_role_qualifier'
            AND lv.code = cl.role_qualifier
            AND lv.tenant_id IS NULL
       );
  `;
  const r = await pool.query(sql);
  if (r.rowCount === 0) {
    results.push({
      name: "role_qualifier soft validation (advisory)",
      status: "pass",
    });
  } else {
    results.push({
      name: "role_qualifier soft validation (advisory)",
      status: "warn",
      details:
        "contact_link rows use role_qualifier values not in master.contact_role_qualifier seed " +
        "(allowed since qualifier is free text, but worth reviewing):",
      rows: r.rows,
    });
  }
}

main().catch((err: unknown) => {
  console.error("FATAL:", err);
  process.exit(1);
});
