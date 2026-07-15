/**
 * Reference-Label Enricher
 *
 * Walks `control.entity_field` rows that declare a reference target via
 * `reference_config.target_entity` and attaches companion display fields
 * (`${name}_label`, `${base}_label`, plus `_code` variants) to a page of
 * rows so the runtime `reference_label` display contract holds.
 *
 * The companion convention is the one already read by
 * `packages/shared/runtime-domain/runtime-shared/src/meta-entity/record-display.ts`,
 * so any field with `display.renderer = "reference_label"` (which the
 * compiler defaults to for FK fields with reference_config) renders the
 * label automatically once the enricher has run.
 *
 * Wired into the records-route layer: list, detail, create/update/patch,
 * AD distribution subresources, and PIL line mutations. See rb-21 for
 * the full surface map and rollout/rollback procedure.
 *
 * Design choices:
 *   â€¢ Polymorphic refs are skipped â€” they have no single fk_field to
 *     resolve, and the descriptor doesn't declare a fixed target_entity.
 *   â€¢ Target-table label/code columns are intersected with
 *     information_schema before SELECT, so a descriptor pointing at a
 *     missing column degrades to `null` instead of throwing.
 *   â€¢ Tenant scope is honoured per target: target tables with `tenant_id`
 *     get `WHERE tenant_id = $1`; shared/core targets do not.
 *   â€¢ Existing companion keys are NEVER overwritten â€” callers may
 *     pre-populate from snapshots or computed sources.
 *   â€¢ Disable via ENABLE_REFERENCE_LABEL_ENRICHMENT=0 (rb-21 Â§Rollback).
 *
 * Business reads (snapshot capture, GL posting, AP matching, audit
 * replay) stay raw â€” see snapshot-enrichment-isolation.test.ts for the
 * contract lock.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// SQL-identifier whitelist. Reference field metadata is server-controlled
// (descriptors compile from seed SQL), but interpolating identifiers into
// raw SQL still warrants a strict character class as defence in depth.
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

/**
 * Rollout kill-switch for the reference-label enricher.
 *
 * Default: ENABLED. When `ENABLE_REFERENCE_LABEL_ENRICHMENT=0` (or `false`),
 * `enrichWithReferenceLabels` and `enrichSingleReferenceLabels` return their
 * input rows untouched. Use this to roll back from a deploy that surfaces
 * an unforeseen target-table regression without redeploying.
 *
 * The kill-switch is read at call time (not module load) so changing the
 * env var on a hot process takes effect for the next request.
 */
export function isReferenceLabelEnrichmentEnabled(): boolean {
  const raw = process.env["ENABLE_REFERENCE_LABEL_ENRICHMENT"];
  if (raw === undefined || raw === "") return true;
  const normalized = raw.trim().toLowerCase();
  return normalized !== "0" && normalized !== "false" && normalized !== "off";
}

export interface ReferenceFieldSpec {
  fieldName:        string;        // logical name, e.g. "gl_account_id"
  columnName:       string;        // physical column, e.g. "gl_account_id"
  targetEntity:     string;        // e.g. "gl_account"
  targetField:      string;        // target lookup column, usually "id"
  labelField:       string;        // e.g. "name"
  codeField:        string | null; // e.g. "code" or "asset_number"; null skips code companion
  descriptionField: string | null; // e.g. "formatted_address"; null skips formatted companion
}

export interface TargetTableInfo {
  schema:    string;
  table:     string;
  hasTenant: boolean;
  tenantColumn?: string | null;
  primaryKey?: string | null;
}

export interface ResolvedTargetLabels {
  label:          string | null;
  code:           string | null;
  formattedValue: string | null;
  jurisdictionId: string | null;
}

export interface EnrichReferenceLabelsArgs {
  entityCode: string;
  tenantId:   string | null;
  rows:       Record<string, unknown>[];

  /**
   * Optional overrides used by tests. When provided, the helper skips its
   * own DB-backed discovery / resolution and uses the injected values.
   */
  overrides?: {
    referenceFields?: ReferenceFieldSpec[];
    resolveTargetTable?: (entityCode: string) => Promise<TargetTableInfo | null>;
    fetchTargetLabels?: (
      target: TargetTableInfo,
      spec: ReferenceFieldSpec,
      ids: string[],
      tenantId: string | null,
    ) => Promise<Map<string, ResolvedTargetLabels>>;
  };
}

/**
 * Single-row convenience wrapper. Returns the enriched row, or the input
 * row unchanged if `row` is null/undefined. Use this in detail/mutation
 * handlers that return one record; the array enricher is preferred for
 * list reads.
 */
