#!/usr/bin/env tsx
/**
 * P2P field contract audit.
 *
 * Compares physical DDL columns with the active control.entity_field contract
 * for the production P2P document family. The goal is to keep each field's
 * runtime property explicit: visible/editable, read-only, computed, hidden
 * system column, child-carrier-only, or service/default-owned.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx server/scripts/audit-p2p-field-contract.ts
 *   DATABASE_URL=postgres://... npx tsx server/scripts/audit-p2p-field-contract.ts --json
 */

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

const JSON_OUTPUT = process.argv.includes("--json");

const P2P_ENTITIES = [
  "purchase_requisition",
  "purchase_requisition_line",
  "commitment",
  "commitment_line",
  "purchase_order",
  "purchase_order_confirmation",
  "purchase_order_confirmation_line",
  "receipt",
  "receipt_line",
  "service_sheet",
  "service_sheet_line",
  "purchase_invoice",
  "purchase_invoice_line",
  "accounting_distribution",
  "pricing_component",
  "schedule_line",
] as const;

const SYSTEM_COLUMNS = new Set([
  "id",
  "tenant_id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "status_changed_at",
  "status_changed_by",
  "tags",
  "metadata",
  "row_version",
  "is_active",
]);

const DEFAULT_OR_SERVICE_OWNED = new Set([
  "code",
  "status",
  "fiscal_year",
  "period_number",
  "base_currency_code",
  "exchange_rate",
  "fx_rate_snapshot",
  "line_count",
  "subtotal_amount",
  "tax_amount",
  "total_amount",
  "net_amount",
  "gross_amount",
  "distributed_amount",
  "computed_amount",
  "computed_base_amount",
  "fulfilled_quantity",
  "fulfilled_amount",
  "remaining_quantity",
  "fulfillment_status",
  "version_number",
  "is_current_version",
]);

interface ColumnRow {
  entity_code: string;
  table_schema: string;
  table_name: string;
  column_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  is_generated: string | null;
}

interface FieldRow {
  entity_code: string;
  field_name: string;
  column_name: string;
  is_active: boolean;
  is_required: boolean;
  is_read_only: boolean;
  is_computed: boolean;
  is_write_once: boolean;
  group_key: string | null;
  ui_type: string | null;
  data_type: string;
  visibility: Record<string, unknown> | null;
  editability: Record<string, unknown> | null;
}

interface Finding {
  severity: "error" | "warning";
  rule: string;
  entity: string;
  column?: string;
  field?: string;
  detail: string;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const [columns, fields] = await Promise.all([
      loadColumns(pool),
      loadFields(pool),
    ]);

    const findings = audit(columns, fields);
    if (JSON_OUTPUT) {
      console.log(JSON.stringify({
        ok: findings.every((f) => f.severity !== "error"),
        entities_checked: P2P_ENTITIES.length,
        finding_count: findings.length,
        findings,
      }, null, 2));
    } else {
      printHuman(findings);
    }

    process.exit(findings.some((f) => f.severity === "error") ? 1 : 0);
  } finally {
    await pool.end();
  }
}

async function loadColumns(pool: pg.Pool): Promise<ColumnRow[]> {
  const result = await pool.query<ColumnRow>(`
    SELECT e.entity_code,
           e.table_schema,
           e.table_name,
           c.column_name,
           c.is_nullable,
           c.column_default,
           c.is_generated
      FROM control.entity e
      JOIN information_schema.columns c
        ON c.table_schema = e.table_schema
       AND c.table_name   = e.table_name
     WHERE e.tenant_id IS NULL
       AND e.entity_code = ANY($1::text[])
     ORDER BY e.entity_code, c.ordinal_position
  `, [P2P_ENTITIES]);
  return result.rows;
}

async function loadFields(pool: pg.Pool): Promise<FieldRow[]> {
  const result = await pool.query<FieldRow>(`
    SELECT e.entity_code,
           ef.name AS field_name,
           ef.column_name,
           ef.is_active,
           ef.is_required,
           ef.is_read_only,
           ef.is_computed,
           ef.is_write_once,
           ef.group_key,
           ef.ui_type,
           ef.data_type,
           ef.visibility,
           ef.editability
      FROM control.entity e
      JOIN control.entity_version ev
        ON ev.entity_id = e.id
       AND ev.tenant_id IS NULL
       AND ev.version_no = 1
      JOIN control.entity_field ef
        ON ef.entity_version_id = ev.id
     WHERE e.tenant_id IS NULL
       AND e.entity_code = ANY($1::text[])
     ORDER BY e.entity_code, ef.sort_order, ef.name
  `, [P2P_ENTITIES]);
  return result.rows;
}

