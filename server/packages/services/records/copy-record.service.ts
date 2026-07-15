import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  copyCommitmentLineInTransaction,
  refreshCommitmentHeaderAmounts,
} from "@athyper/svc-business";
import { mergeFieldProvenance, resolveEntityIdentity } from "./entity-identity-policy.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

type JsonObject = Record<string, unknown>;
type CopyPolicy =
  | "preserve"
  | "reset"
  | "default"
  | "regenerate"
  | "derive"
  | "exclude"
  | "target_status"
  | "reparent";

interface CopyLogger {
  info?(event: string, fields?: Record<string, unknown>): void;
  warn?(event: string, fields?: Record<string, unknown>): void;
  error?(event: string, fields?: Record<string, unknown>): void;
}

interface EntityDescriptor {
  id: string;
  tenantId: string | null;
  versionId: string;
  versionTenantId: string | null;
  versionNo: number;
  versionStatus: string;
  entityCode: string;
  tableSchema: string;
  tableName: string;
  primaryKey: string;
  tenantColumn: string | null;
  displayConfig: unknown;
  identityConfig: unknown;
  createMode: string;
  numberingStrategy: string;
  draftTtlHours: number | null;
}

interface EntityFieldRow {
  name: string;
  columnName: string;
  dataType: string;
  origin: string;
  isRequired: boolean;
  isUnique: boolean;
  isReadOnly: boolean;
  isComputed: boolean;
  isWriteOnce: boolean;
  isDeprecated: boolean;
  isActive: boolean;
  defaultValue: unknown;
  uiHint: unknown;
}

interface EntityRelationRow {
  name: string;
  relationKind: string;
  targetEntity: string;
  fkField: string | null;
  uiBehavior: unknown;
}

interface BuildValuesParams {
  sourceRecord: Record<string, unknown>;
  fields: EntityFieldRow[];
  generatedColumns: Set<string>;
  primaryKey: string;
  tenantColumn: string | null;
  tenantId: string;
  actorId: string;
  targetStatus: string | null;
  overrides?: Record<string, unknown>;
}

export interface CopyRecordResult {
  id: string;
  record: Record<string, unknown>;
  copiedChildren: Record<string, number>;
}

const IDENTIFIER_RE = /^[a-z][a-z0-9_]*$/;
const SYSTEM_COLUMNS = new Set([
  "id",
  "tenant_id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "status_changed_at",
  "status_changed_by",
  "deleted_at",
  "deleted_by",
]);

const GENERATED_COLS_CACHE = new Map<string, Set<string>>();

function assertIdentifier(value: string, label: string): void {
  if (!IDENTIFIER_RE.test(value)) {
    throw Object.assign(new Error(`Invalid ${label}: ${value}`), { code: "INVALID_METADATA_IDENTIFIER" });
  }
}

function qualifiedTable(entity: EntityDescriptor): `${string}.${string}` {
  assertIdentifier(entity.tableSchema, "table schema");
  assertIdentifier(entity.tableName, "table name");
  return `${entity.tableSchema}.${entity.tableName}` as `${string}.${string}`;
}

function applyEntityScope(
  query: any,
  entity: EntityDescriptor,
  recordId: string,
  tenantId: string,
): any {
  assertIdentifier(entity.primaryKey, "primary key");
  let scoped = query.where(entity.primaryKey, "=", recordId);
  if (entity.tenantColumn) {
    assertIdentifier(entity.tenantColumn, "tenant column");
    scoped = scoped.where(entity.tenantColumn, "=", tenantId);
  }
  return scoped;
}

function asObject(value: unknown): JsonObject {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed != null && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as JsonObject
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "t", "yes", "y", "1", "enabled", "on"].includes(normalized)) return true;
  if (["false", "f", "no", "n", "0", "disabled", "off"].includes(normalized)) return false;
  return undefined;
}