export async function enrichSingleReferenceLabels<T extends Record<string, unknown> | null | undefined>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  args: Omit<EnrichReferenceLabelsArgs, "rows"> & { row: T },
): Promise<T> {
  if (!args.row) return args.row;
  const [enriched] = await enrichWithReferenceLabels(db, {
    entityCode: args.entityCode,
    tenantId:   args.tenantId,
    rows:       [args.row as Record<string, unknown>],
    ...(args.overrides ? { overrides: args.overrides } : {}),
  });
  return (enriched as T) ?? args.row;
}

export async function enrichWithReferenceLabels(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  args: EnrichReferenceLabelsArgs,
): Promise<Record<string, unknown>[]> {
  if (args.rows.length === 0) return args.rows;
  // Rollout kill-switch. Overrides bypass the env check so unit tests
  // remain deterministic regardless of the caller's environment.
  if (!args.overrides && !isReferenceLabelEnrichmentEnabled()) return args.rows;

  const specs = args.overrides?.referenceFields
    ?? await discoverReferenceFields(db, args.entityCode);
  if (specs.length === 0) return args.rows;

  const resolveTarget = args.overrides?.resolveTargetTable
    ?? ((code: string) => resolveTargetTable(db, code));
  const fetchLabels = args.overrides?.fetchTargetLabels
    ?? ((target, spec, ids, tenantId) => fetchTargetLabels(db, target, spec, ids, tenantId));

  // Resolve each distinct target entity â†’ schema/table once.
  const targetByEntity = new Map<string, TargetTableInfo | null>();
  for (const spec of specs) {
    if (targetByEntity.has(spec.targetEntity)) continue;
    targetByEntity.set(spec.targetEntity, await resolveTarget(spec.targetEntity));
  }

  // Batched lookup per (spec, target) using distinct FK IDs from the page.
  const labelsByField = new Map<string, Map<string, ResolvedTargetLabels>>();
  for (const spec of specs) {
    const target = targetByEntity.get(spec.targetEntity);
    if (!target) continue;

    const ids = collectDistinctFkValues(args.rows, spec.columnName, spec.fieldName);
    if (ids.length === 0) continue;

    const map = await fetchLabels(target, spec, ids, args.tenantId);
    labelsByField.set(spec.fieldName, map);
  }

  // Project companion keys onto each row. Non-blank existing values win.
  return args.rows.map((row) => {
    const next: Record<string, unknown> = { ...row };
    for (const spec of specs) {
      const labels = labelsByField.get(spec.fieldName);
      if (!labels) continue;

      const idValue = pickFkValue(row, spec.columnName, spec.fieldName);
      if (!idValue) continue;

      const resolved = labels.get(idValue) ?? {
        label: null, code: null, formattedValue: null, jurisdictionId: null,
      };
      const baseName = referenceBaseName(spec.fieldName);

      assignIfBlank(next, `${spec.fieldName}_label`, resolved.label);
      if (baseName !== spec.fieldName) {
        assignIfBlank(next, `${baseName}_label`, resolved.label);
      }
      if (spec.codeField) {
        assignIfBlank(next, `${spec.fieldName}_code`, resolved.code);
        if (baseName !== spec.fieldName) {
          assignIfBlank(next, `${baseName}_code`, resolved.code);
        }
      }
      if (spec.descriptionField) {
        assignIfBlank(next, `${spec.fieldName}_formatted_address`, resolved.formattedValue);
        if (baseName !== spec.fieldName) {
          assignIfBlank(next, `${baseName}_formatted_address`, resolved.formattedValue);
        }
      }
      assignIfBlank(next, `${spec.fieldName}_jurisdiction_id`, resolved.jurisdictionId);
      if (baseName !== spec.fieldName) {
        assignIfBlank(next, `${baseName}_jurisdiction_id`, resolved.jurisdictionId);
      }
      assignIdentityAliases(next, baseName, resolved);
    }
    return next;
  });
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function referenceBaseName(fieldName: string): string {
  if (fieldName.endsWith("_id")) return fieldName.slice(0, -3);
  return fieldName;
}

function pickFkValue(row: Record<string, unknown>, columnName: string, fieldName: string): string | null {
  const candidates = [row[columnName], row[fieldName]];
  for (const v of candidates) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function collectDistinctFkValues(
  rows: Record<string, unknown>[],
  columnName: string,
  fieldName: string,
): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const v = pickFkValue(row, columnName, fieldName);
    if (v) set.add(v);
  }
  return [...set];
}

function assignIfBlank(row: Record<string, unknown>, key: string, value: string | null): void {
  // Skip null / empty resolutions. Writing `null` would tell client-side
  // pickers "the server has spoken, no label exists" â€” which short-circuits
  // their own /api/lookup fallback. Leaving the key undefined preserves the
  // pre-enricher contract: pickers that resolve labels client-side keep
  // working when the server-side lookup misses (RLS, descriptor pointing
  // at a target without a name column, identity_via=business_partner, etc).
  // Pickers that consume server-supplied labels (AD drawer) still get them
  // populated when resolution succeeds â€” that branch was the bug fix.
  if (value === null || value === undefined || value === "") return;
  const existing = row[key];
  if (existing !== null && existing !== undefined && existing !== "") return;
  row[key] = value;
}

