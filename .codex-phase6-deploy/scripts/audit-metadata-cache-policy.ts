#!/usr/bin/env tsx
/**
 * CI/database gate for the entity list-cache policy contract.
 *
 * The authoritative precedence is tenant overlay, entity
 * display_config.list_cache, exact entity-class profile, then the platform
 * default. Entity names are never inspected or used to infer behavior.
 */
import {
  auditEntityListCachePolicy,
  type EntityListCachePolicyAuditIssue,
} from "@athyper/api-contracts/entity-cache-policy";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

const reportOnly = process.argv.includes("--report");

interface EntityPolicyRow {
  entity_code: string;
  tenant_id: string | null;
  entity_class: string;
  mutability: string;
  data_classification: string | null;
  entity_policy: unknown;
  class_policy: unknown;
}

interface TenantOverrideRow extends EntityPolicyRow {
  tenant_id: string;
  overlay_value: unknown;
}

interface Finding extends EntityListCachePolicyAuditIssue {
  scope: string;
  entityCode: string;
  entityClass: string;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const rows = await loadRows(pool);
    const tenantRows = await loadTenantOverrideRows(pool);
    const findings = [...rows.flatMap(auditRow), ...auditTenantRows(tenantRows)];
    if (reportOnly) printCsv(findings);

    if (findings.length > 0) {
      console.error(`CACHE POLICY AUDIT FAILED: ${findings.length} invalid policy value(s)`);
      for (const finding of findings.slice(0, 50)) {
        console.error(
          `  - ${finding.scope}/${finding.entityCode} [${finding.entityClass}] `
          + `${finding.code} ${finding.layer}.${finding.path}: ${finding.message}`,
        );
      }
      if (findings.length > 50) console.error(`  ... and ${findings.length - 50} more`);
      if (!reportOnly) process.exitCode = 1;
      return;
    }

    console.log(`Cache policy audit OK — ${rows.length} active entities and ${tenantRows.length} tenant overlay change(s).`);
  } finally {
    await pool.end();
  }
}

async function loadRows(pool: pg.Pool): Promise<EntityPolicyRow[]> {
  const result = await pool.query<EntityPolicyRow>(`
    SELECT e.entity_code,
           e.tenant_id,
           e.entity_class,
           COALESCE(evc.mutability, e.mutability) AS mutability,
           COALESCE(evc.data_policy, e.data_policy)->>'classification' AS data_classification,
           COALESCE(e.display_config->'list_cache', '{}'::jsonb) AS entity_policy,
           COALESCE(ecp.cache_policy, '{}'::jsonb) AS class_policy
      FROM control.entity e
      JOIN control.entity_version ev
        ON ev.entity_id = e.id
       AND ev.status = 'EFFECTIVE'
       AND ev.tenant_id IS NOT DISTINCT FROM e.tenant_id
      LEFT JOIN control.entity_version_contract evc
        ON evc.entity_version_id = ev.id
       AND evc.tenant_id IS NOT DISTINCT FROM ev.tenant_id
      LEFT JOIN control.entity_class_profile ecp
        ON ecp.class_key = e.entity_class
     WHERE e.is_active = true
       AND e.runtime_enabled = true
       AND e.status = 'ACTIVE'
     ORDER BY e.tenant_id NULLS FIRST, e.entity_code
  `);
  return result.rows;
}