function copyPolicyForField(field: EntityFieldRow): CopyPolicy | null {
  const hint = asObject(field.uiHint);
  const raw = hint["copy_policy"] ?? asObject(hint["copy"])["policy"];
  if (typeof raw !== "string") return null;
  return raw as CopyPolicy;
}

function defaultPolicyForField(
  field: EntityFieldRow,
  generatedColumns: Set<string>,
  systemColumns: Set<string>,
): CopyPolicy {
  if (!field.isActive || field.isDeprecated) return "exclude";
  if (!field.columnName) return "exclude";
  if (systemColumns.has(field.columnName)) return "exclude";
  if (generatedColumns.has(field.columnName)) return "exclude";
  if (field.isUnique) return "regenerate";
  if (field.isComputed) return "derive";
  if (field.isReadOnly) return "derive";
  if (field.isWriteOnce) return "reset";
  return "preserve";
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value) || (value != null && typeof value === "object")) {
    return JSON.parse(JSON.stringify(value)) as unknown;
  }
  return value;
}

function normalizeDateOnly(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function copyValueForField(field: EntityFieldRow, value: unknown): unknown {
  if (field.dataType.toLowerCase() === "date") return normalizeDateOnly(value);
  return cloneJsonValue(value);
}

function defaultValueForField(field: EntityFieldRow): { hasValue: boolean; value?: unknown } {
  const value = field.defaultValue;
  if (value === null || value === undefined) return { hasValue: false };
  const obj = asObject(value);
  if (Object.keys(obj).length > 0 && typeof obj["source"] === "string") {
    if (obj["source"] === "today") {
      return { hasValue: true, value: new Date().toISOString().slice(0, 10) };
    }
    return { hasValue: false };
  }
  return { hasValue: true, value: cloneJsonValue(value) };
}

function buildInsertValues(params: BuildValuesParams): Record<string, unknown> {
  const overrides = params.overrides ?? {};
  const systemColumns = new Set(SYSTEM_COLUMNS);
  systemColumns.add(params.primaryKey);
  if (params.tenantColumn) systemColumns.add(params.tenantColumn);
  const values: Record<string, unknown> = { created_by: params.actorId };

  // Preserve the legacy generated-UUID behavior only for UUID primary keys.
  // Numeric, text, and composite keys must be supplied by their declared
  // database/default strategy; inventing an id would violate the contract.
  const primaryField = params.fields.find((field) => field.columnName === params.primaryKey);
  if (primaryField?.dataType.toLowerCase() === "uuid"
    && !params.generatedColumns.has(params.primaryKey)) {
    values[params.primaryKey] = randomUUID();
  }
  if (params.tenantColumn) values[params.tenantColumn] = params.tenantId;

  const fieldsByColumn = new Map(params.fields.map((field) => [field.columnName, field]));
  for (const field of params.fields) {
    if (!field.columnName) continue;
    assertIdentifier(field.columnName, `column for ${field.name}`);
    if (params.generatedColumns.has(field.columnName)) continue;
    if (Object.prototype.hasOwnProperty.call(overrides, field.columnName)) {
      values[field.columnName] = overrides[field.columnName];
      continue;
    }

    const policy = copyPolicyForField(field)
      ?? defaultPolicyForField(field, params.generatedColumns, systemColumns);
    switch (policy) {
      case "preserve":
        if (Object.prototype.hasOwnProperty.call(params.sourceRecord, field.columnName)) {
          values[field.columnName] = copyValueForField(field, params.sourceRecord[field.columnName]);
        }
        break;
      case "default": {
        const def = defaultValueForField(field);
        if (def.hasValue) values[field.columnName] = def.value;
        break;
      }
      case "target_status":
        values[field.columnName] = "draft";
        break;
      case "reparent":
      case "reset":
      case "regenerate":
      case "derive":
      case "exclude":
        break;
    }
  }

  for (const [column, value] of Object.entries(overrides)) {
    assertIdentifier(column, "override column");
    if (!params.generatedColumns.has(column)) values[column] = value;
  }

  if (fieldsByColumn.has("status") && !Object.prototype.hasOwnProperty.call(values, "status")) {
    values["status"] = "draft";
  }

  return values;
}

async function getGeneratedColumns(db: AnyDb, schema: string, table: string): Promise<Set<string>> {
  const key = `${schema}.${table}`;
  const cached = GENERATED_COLS_CACHE.get(key);
  if (cached) return cached;

  const rows = await db
    .selectFrom("information_schema.columns" as never)
    .select(["column_name"] as never[])
    .where("table_schema" as never, "=", schema as never)
    .where("table_name" as never, "=", table as never)
    .where("is_generated" as never, "=", "ALWAYS" as never)
    .execute() as Array<{ column_name: string }>;

  const columns = new Set(rows.map((row) => row.column_name));
  GENERATED_COLS_CACHE.set(key, columns);
  return columns;
}

function descriptorRank(row: EntityDescriptor, tenantId: string): number {
  const tenantScore = row.tenantId === tenantId ? 1000 : row.tenantId === null ? 500 : 0;
  const versionTenantScore = row.versionTenantId === tenantId ? 100 : row.versionTenantId === null ? 50 : 0;
  const statusScore = row.versionStatus === "EFFECTIVE" ? 10 : row.versionStatus === "APPROVED" ? 5 : 1;
  return tenantScore + versionTenantScore + statusScore + row.versionNo / 1000;
}

async function loadEntityDescriptor(db: AnyDb, entityCode: string, tenantId: string): Promise<EntityDescriptor> {
  const rows = await db
    .selectFrom("control.entity as e")
    .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
    .select([
      "e.id as id",
      "e.tenant_id as tenantId",
      "ev.id as versionId",
      "ev.tenant_id as versionTenantId",
      "ev.version_no as versionNo",
      "ev.status as versionStatus",
      "e.entity_code as entityCode",
      "e.table_schema as tableSchema",
      "e.table_name as tableName",
      "e.primary_key as primaryKey",
      "e.tenant_column as tenantColumn",
      "e.display_config as displayConfig",
      "e.identity_config as identityConfig",
      "e.create_mode as createMode",
      "e.numbering_strategy as numberingStrategy",
      "e.draft_ttl_hours as draftTtlHours",
    ] as never[])
    .where("e.entity_code" as never, "=", entityCode as never)
    .where("e.runtime_enabled" as never, "=", true as never)
    .where("e.status" as never, "=", "ACTIVE" as never)
    .where("e.is_active" as never, "=", true as never)
    .where("e.read_capability" as never, "<>", "none" as never)
    .where("e.write_capability" as never, "<>", "none" as never)
    .where("ev.status" as never, "=", "EFFECTIVE" as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) =>
      eb.or([
        eb("e.tenant_id" as never, "is", null),
        eb("e.tenant_id" as never, "=", tenantId as never),
      ]),
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) =>
      eb.or([
        eb("ev.tenant_id" as never, "is", null),
        eb("ev.tenant_id" as never, "=", tenantId as never),
      ]),
    )
    .execute() as EntityDescriptor[];

  const sorted = rows.sort((a, b) => descriptorRank(b, tenantId) - descriptorRank(a, tenantId));
  const descriptor = sorted[0];
  if (!descriptor) {
    throw Object.assign(new Error(`Entity '${entityCode}' not found`), { code: "ENTITY_NOT_FOUND" });
  }
  if (!descriptor.primaryKey) {
    throw Object.assign(new Error(`Entity '${entityCode}' has no declared primary key`), {
      code: "ENTITY_STORAGE_CONTRACT_INVALID",
    });
  }
  return descriptor;
}

