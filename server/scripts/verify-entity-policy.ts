#!/usr/bin/env tsx
/**
 * Entity Policy Coverage Verification (audit P3-S1, CI gate)
 *
 * Asserts that every tenant in control.tenant has a control.entity_policy
 * row for every entity in MUST_HAVE_POLICY_ENTITIES. A missing row means
 * the runtime falls back to default behaviour (audit_mode='enabled' but
 * no access_mode / company_scope_mode / field_scope_eval_order), which
 * is silently permissive — exactly the gap the June 2026 audit flagged.
 *
 * Why this is CI verification, not a platform-level seed:
 *   Tenant entity_policy rows are seeded under
 *   server/db/seed/tenants/<tenant>/entity_engine/*.sql. The platform
 *   placeholder at platform/003_control/052_entity_policy.sql is empty
 *   by design — tenants own their policy shape. This script is the
 *   guarantee that the per-tenant seeds were applied.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx server/scripts/verify-entity-policy.ts
 *
 *   # JSON output for CI:
 *   npx tsx server/scripts/verify-entity-policy.ts --json
 *
 * Exit code:
 *   0 — every tenant has policy rows for every required entity
 *   1 — at least one (tenant × entity) row is missing
 */

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

const JSON_OUTPUT = process.argv.includes("--json");

// Entities that the runtime MUST have an entity_policy row for. Adding a
// new mandatory entity → add it here AND seed it in every tenant under
// server/db/seed/tenants/<tenant>/entity_engine/*.sql before merging.
//
// Scope: the canonical P2P + finance posting surfaces. UI metadata
// (master.site, master.warehouse) and reference tables are excluded —
// they don't drive lifecycle gates today.
const MUST_HAVE_POLICY_ENTITIES: ReadonlyArray<string> = [
  "purchase_requisition",
  "purchase_order",
  "purchase_order_confirmation",
  "delivery_note",
  "receipt",
  "service_sheet",
  "purchase_invoice",
  "payment_entry",
  "journal_entry",
];

interface TenantRow {
  id:   string;
  code: string;
  name: string;
}

interface Missing {
  tenantId:   string;
  tenantCode: string;
  entityCode: string;
}

async function loadActiveTenants(pool: pg.Pool): Promise<TenantRow[]> {
  const result = await pool.query<TenantRow>(`
    SELECT id::text, code, name
      FROM control.tenant
     WHERE COALESCE(is_active, true) = true
     ORDER BY code
  `);
  return result.rows;
}

async function loadEntityPolicyCoverage(pool: pg.Pool): Promise<Map<string, Set<string>>> {
  // (tenant_id → set of entity_codes that have at least one policy row).
  const result = await pool.query<{ tenant_id: string; entity_code: string }>(`
    SELECT tenant_id::text, entity_code
      FROM control.entity_policy
     WHERE tenant_id IS NOT NULL
  `);
  const map = new Map<string, Set<string>>();
  for (const row of result.rows) {
    if (!map.has(row.tenant_id)) map.set(row.tenant_id, new Set());
    map.get(row.tenant_id)!.add(row.entity_code);
  }
  return map;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const [tenants, coverage] = await Promise.all([
      loadActiveTenants(pool),
      loadEntityPolicyCoverage(pool),
    ]);

    const missing: Missing[] = [];
    for (const tenant of tenants) {
      const covered = coverage.get(tenant.id) ?? new Set<string>();
      for (const entityCode of MUST_HAVE_POLICY_ENTITIES) {
        if (!covered.has(entityCode)) {
          missing.push({ tenantId: tenant.id, tenantCode: tenant.code, entityCode });
        }
      }
    }

    if (JSON_OUTPUT) {
      console.log(JSON.stringify({
        ok:              missing.length === 0,
        tenants_checked: tenants.length,
        entities_required: MUST_HAVE_POLICY_ENTITIES.length,
        missing_count:   missing.length,
        missing,
      }, null, 2));
    } else {
      if (missing.length === 0) {
        console.log(
          `OK: ${tenants.length} tenant(s) × ${MUST_HAVE_POLICY_ENTITIES.length} required entit(y/ies) — all covered.`,
        );
      } else {
        console.error(
          `FAIL: ${missing.length} missing (tenant × entity) policy row(s) across ${tenants.length} tenant(s).\n`,
        );
        // Group by tenant for readability.
        const byTenant = new Map<string, string[]>();
        for (const m of missing) {
          if (!byTenant.has(m.tenantCode)) byTenant.set(m.tenantCode, []);
          byTenant.get(m.tenantCode)!.push(m.entityCode);
        }
        for (const [tenantCode, codes] of [...byTenant.entries()].sort()) {
          console.error(`  ${tenantCode}: ${codes.join(", ")}`);
        }
      }
    }

    process.exit(missing.length === 0 ? 0 : 1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("verify-entity-policy: fatal error", err);
  process.exit(2);
});