async function loadTenantOverrideRows(pool: pg.Pool): Promise<TenantOverrideRow[]> {
  const result = await pool.query<TenantOverrideRow>(`
    SELECT e.entity_code,
           ov.tenant_id::text AS tenant_id,
           e.entity_class,
           COALESCE(evc.mutability, e.mutability) AS mutability,
           COALESCE(evc.data_policy, e.data_policy)->>'classification' AS data_classification,
           COALESCE(e.display_config->'list_cache', '{}'::jsonb) AS entity_policy,
           COALESCE(ecp.cache_policy, '{}'::jsonb) AS class_policy,
           oc.value AS overlay_value
      FROM control.overlay ov
      JOIN control.entity e
        ON e.id = ov.base_entity_id
       AND e.tenant_id IS NULL
      JOIN control.overlay_change oc
        ON oc.overlay_id = ov.id
       AND oc.tenant_id = ov.tenant_id
      JOIN control.entity_version ev
        ON ev.entity_id = e.id
       AND ev.status = 'EFFECTIVE'
       AND ev.tenant_id IS NULL
      LEFT JOIN control.entity_version_contract evc
        ON evc.entity_version_id = ev.id
       AND evc.tenant_id IS NULL
      LEFT JOIN control.entity_class_profile ecp
        ON ecp.class_key = e.entity_class
     WHERE ov.is_active = true
       AND (ov.base_version_id IS NULL OR ov.base_version_id = ev.id)
       AND e.is_active = true
       AND e.runtime_enabled = true
       AND e.status = 'ACTIVE'
       AND lower(regexp_replace(oc.kind, '([a-z0-9])([A-Z])', '\\1_\\2', 'g')) IN ('tweak_policy', 'tweakpolicy')
       AND oc.path = 'policy'
       AND (oc.value ? 'cachePolicy' OR oc.value ? 'dataPolicy')
     ORDER BY ov.tenant_id, e.entity_code, ov.priority, ov.version, ov.id, oc.change_order
  `);
  return result.rows;
}

function auditRow(row: EntityPolicyRow): Finding[] {
  const mutable = !["locked", "immutable"].includes(row.mutability.trim().toLowerCase());
  return auditEntityListCachePolicy({
    entityPolicy: row.entity_policy,
    entityClassPolicy: row.class_policy,
    dataClassification: row.data_classification,
    mutable,
  }).map((issue) => ({
    ...issue,
    scope: row.tenant_id ?? "canonical",
    entityCode: row.entity_code,
    entityClass: row.entity_class,
  }));
}

function auditTenantRows(rows: readonly TenantOverrideRow[]): Finding[] {
  const groups = new Map<string, {
    row: TenantOverrideRow;
    tenantPolicy: Record<string, unknown>;
    dataPolicy: Record<string, unknown>;
  }>();
  for (const row of rows) {
    const key = `${row.tenant_id}:${row.entity_code}`;
    const group = groups.get(key) ?? { row, tenantPolicy: {}, dataPolicy: {} };
    const value = asRecord(row.overlay_value);
    Object.assign(group.tenantPolicy, asRecord(value?.["cachePolicy"]) ?? {});
    Object.assign(group.dataPolicy, asRecord(value?.["dataPolicy"]) ?? {});
    groups.set(key, group);
  }

  return [...groups.values()].flatMap(({ row, tenantPolicy, dataPolicy }) => {
    const mutable = !["locked", "immutable"].includes(row.mutability.trim().toLowerCase());
    const classification = typeof dataPolicy["classification"] === "string"
      ? dataPolicy["classification"]
      : row.data_classification;
    return auditEntityListCachePolicy({
      entityPolicy: row.entity_policy,
      entityClassPolicy: row.class_policy,
      tenantPolicy,
      dataClassification: classification,
      mutable,
    }).map((issue) => ({
      ...issue,
      scope: row.tenant_id,
      entityCode: row.entity_code,
      entityClass: row.entity_class,
    }));
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function printCsv(findings: readonly Finding[]): void {
  console.log("scope,entity_code,entity_class,layer,path,code,message");
  for (const finding of findings) {
    console.log([
      finding.scope,
      finding.entityCode,
      finding.entityClass,
      finding.layer,
      finding.path,
      finding.code,
      finding.message,
    ].map(csv).join(","));
  }
}

function csv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

main().catch((error) => {
  console.error("audit-metadata-cache-policy failed:", error);
  process.exit(1);
});