function assignIdentityAliases(
  row: Record<string, unknown>,
  baseName: string,
  resolved: ResolvedTargetLabels,
): void {
  if (baseName === "supplier") {
    assignIfBlank(row, "supplier_name", resolved.label);
    assignIfBlank(row, "supplier_code", resolved.code);
  }
  if (baseName === "company_code") {
    assignIfBlank(row, "company_code_name", resolved.label);
    assignIfBlank(row, "company_code", resolved.code);
  }
}

// â”€â”€ DB-backed discovery + fetch (overridable in tests) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface DiscoveredFieldRow {
  field_name:        string;
  column_name:       string;
  reference_config:  Record<string, unknown> | null;
  validation:        Record<string, unknown> | null;
}

export async function discoverReferenceFields(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  entityCode: string,
): Promise<ReferenceFieldSpec[]> {
  const normalized = entityCode.replace(/-/g, "_");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (db as any)
    .selectFrom("control.entity_field as ef")
    .innerJoin("control.entity_version as ev", "ev.id", "ef.entity_version_id")
    .innerJoin("control.entity as e", "e.id", "ev.entity_id")
    .select([
      "ef.name as field_name",
      "ef.column_name as column_name",
      "ef.reference_config as reference_config",
      "ef.validation as validation",
    ])
    .where("e.name", "=", normalized)
    .where("e.tenant_id", "is", null)
    .where("e.runtime_enabled", "=", true)
    .where("e.status", "=", "ACTIVE")
    .where("e.is_active", "=", true)
    .where("e.read_capability", "<>", "none")
    .where("ev.status", "=", "EFFECTIVE")
    .where("ef.is_active", "=", true)
    .where("ef.runtime_enabled", "=", true)
    .where("ef.tenant_id", "is", null)
    .where(sql`
      (ef.reference_config ? 'target_entity')
      OR (ef.reference_config ? 'ref_entity')
      OR (ef.validation ? 'ref_entity')
    `)
    .execute() as DiscoveredFieldRow[];

  return rows
    .map(specFromDiscoveredRow)
    .filter((s): s is ReferenceFieldSpec => s !== null);
}

export function specFromDiscoveredRow(row: DiscoveredFieldRow): ReferenceFieldSpec | null {
  const validation = row.validation ?? {};
  if (validation["polymorphic"] === true) return null;

  const rc = row.reference_config ?? {};
  const targetEntity = readString(rc, "target_entity")
    ?? readString(rc, "ref_entity")
    ?? readString(validation, "ref_entity");
  if (!targetEntity) return null;

  const targetField = readString(rc, "target_field")
    ?? readString(rc, "value_field")
    ?? "id";

  const labelField = readString(rc, "label_field")
    ?? readString(rc, "display_field")
    ?? "name";

  const picker = (rc["picker"] && typeof rc["picker"] === "object")
    ? rc["picker"] as Record<string, unknown>
    : null;
  const codeField = readString(rc, "code_field")
    ?? (picker ? readString(picker, "code_field") : null)
    ?? "code";
  const descriptionField = readString(rc, "description_field")
    ?? (picker ? readString(picker, "description_field") : null);

  return {
    fieldName:        row.field_name,
    columnName:       row.column_name || row.field_name,
    targetEntity,
    targetField,
    labelField,
    codeField,
    descriptionField,
  };
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const v = record[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function resolveTargetTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  entityCode: string,
): Promise<TargetTableInfo | null> {
  const normalized = entityCode.replace(/-/g, "_");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any)
    .selectFrom("control.entity as e")
    .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
    .select(["e.table_schema", "e.table_name", "e.feature_flags", "e.tenant_column", "e.primary_key"])
    .where("e.name", "=", normalized)
    .where("e.tenant_id", "is", null)
    .where("e.runtime_enabled", "=", true)
    .where("e.status", "=", "ACTIVE")
    .where("e.is_active", "=", true)
    .where("e.read_capability", "<>", "none")
    .where("ev.status", "=", "EFFECTIVE")
    .executeTakeFirst() as { table_schema: string; table_name: string; feature_flags: Record<string, unknown> | null; tenant_column: string | null; primary_key: string | null } | undefined;
  if (!row) return null;

  // Role entities such as supplier/customer delegate identity to a BP-backed
  // application index. Resolve labels from the metadata-declared list source,
  // which exposes the role UUID together with its Name/Code projection.
  const listEntityCode = readString(row.feature_flags ?? {}, "list_entity_code");
  if (listEntityCode && listEntityCode !== normalized) {
    const listTarget = await resolveTargetTable(db, listEntityCode);
    if (listTarget) return listTarget;
  }

  const schema = String(row.table_schema);
  const table  = String(row.table_name);
  if (!SAFE_IDENTIFIER.test(schema) || !SAFE_IDENTIFIER.test(table)) return null;

  const tenantColumn = row.tenant_column ?? null;
  return { schema, table, hasTenant: tenantColumn !== null, tenantColumn, primaryKey: row.primary_key ?? null };
}