function audit(columns: ColumnRow[], fields: FieldRow[]): Finding[] {
  const findings: Finding[] = [];
  const columnsByEntity = groupBy(columns, (row) => row.entity_code);
  const fieldsByEntity = groupBy(fields, (row) => row.entity_code);

  for (const entity of P2P_ENTITIES) {
    const entityColumns = columnsByEntity.get(entity) ?? [];
    const entityFields = fieldsByEntity.get(entity) ?? [];
    const columnNames = new Set(entityColumns.map((c) => c.column_name));
    const fieldsByColumn = new Map(entityFields.map((f) => [f.column_name, f]));

    for (const col of entityColumns) {
      if (SYSTEM_COLUMNS.has(col.column_name)) continue;
      const field = fieldsByColumn.get(col.column_name);
      if (!field) {
        findings.push({
          severity: isDbRequired(col) ? "error" : "warning",
          rule: "ddl_column_missing_entity_field",
          entity,
          column: col.column_name,
          detail: `${col.table_schema}.${col.table_name}.${col.column_name} has no control.entity_field row.`,
        });
        continue;
      }

      if (!field.is_active && isDbRequired(col) && !isDefaultOwned(col, field)) {
        findings.push({
          severity: "error",
          rule: "required_column_inactive_field",
          entity,
          column: col.column_name,
          field: field.field_name,
          detail: "DB-required column is inactive in the runtime field contract and is not default/computed owned.",
        });
      }

      if (field.is_required && col.is_nullable === "YES" && !field.is_computed) {
        findings.push({
          severity: "warning",
          rule: "runtime_required_but_db_nullable",
          entity,
          column: col.column_name,
          field: field.field_name,
          detail: "Runtime marks field required while DDL allows NULL. Confirm this is a submit-time rule.",
        });
      }

      if (field.is_computed && col.is_generated !== "ALWAYS" && !DEFAULT_OR_SERVICE_OWNED.has(col.column_name)) {
        findings.push({
          severity: "warning",
          rule: "computed_field_needs_owner",
          entity,
          column: col.column_name,
          field: field.field_name,
          detail: "Computed field is not DB-generated and is not in the known default/service-owned set.",
        });
      }
    }

    for (const field of entityFields) {
      if (!field.column_name || columnNames.has(field.column_name)) continue;
      findings.push({
        severity: field.is_active ? "error" : "warning",
        rule: "entity_field_missing_ddl_column",
        entity,
        column: field.column_name,
        field: field.field_name,
        detail: "control.entity_field points at a column not present in information_schema.columns.",
      });
    }
  }

  return findings;
}

function isDbRequired(col: ColumnRow): boolean {
  return col.is_nullable === "NO"
    && col.column_default == null
    && col.is_generated !== "ALWAYS";
}

function isDefaultOwned(col: ColumnRow, field: FieldRow): boolean {
  return col.column_default != null
    || col.is_generated === "ALWAYS"
    || field.is_computed
    || field.is_read_only
    || DEFAULT_OR_SERVICE_OWNED.has(col.column_name);
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const bucket = out.get(key) ?? [];
    bucket.push(row);
    out.set(key, bucket);
  }
  return out;
}

function printHuman(findings: Finding[]): void {
  if (findings.length === 0) {
    console.log(`OK: ${P2P_ENTITIES.length} P2P entities have coherent DDL/entity_field coverage.`);
    return;
  }

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  console.log(`P2P field contract audit: ${errors.length} error(s), ${warnings.length} warning(s).`);
  for (const finding of findings) {
    const target = [finding.entity, finding.field ?? finding.column].filter(Boolean).join(".");
    const stream = finding.severity === "error" ? console.error : console.warn;
    stream(`${finding.severity.toUpperCase()} ${finding.rule} ${target}: ${finding.detail}`);
  }
}

main().catch((err) => {
  console.error("audit-p2p-field-contract: fatal error", err);
  process.exit(2);
});