async function loadEntityFields(db: AnyDb, versionId: string): Promise<EntityFieldRow[]> {
  return db
    .selectFrom("control.entity_field as ef")
    .select([
      "ef.name as name",
      "ef.column_name as columnName",
      "ef.data_type as dataType",
      "ef.origin as origin",
      "ef.is_required as isRequired",
      "ef.is_unique as isUnique",
      "ef.is_read_only as isReadOnly",
      "ef.is_computed as isComputed",
      "ef.is_write_once as isWriteOnce",
      "ef.is_deprecated as isDeprecated",
      "ef.is_active as isActive",
      "ef.default_value as defaultValue",
      "ef.ui_hint as uiHint",
    ] as never[])
    .where("ef.entity_version_id" as never, "=", versionId as never)
    .where("ef.is_active" as never, "=", true as never)
    .where("ef.runtime_enabled" as never, "=", true as never)
    .orderBy("ef.sort_order" as never, "asc")
    .execute() as Promise<EntityFieldRow[]>;
}

async function loadEntityRelations(db: AnyDb, versionId: string): Promise<EntityRelationRow[]> {
  return db
    .selectFrom("control.entity_relation as er")
    .select([
      "er.name as name",
      "er.relation_kind as relationKind",
      "er.target_entity as targetEntity",
      "er.fk_field as fkField",
      "er.ui_behavior as uiBehavior",
    ] as never[])
    .where("er.entity_version_id" as never, "=", versionId as never)
    .orderBy("er.name" as never, "asc")
    .execute() as Promise<EntityRelationRow[]>;
}