export async function fetchTargetLabels(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  target: TargetTableInfo,
  spec: ReferenceFieldSpec,
  ids: string[],
  tenantId: string | null,
): Promise<Map<string, ResolvedTargetLabels>> {
  const result = new Map<string, ResolvedTargetLabels>();
  if (ids.length === 0) return result;

  // Intersect descriptor-claimed columns with what actually exists. A
  // descriptor that points at a missing column resolves to `null` rather
  // than failing the page.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cols = await (db as any)
    .selectFrom("information_schema.columns as c")
    .select(["c.column_name", "c.data_type", "c.udt_name"])
    .where("c.table_schema", "=", target.schema)
    .where("c.table_name", "=", target.table)
    .execute() as { column_name: string; data_type: string | null; udt_name: string | null }[];
  const columnSet = new Set(cols.map((c) => String(c.column_name)));
  const columnTypeByName = new Map(cols.map((c) => [
    String(c.column_name),
    {
      dataType: String(c.data_type ?? "").toLowerCase(),
      udtName: String(c.udt_name ?? "").toLowerCase(),
    },
  ]));

  const targetField = spec.targetField || target.primaryKey || "id";
  const targetCol = targetField && columnSet.has(targetField) && SAFE_IDENTIFIER.test(targetField)
    ? spec.targetField
    : "id";
  const labelCol = spec.labelField && columnSet.has(spec.labelField) && SAFE_IDENTIFIER.test(spec.labelField)
    ? spec.labelField
    : null;
  const codeCol = spec.codeField && columnSet.has(spec.codeField) && SAFE_IDENTIFIER.test(spec.codeField)
    ? spec.codeField
    : null;
  const formattedCol = spec.descriptionField && columnSet.has(spec.descriptionField) && SAFE_IDENTIFIER.test(spec.descriptionField)
    ? spec.descriptionField
    : null;
  const jurisdictionCol = columnSet.has("jurisdiction_id")
    ? "jurisdiction_id"
    : null;
  const targetType = columnTypeByName.get(targetCol);
  const targetIsUuid = targetType?.dataType === "uuid" || targetType?.udtName === "uuid";

  if (!labelCol && !codeCol && !formattedCol && !jurisdictionCol) return result;

  // Server-controlled identifiers, additionally guarded by SAFE_IDENTIFIER.
  const tableRef          = sql.raw(`"${target.schema}"."${target.table}"`);
  const targetSelect      = sql.raw(`"${targetCol}"`);
  const labelSelect       = labelCol ? sql.raw(`"${labelCol}"::text`) : sql.raw("NULL::text");
  const codeSelect        = codeCol  ? sql.raw(`"${codeCol}"::text`)  : sql.raw("NULL::text");
  const formattedSelect   = formattedCol ? sql.raw(`"${formattedCol}"::text`) : sql.raw("NULL::text");
  const jurisdictionSelect = jurisdictionCol ? sql.raw(`"${jurisdictionCol}"`) : sql.raw("NULL::uuid");
  const tenantColumn = target.tenantColumn ?? (target.hasTenant ? "tenant_id" : null);
  const tenantPredicate = tenantColumn && tenantId
    ? sql`AND ${sql.raw(`"${tenantColumn.replace(/"/g, '""')}"`)} = ${tenantId}::uuid`
    : sql``;
  const lookupPredicate = targetIsUuid
    ? sql`${targetSelect} = ANY(${ids}::uuid[])`
    : sql`${targetSelect}::text = ANY(${ids}::text[])`;

  const queryResult = await sql<{
    lookup_value: string;
    label_value: string | null;
    code_value: string | null;
    formatted_value: string | null;
    jurisdiction_id: string | null;
  }>`
    SELECT ${targetSelect}::text AS lookup_value,
           ${labelSelect} AS label_value,
           ${codeSelect}  AS code_value,
           ${formattedSelect} AS formatted_value,
           ${jurisdictionSelect}::text AS jurisdiction_id
      FROM ${tableRef}
     WHERE ${lookupPredicate}
       ${tenantPredicate}
  `.execute(db);

  for (const r of queryResult.rows) {
    result.set(String(r.lookup_value), {
      label:          r.label_value ?? null,
      code:           r.code_value  ?? null,
      formattedValue: r.formatted_value ?? null,
      jurisdictionId: r.jurisdiction_id ?? null,
    });
  }
  return result;
}
