/**
 * Resolver: picker.first_option
 *
 * Generic metadata-backed resolver for picker fields. It reuses the field's
 * reference metadata, static filters, dependent_filter, and default_order to
 * select the first valid option value without field-specific SQL.
 */

import { sql } from "kysely";
import { asResolverCode, type ResolverContract } from "@athyper/cascade";
import { registerResolver, type ServerResolver } from "./registry.js";

const CONTRACT: ResolverContract = {
  code:            asResolverCode("picker.first_option"),
  description:     "Resolves the first valid picker option using field metadata filters and default ordering.",
  requiredSources: ["entity", "field", "formData"],
  outputType:      "uuid",
};

interface FieldPickerMetadata {
  referenceConfig: Record<string, unknown>;
  lookupConfig:    Record<string, unknown>;
  validation:      Record<string, unknown>;
}

interface TargetEntityLocation {
  table_schema: string;
  table_name:   string;
  primary_key: string;
  tenant_column: string | null;
}

interface OrderSpec {
  field: string;
  dir:   "asc" | "desc";
}

const impl: ServerResolver<string> = async (inputs, ctx) => {
  const entityCode = readString(inputs["entity"])?.replace(/-/g, "_");
  const fieldName = readString(inputs["field"]);
  const formData = readRecord(inputs["formData"]);
  if (!entityCode || !fieldName || !formData) return null;

  const field = await loadFieldPickerMetadata(ctx.db, entityCode, fieldName);
  if (!field) return null;

  const targetEntity = readString(field.referenceConfig["target_entity"])
    ?? readString(field.referenceConfig["ref_entity"])
    ?? readString(field.referenceConfig["entity_code"])
    ?? readString(field.referenceConfig["entity"])
    ?? readString(field.validation["ref_entity"])
    ?? readString(field.validation["ref_hint"]);
  if (!targetEntity) return null;

  const target = await loadTargetEntityLocation(ctx.db, targetEntity);
  if (!target) return null;

  const valueField = readString(field.referenceConfig["value_field"])
    ?? readString(field.referenceConfig["target_field"])
    ?? target.primary_key;

  const predicates = target.tenant_column
    ? [sql`${ident(target.tenant_column)} = ${ctx.tenantId}::uuid`]
    : [];

  for (const [filterField, rawValue] of Object.entries(readFilterRecord(field.lookupConfig))) {
    const values = splitFilterValues(rawValue);
    if (values.length === 0) continue;
    predicates.push(values.length === 1
      ? sql`${ident(filterField)} = ${values[0]}`
      : sql`${ident(filterField)} IN (${sql.join(values.map((value) => sql`${value}`))})`);
  }

  const dependency = readRecord(field.lookupConfig["dependent_filter"])
    ?? readRecord(field.referenceConfig["dependent_filter"]);
  if (dependency) {
    const sourceField = readString(dependency["source_field"]);
    const targetField = readString(dependency["target_field"]) ?? sourceField;
    const emptyBehavior = readString(dependency["empty_behavior"]) ?? "none";
    if (sourceField && targetField) {
      const sourceValue = formData[sourceField];
      if (isBlank(sourceValue)) {
        if (emptyBehavior !== "all") return null;
      } else {
        predicates.push(sql`${ident(targetField)} = ${sourceValue}`);
      }
    }
  }

  const orderSpecs = readOrderSpecs(field.lookupConfig)
    ?? readOrderSpecs(field.referenceConfig)
    ?? [];
  const orderSql = [...orderSpecs, { field: target.primary_key, dir: "asc" as const }]
    .filter((item, index, arr) => arr.findIndex((other) => other.field === item.field) === index)
    .map((item) => sql`${ident(item.field)} ${sql.raw(item.dir)}`);

  const table = sql.raw(`"${target.table_schema.replace(/"/g, '""')}"."${target.table_name.replace(/"/g, '""')}"`);
  const rows = await sql<{ value: string | null }>`
    SELECT ${ident(valueField)} AS value
      FROM ${table}
     WHERE ${sql.join(predicates, sql` AND `)}
     ORDER BY ${sql.join(orderSql)}
     LIMIT 1
  `.execute(ctx.db);

  return rows.rows[0]?.value ?? null;
};

async function loadFieldPickerMetadata(
  db: Parameters<ServerResolver>[1]["db"],
  entityCode: string,
  fieldName: string,
): Promise<FieldPickerMetadata | null> {
  const rows = await sql<{
    reference_config: Record<string, unknown> | null;
    lookup_config:    Record<string, unknown> | null;
    validation:       Record<string, unknown> | null;
  }>`
    SELECT ef.reference_config, ef.lookup_config, ef.validation
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e          ON e.id  = ev.entity_id
     WHERE e.name       = ${entityCode}
       AND e.tenant_id  IS NULL
        AND e.runtime_enabled = true
        AND e.status    = 'ACTIVE'
        AND e.is_active = true
        AND ev.status    = 'EFFECTIVE'
        AND ef.is_active = true
        AND ef.runtime_enabled = true
        AND ef.name      = ${fieldName}
     LIMIT 1
  `.execute(db);
  const row = rows.rows[0];
  if (!row) return null;
  return {
    referenceConfig: row.reference_config ?? {},
    lookupConfig:    row.lookup_config ?? {},
    validation:      row.validation ?? {},
  };
}

async function loadTargetEntityLocation(
  db: Parameters<ServerResolver>[1]["db"],
  entityCode: string,
): Promise<TargetEntityLocation | null> {
  const rows = await sql<TargetEntityLocation>`
    SELECT table_schema, table_name, COALESCE(primary_key, 'id') AS primary_key, tenant_column
      FROM control.entity
     WHERE name = ${entityCode}
       AND tenant_id IS NULL
       AND runtime_enabled = true
       AND status = 'ACTIVE'
       AND is_active = true
       AND read_capability <> 'none'
       AND EXISTS (SELECT 1 FROM control.entity_version ev WHERE ev.entity_id = control.entity.id AND ev.status = 'EFFECTIVE')
     LIMIT 1
  `.execute(db);
  return rows.rows[0] ?? null;
}

function readOrderSpecs(config: Record<string, unknown>): OrderSpec[] | null {
  const raw = config["default_order"] ?? config["defaultOrder"];
  if (!Array.isArray(raw)) return null;
  const specs: OrderSpec[] = [];
  for (const item of raw) {
    const token = readString(item);
    if (!token) continue;
    const dir = token.startsWith("-") ? "desc" : "asc";
    const field = token.replace(/^[-+]/, "");
    if (!isIdentifier(field)) continue;
    specs.push({ field, dir });
  }
  return specs;
}

function readFilterRecord(config: Record<string, unknown>): Record<string, string> {
  const filters = readRecord(config["filters"]);
  if (!filters) return {};
  return Object.fromEntries(
    Object.entries(filters)
      .map(([key, item]) => [key, Array.isArray(item) ? item.map(String).join(",") : String(item ?? "")] as const)
      .filter(([key, value]) => isIdentifier(key) && value !== ""),
  );
}

function splitFilterValues(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function ident(value: string) {
  if (!isIdentifier(value)) throw new Error(`Invalid metadata identifier: ${value}`);
  return sql.raw(`"${value.replace(/"/g, '""')}"`);
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

export function registerPickerFirstOption(): void {
  registerResolver(CONTRACT, impl);
}

export { CONTRACT as pickerFirstOptionContract };