function getCopyConfig(entity: EntityDescriptor): JsonObject {
  return asObject(asObject(entity.displayConfig)["copy"]);
}

function numberingEnabled(entity: EntityDescriptor): boolean {
  const identityConfig = asObject(entity.identityConfig);
  const numbering = asObject(identityConfig["numbering"]);
  return asBoolean(numbering["enabled"]) ?? true;
}

function targetStatusForCopy(entity: EntityDescriptor): string | null {
  const value = getCopyConfig(entity)["target_status"];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveColumn(fields: EntityFieldRow[], logicalOrColumn: string): string {
  const field = fields.find((candidate) =>
    candidate.name === logicalOrColumn || candidate.columnName === logicalOrColumn,
  );
  const column = field?.columnName ?? logicalOrColumn;
  assertIdentifier(column, `column ${logicalOrColumn}`);
  return column;
}

function shouldCopyRelation(parent: EntityDescriptor, relation: EntityRelationRow): boolean {
  if (relation.relationKind !== "has_many") return false;
  const behavior = asObject(relation.uiBehavior);
  if (behavior["copy"] === true || behavior["copy_strategy"] === "clone_children") return true;
  return asStringArray(getCopyConfig(parent)["child_relations"]).includes(relation.name);
}

function fiscalYearFromRecord(record: Record<string, unknown>): number | null {
  const raw = record["fiscal_year"];
  const year = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(year) ? year : null;
}

function formatYear(year: number | null, format: string | undefined): string {
  const resolved = year ?? new Date().getUTCFullYear();
  return format === "YY" ? String(resolved).slice(-2) : String(resolved);
}

async function generateDocumentNumber(
  db: AnyDb,
  entity: EntityDescriptor,
  fields: EntityFieldRow[],
  sourceRecord: Record<string, unknown>,
  tenantId: string,
): Promise<{ column: string; value: string } | null> {
  if (!numberingEnabled(entity)) return null;

  const displayConfig = asObject(entity.displayConfig);
  const identityConfig = asObject(entity.identityConfig);
  const numberFieldName = asObject(displayConfig["document_header"])["number_field"]
    ?? asObject(identityConfig["numbering"])["field"]
    ?? asObject(asObject(identityConfig["header"])["primary"])["field"];
  if (typeof numberFieldName !== "string" || !numberFieldName) return null;

  const numberColumn = resolveColumn(fields, numberFieldName);
  const copyConfig = getCopyConfig(entity);
  const prefix = typeof copyConfig["number_prefix"] === "string"
    ? copyConfig["number_prefix"]
    : entity.entityCode.toUpperCase();
  const separator = typeof copyConfig["separator"] === "string" ? copyConfig["separator"] : "-";
  const fiscalYear = fiscalYearFromRecord(sourceRecord);
  const periodNumber = Number.parseInt(String(sourceRecord["period_number"] ?? ""), 10);
  const effectiveDate = normalizeDateOnly(sourceRecord["posting_date"] ?? sourceRecord["document_date"]);
  const companyCodeId = typeof sourceRecord["company_code_id"] === "string"
    ? sourceRecord["company_code_id"]
    : null;

  const config = await sql<{ available: boolean }>`
    SELECT EXISTS (
      SELECT 1
        FROM control.entity_numbering_config c
        JOIN control.entity e ON e.id = c.entity_id
       WHERE e.entity_code = ${entity.entityCode}
         AND c.is_active = true
         AND (c.tenant_id IS NULL OR c.tenant_id = ${tenantId}::uuid)
         AND c.number_field = ${numberFieldName}
         AND (c.company_code_id IS NULL OR c.company_code_id = ${companyCodeId}::uuid)
    ) AS available
  `.execute(db);

  if (config.rows[0]?.available) {
    const result = await sql<{ value: string }>`
      SELECT control.next_entity_number(
        ${tenantId}::uuid,
        ${entity.entityCode},
        ${numberFieldName},
        ${companyCodeId}::uuid,
        ${fiscalYear}::smallint,
        ${Number.isFinite(periodNumber) ? periodNumber : null}::smallint,
        NULL,
        ${effectiveDate}::date
      ) AS value
    `.execute(db);
    const value = result.rows[0]?.value;
    if (value) return { column: numberColumn, value };
  }

  const fullTable = qualifiedTable(entity);
  let countQuery = (db.selectFrom(fullTable) as any)
    .select(db.fn.countAll().as("cnt"));
  if (entity.tenantColumn) {
    assertIdentifier(entity.tenantColumn, "tenant column");
    countQuery = countQuery.where(entity.tenantColumn, "=", tenantId);
  }

  if (Object.prototype.hasOwnProperty.call(sourceRecord, "company_code_id") && sourceRecord["company_code_id"] != null) {
    countQuery = countQuery.where("company_code_id", "=", sourceRecord["company_code_id"]);
  }
  if (fiscalYear != null && Object.prototype.hasOwnProperty.call(sourceRecord, "fiscal_year")) {
    countQuery = countQuery.where("fiscal_year", "=", fiscalYear);
  }

  const countRow = await countQuery.executeTakeFirst() as { cnt?: string | number | bigint } | undefined;
  const sequence = Number.parseInt(String(countRow?.cnt ?? "0"), 10) + 1;
  const configuredPadding = typeof copyConfig["sequence_padding"] === "number"
    ? copyConfig["sequence_padding"]
    : 5;
  const padding = Number.isFinite(configuredPadding) && configuredPadding > 0 ? configuredPadding : 5;
  const parts = [prefix, formatYear(fiscalYear, "YYYY"), String(sequence).padStart(padding, "0")];

  return { column: numberColumn, value: parts.filter(Boolean).join(separator) };
}

async function cloneChildRelation(
  db: AnyDb,
  params: {
    parent: EntityDescriptor;
    relation: EntityRelationRow;
    sourceParentId: string;
    newParentId: string;
    tenantId: string;
    actorId: string;
    logger?: CopyLogger;
  },
): Promise<number> {
  if (!params.relation.fkField) return 0;

  const child = await loadEntityDescriptor(db, params.relation.targetEntity, params.tenantId);
  const childFields = await loadEntityFields(db, child.versionId);
  const childGenerated = await getGeneratedColumns(db, child.tableSchema, child.tableName);
  const childTable = qualifiedTable(child);
  const fkColumn = resolveColumn(childFields, params.relation.fkField);

  let query = (db.selectFrom(childTable) as any)
    .selectAll()
    .where(fkColumn, "=", params.sourceParentId);
  if (child.tenantColumn) {
    assertIdentifier(child.tenantColumn, "tenant column");
    query = query.where(child.tenantColumn, "=", params.tenantId);
  }

  if (childFields.some((field) => field.columnName === "line_no")) {
    query = query.orderBy("line_no", "asc");
  }

  const childRows = await query.execute() as Array<Record<string, unknown>>;
  if (childRows.length === 0) return 0;

  const insertRows = childRows.map((childRow) =>
    buildInsertValues({
      sourceRecord: childRow,
      fields: childFields,
      generatedColumns: childGenerated,
      primaryKey: child.primaryKey,
      tenantColumn: child.tenantColumn,
      tenantId: params.tenantId,
      actorId: params.actorId,
      targetStatus: null,
      overrides: { [fkColumn]: params.newParentId },
    }),
  );

  await (db.insertInto(childTable) as any)
    .values(insertRows)
    .execute();

  params.logger?.info?.("record_copy_child_relation", {
    entity: params.parent.entityCode,
    relation: params.relation.name,
    targetEntity: child.entityCode,
    copied: insertRows.length,
  });

  return insertRows.length;
}

export async function copyRecordFromMetadata(
  db: AnyDb,
  tenantId: string,
  entityCode: string,
  recordId: string,
  actorId: string,
  logger?: CopyLogger,
): Promise<CopyRecordResult> {
  return db.transaction().execute(async (trx) => {
    await sql`SELECT set_config('app.current_principal_id', ${actorId}, true)`.execute(trx);

    const entity = await loadEntityDescriptor(trx, entityCode, tenantId);
    const fields = await loadEntityFields(trx, entity.versionId);
    const relations = await loadEntityRelations(trx, entity.versionId);
    const generatedColumns = await getGeneratedColumns(trx, entity.tableSchema, entity.tableName);
    const fullTable = qualifiedTable(entity);
    const targetStatus = targetStatusForCopy(entity);

    let sourceQuery = (trx.selectFrom(fullTable) as any).selectAll();
    sourceQuery = applyEntityScope(sourceQuery, entity, recordId, tenantId);
    const sourceRecord = await sourceQuery.executeTakeFirst() as Record<string, unknown> | undefined;

    if (!sourceRecord) {
      throw Object.assign(new Error(`Record '${recordId}' not found`), { code: "RECORD_NOT_FOUND" });
    }

    const insertValues = buildInsertValues({
      sourceRecord,
      fields,
      generatedColumns,
      primaryKey: entity.primaryKey,
      tenantColumn: entity.tenantColumn,
      tenantId,
      actorId,
      targetStatus,
    });

    const naming = resolveEntityIdentity({
      identityConfig: entity.identityConfig,
      context: "copy",
      entityLabel: entity.entityCode.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "),
      sourceRecord,
      targetRecord: insertValues,
    });
    Object.assign(insertValues, naming.values);
    if (Object.keys(naming.provenance).length > 0) {
      insertValues["metadata"] = mergeFieldProvenance(insertValues["metadata"], naming.provenance);
    }

    const numbering = asObject(asObject(entity.identityConfig)["numbering"]);
    const allocationStrategy = String(numbering["strategy"] ?? entity.numberingStrategy ?? "");
    const numberField = typeof numbering["field"] === "string" ? numbering["field"] : "code";
    const numberColumn = resolveColumn(fields, numberField);
    if (allocationStrategy === "AUTO_ON_PROMOTE") {
      insertValues[numberColumn] = "";
      if (fields.some((field) => field.columnName === "is_provisional")) insertValues["is_provisional"] = true;
      if (fields.some((field) => field.columnName === "draft_started_by")) insertValues["draft_started_by"] = actorId;
      if (fields.some((field) => field.columnName === "draft_started_at")) insertValues["draft_started_at"] = new Date();
      if (fields.some((field) => field.columnName === "draft_expires_at")) {
        const ttlHours = entity.draftTtlHours && entity.draftTtlHours > 0 ? entity.draftTtlHours : 24;
        insertValues["draft_expires_at"] = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
      }
    }

    const generatedNumber = allocationStrategy === "AUTO_ON_PROMOTE"
      ? null
      : await generateDocumentNumber(trx, entity, fields, sourceRecord, tenantId);
    if (generatedNumber) {
      insertValues[generatedNumber.column] = generatedNumber.value;
    }

    const inserted = await (trx.insertInto(fullTable) as any)
      .values(insertValues)
      .returningAll()
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (inserted?.[entity.primaryKey] === undefined || inserted?.[entity.primaryKey] === null) {
      throw Object.assign(new Error("Copy insert did not return a record"), { code: "COPY_INSERT_FAILED" });
    }

    const newRecordId = String(inserted[entity.primaryKey]);
    const copiedChildren: Record<string, number> = {};
    if (entity.entityCode === "purchase_order") {
      const sourceLines = await sql<{ id: string }>`
        SELECT id
          FROM document.commitment_line
         WHERE tenant_id = ${tenantId}::uuid
           AND commitment_id = ${recordId}::uuid
         ORDER BY line_no
      `.execute(trx);
      const graphTotals = {
        lines: 0,
        accountingDistributions: 0,
        pricingComponents: 0,
        schedules: 0,
      };
      for (const sourceLine of sourceLines.rows) {
        const copied = await copyCommitmentLineInTransaction(trx, {
          tenantId,
          sourceCommitmentId: recordId,
          commitmentId: newRecordId,
          lineId: sourceLine.id,
          principalId: actorId,
          includeChildren: {
            accountingDistributions: true,
            pricingComponents: true,
            schedules: true,
          },
        });
        graphTotals.lines += 1;
        graphTotals.accountingDistributions += copied.children.accountingDistributions;
        graphTotals.pricingComponents += copied.children.pricingComponents;
        graphTotals.schedules += copied.children.schedules;
      }
      copiedChildren["lines"] = graphTotals.lines;
      copiedChildren["accounting_distributions"] = graphTotals.accountingDistributions;
      copiedChildren["pricing_components"] = graphTotals.pricingComponents;
      copiedChildren["schedules"] = graphTotals.schedules;
      await refreshCommitmentHeaderAmounts(trx, {
        tenantId,
        commitmentId: newRecordId,
        principalId: actorId,
      });
    }

    const controlledPurchaseOrderRelations = new Set([
      "lines", "accounting_distributions", "pricing_components", "schedules",
    ]);
    for (const relation of relations.filter((relation) =>
      shouldCopyRelation(entity, relation)
      && !(entity.entityCode === "purchase_order" && controlledPurchaseOrderRelations.has(relation.name)),
    )) {
      copiedChildren[relation.name] = await cloneChildRelation(trx, {
        parent: entity,
        relation,
        sourceParentId: recordId,
        newParentId: newRecordId,
        tenantId,
        actorId,
        logger,
      });
    }

    let record = inserted;
    if (targetStatus && targetStatus !== "draft" && Object.prototype.hasOwnProperty.call(inserted, "status")) {
      let updateQuery = (trx.updateTable(fullTable) as any)
        .set({
          status: targetStatus,
          updated_by: actorId,
        });
      updateQuery = applyEntityScope(updateQuery, entity, newRecordId, tenantId)
        .where("status", "=", "draft");
      const updated = await updateQuery
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!updated) {
        throw Object.assign(new Error(`Copied record could not move to ${targetStatus}`), { code: "COPY_STATUS_FAILED" });
      }
      record = updated;
    }

    logger?.info?.("record_copy_metadata", {
      entity: entityCode,
      tenantId,
      sourceId: recordId,
      newId: newRecordId,
      copiedChildren,
    });

    return { id: newRecordId, record, copiedChildren };
  });
}
