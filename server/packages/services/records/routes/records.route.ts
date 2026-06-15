/**
 * Records Routes — CRUD for master entity records
 *
 * GET    /api/records/:entity           — paginated list
 * GET    /api/records/:entity/:id       — single record
 * POST   /api/records/:entity           — create
 * PUT    /api/records/:entity/:id       — full update (requires { data: {...} } wrapper)
 * PATCH  /api/records/:entity/:id       — partial update (flat body or { data: {...} } wrapper)
 * DELETE /api/records/:entity/:id       — delete
 *
 * Routes resolve the entity's backing table from control.entity,
 * then execute queries against {schema}.{table_name}.
 *
 * Create/update inject required audit columns (tenant_id, created_by/updated_by)
 * from the request auth token and X-Org / X-Realm headers.
 * Field names in the request body are remapped to their physical column_names
 * via control.entity_field, so the form can use logical field names.
 */

import type { RequestHandler, Response, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  resolveTenantId,
  SYSTEM_PRINCIPAL_UUID,
  resolvePrincipalIdOrNull,
  resolvePrincipalIdWithJit,
  resolveFieldMap,
  resolveArrayColumns,
  resolveJsonColumns,
  coerceArrayFields,
  serializeJsonFields,
  emitOutboxEvent,
  mapPostgresBusinessError,
} from "@athyper/svc-shared";
import { applyFieldSecurityMask } from "@athyper/svc-policy";
import { checkPermission, createCompanyCodeScopeService, requireAllow } from "@athyper/svc-iam";
import {
  acquireLock,
  verifyLock,
  renewLock,
  releaseLock,
  forceReleaseLock,
  getLockStatus,
  resolveConcurrencyPolicy,
} from "@athyper/svc-shared";
import type { CacheClient } from "@athyper/svc-iam";
import {
  resolveParameterSnapshot,
  getIntParam,
  getStringParam,
} from "@athyper/svc-iam";
import { resolveLineClassification } from "@athyper/svc-business";
import {
  authorizeEntityMutation,
  checkEntityMutationAuthorization,
  isEntityFieldWritable,
  resolveEntityWriteFieldRules,
  type EntityMutationTableInfo,
  type EntityWriteFieldRule,
  type FieldNonWritableReason,
} from "./entity-mutation-guard.js";
import type { RedisClient } from "@athyper/adapter-memorycache";
import {
  buildEntityListCountCacheKey,
  buildEntityListPageCacheKey,
  invalidateEntityListCache,
  resolveEntityListVersion,
  stableEntityListCacheHash,
} from "../cache/list-cache.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE     = 500;
const DEFAULT_LOCK_TTL_SECONDS = 300;
const DEFAULT_PROCUREMENT_LINE_UOM_PARAMETER_CODE = "finance.ap.default_procurement_line_uom";
const DEFAULT_PROCUREMENT_LINE_UOM_FALLBACK = "EA";
const TEXT_SEARCH_DATA_TYPES = new Set([
  "email",
  "enum",
  "lifecycle_state",
  "phone",
  "string",
  "text",
  "url",
]);
type EntitySearchOperator = "contains";

interface EntitySearchConfig {
  enabled: boolean;
  fields: string[];
  rank: Record<string, number>;
  minQueryLength: number;
  operator: EntitySearchOperator;
  hasConfiguredFields: boolean;
}

const LINE_CLASSIFICATION_INPUT_FIELDS = [
  "commodity_category_id",
  "business_intent_id",
  "item_id",
  "item_description",
  "description",
  "metadata",
  "data",
  "unspsc_code",
  "hs_code",
  "trade_code",
  "commodity_code",
  "commodity_domain",
  "commodity_domain_code",
  "line_commodity_code",
  "quantity",
  "unit_price",
  "price_unit",
  "gross_amount",
  "line_amount",
  "discount_pct",
  "tax_group_id",
  "withholding_tax_group_id",
  "is_asset",
  "asset_category_id",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nextConfiguredEntityNumber(db: Kysely<any>, params: {
  tenantId: string;
  entityCode: string;
  numberField: string;
  companyCodeId?: string | null;
  fiscalYear?: number | null;
  periodNumber?: number | null;
  effectiveDate?: string | Date | null;
}): Promise<string | null> {
  try {
    const result = await sql<{ value: string }>`
      SELECT control.next_entity_number(
        ${params.tenantId}::uuid,
        ${params.entityCode},
        ${params.numberField},
        ${params.companyCodeId ?? null}::uuid,
        ${params.fiscalYear ?? null}::smallint,
        ${params.periodNumber ?? null}::smallint,
        NULL,
        ${params.effectiveDate ?? null}::date
      ) AS value
    `.execute(db);
    return result.rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

export interface RecordsRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
  cache?: CacheClient;
  /**
   * Phase 11 #2: optional ioredis client for record-level pub/sub. When
   * present, status changes during edit publish to `record:<tenant>:<entity>:<id>`
   * channels and the SSE endpoint subscribes. When absent the SSE endpoint
   * still serves keepalive comments; clients can fall back to polling.
   */
  redis?: RedisClient;
}

// ── Entity table resolver ─────────────────────────────────────────────────────

interface EntityTableInfo {
  entity_id:           string;
  version_id:          string;
  name:                string;
  table_schema:        string;
  table_name:          string;
  natural_key_fields:  string[];
  entity_class:        string;
  ownership_model:     string;
  backing_type:        string;
  mutability:          string;
  identity_config:     Record<string, unknown>;
  feature_flags:       Record<string, unknown>;
  concurrency_policy:  Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveEntityTable(db: Kysely<any>, entityCode: string): Promise<EntityTableInfo | null> {
  // Normalise URL slug → DB name (journal-entry → journal_entry)
  const name = entityCode.replace(/-/g, "_");
  const row = await db
    .selectFrom("control.entity as e")
    .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
    .select([
      "e.id",
      "e.name",
      "e.table_schema",
      "e.table_name",
      "e.entity_class",
      "e.ownership_model",
      "e.backing_type",
      "e.mutability",
      "e.identity_config",
      "e.feature_flags",
      "e.concurrency_policy",
      sql<string>`ev.id`.as("version_id"),
    ] as never[])
    .where("e.name", "=", name)
    .where("e.tenant_id", "is", null)
    .where("ev.status", "=", "EFFECTIVE")
    .executeTakeFirst() as Record<string, unknown> | undefined;
  if (!row) return null;

  const identityConfig = asPlainObject(row["identity_config"]);
  const featureFlags = (row["feature_flags"] && typeof row["feature_flags"] === "object")
    ? (row["feature_flags"] as Record<string, unknown>)
    : {};
  if (featureFlags["generic_runtime_disabled"] === true || featureFlags["records_api_disabled"] === true) {
    return null;
  }

  const businessKeyFields = stringArray(identityConfig["business_key_fields"]);
  const identityNaturalKeyFields = stringArray(identityConfig["natural_key_fields"])
    .filter((fieldName) => fieldName !== "tenant_id" && fieldName !== "id");

  return {
    entity_id:           String(row["id"]),
    version_id:          String(row["version_id"]),
    name:                String(row["name"]),
    table_schema:        String(row["table_schema"]),
    table_name:          String(row["table_name"]),
    natural_key_fields:  businessKeyFields.length > 0
      ? businessKeyFields
      : identityNaturalKeyFields,
    entity_class:        String(row["entity_class"] ?? ""),
    ownership_model:     String(row["ownership_model"] ?? "system"),
    backing_type:        String(row["backing_type"] ?? "table"),
    mutability:          String(row["mutability"] ?? "controlled"),
    identity_config:     identityConfig,
    feature_flags:       featureFlags,
    concurrency_policy:  (row["concurrency_policy"] && typeof row["concurrency_policy"] === "object") ? (row["concurrency_policy"] as Record<string, unknown>) : {},
  };
}

function toMutationTableInfo(table: EntityTableInfo): EntityMutationTableInfo {
  return {
    entity_id: table.entity_id,
    version_id: table.version_id,
    name: table.name,
    table_schema: table.table_schema,
    table_name: table.table_name,
    backing_type: table.backing_type,
    entity_class: table.entity_class,
    mutability: table.mutability,
    feature_flags: table.feature_flags,
  };
}

/**
 * Fetches the current status of a record for field-level gate evaluation.
 *
 * For child entities whose editability is governed by a parent document's
 * lifecycle (e.g. `purchase_invoice_line` follows `purchase_invoice.status`),
 * this resolves the parent's status instead of the child's own status column
 * (which represents a different concept like 'open'/'closed' on line rows).
 *
 * Returns null when the entity has no status column or the record is missing —
 * isEntityFieldWritable interprets null as "no status gate enforced."
 */
async function fetchRecordStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  fullTable: `${string}.${string}`,
  recordId: string,
  tenantId: string,
): Promise<string | null> {
  const tableName = fullTable.split(".")[1];

  // ── purchase_invoice_line → parent purchase_invoice.status ─────────────────
  if (tableName === "purchase_invoice_line") {
    try {
      const row = await sql<{ status: string }>`
        SELECT pi.status
          FROM document.purchase_invoice pi
          JOIN document.purchase_invoice_line pil
            ON pil.purchase_invoice_id = pi.id
           AND pil.tenant_id           = pi.tenant_id
         WHERE pil.id        = ${recordId}::uuid
           AND pil.tenant_id = ${tenantId}::uuid
         LIMIT 1
      `.execute(db);
      return row.rows[0]?.status ?? null;
    } catch {
      return null;
    }
  }

  // ── accounting_distribution → polymorphic parent doc status ────────────────
  // source_doc_type identifies the parent table; source_doc_id is the parent
  // HEADER id (verified via invoice-posting.service.ts insert pattern).
  // Sprint 1 covers PURCHASE_INVOICE_LINE only; other source types fall
  // through to the own-status path (which returns null → no gate enforced).
  if (tableName === "accounting_distribution") {
    try {
      const row = await sql<{ status: string }>`
        SELECT pi.status
          FROM document.accounting_distribution ad
          JOIN document.purchase_invoice pi
            ON pi.id        = ad.source_doc_id
           AND pi.tenant_id = ad.tenant_id
         WHERE ad.id              = ${recordId}::uuid
           AND ad.tenant_id       = ${tenantId}::uuid
           AND ad.source_doc_type = 'PURCHASE_INVOICE_LINE'
         LIMIT 1
      `.execute(db);
      if (row.rows[0]?.status) return row.rows[0].status;
      // Fall through: other source_doc_type values not yet wired
      return null;
    } catch {
      return null;
    }
  }

  // ── Default: read own status column ────────────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (db.selectFrom(fullTable) as any)
      .select(["status"])
      .where("id", "=", recordId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst() as { status?: string } | undefined;
    if (!row) return null;
    return typeof row.status === "string" ? row.status : null;
  } catch {
    // Entity has no `status` column — return null so the guard skips the check.
    return null;
  }
}

/**
 * Collects field-level status-lock violations across the inbound payload.
 * Only FIELD_LOCKED_BY_STATUS results in a hard 400; other non-writable reasons
 * (read-only, computed, not-registered, system-managed) continue to be silently
 * dropped to preserve back-compat with forms that send unknown/system fields.
 */
function collectStatusLockedFields(
  inputData: Record<string, unknown>,
  writeRules: Map<string, EntityWriteFieldRule>,
  recordStatus: string | null,
): Array<{ field: string; reason: string }> {
  const locked: Array<{ field: string; reason: string }> = [];
  for (const fieldName of Object.keys(inputData)) {
    const rule = writeRules.get(fieldName);
    if (!rule) continue;
    const w = isEntityFieldWritable(rule, "update", recordStatus);
    if (!w.writable && w.reason === "FIELD_LOCKED_BY_STATUS") {
      locked.push({ field: fieldName, reason: w.reason });
    }
  }
  return locked;
}

/**
 * Maps server FieldNonWritableReason → client-side LockedFieldReason string.
 *
 * Kept in sync with the LockedFieldReason enum in
 * packages/shared/api-contracts/src/schemas/edit-session.ts.
 *
 * Returns null for FIELD_NOT_REGISTERED — those fields are simply omitted
 * from the mask rather than reported as locked, since the entity does not
 * acknowledge them at all.
 */
type EditSessionLockedReason =
  | "status_locked"
  | "permission_locked"
  | "pii_masked"
  | "readonly"
  | "computed"
  | "system";

function mapNonWritableReasonToLockedReason(
  reason: FieldNonWritableReason,
): EditSessionLockedReason | null {
  switch (reason) {
    case "FIELD_NOT_REGISTERED":  return null;
    case "FIELD_READ_ONLY":       return "readonly";
    case "FIELD_COMPUTED":        return "computed";
    case "FIELD_WRITE_ONCE":      return "readonly";
    case "FIELD_SYSTEM_MANAGED":  return "system";
    case "FIELD_SYSTEM_ORIGIN":   return "system";
    case "FIELD_NOT_EDITABLE":    return "readonly";
    case "FIELD_LOCKED_BY_STATUS": return "status_locked";
    default:                      return "readonly";
  }
}

/**
 * Builds the edit-context field + section mask for an entity at a given status.
 *
 * The mask is server-truthed: every field rule is evaluated against the
 * current record status, and the result is returned as a plain object so
 * the client can render Read vs Edit variants per field without re-deriving
 * the gate logic.
 */
function buildEditContextMask(
  writeRules: Map<string, EntityWriteFieldRule>,
  recordStatus: string | null,
): {
  fieldMask: Record<string, { editable: boolean; reason?: EditSessionLockedReason; message?: string }>;
  sectionMask: Record<string, { hasEditableFields: boolean; editableFieldCount: number }>;
} {
  const fieldMask: Record<string, { editable: boolean; reason?: EditSessionLockedReason }> = {};
  let editableCount = 0;
  for (const [fieldName, rule] of writeRules) {
    const writability = isEntityFieldWritable(rule, "update", recordStatus);
    if (writability.writable) {
      fieldMask[fieldName] = { editable: true };
      editableCount++;
    } else {
      const reason = mapNonWritableReasonToLockedReason(writability.reason);
      if (reason === null) continue;
      fieldMask[fieldName] = { editable: false, reason };
    }
  }
  return {
    fieldMask,
    sectionMask: {
      __overview: {
        hasEditableFields: editableCount > 0,
        editableFieldCount: editableCount,
      },
    },
  };
}

function parseJsonPathColumn(columnName: string): { root: string; path: string[] } | null {
  const dotIdx = columnName.indexOf(".");
  if (dotIdx <= 0) return null;
  const root = columnName.slice(0, dotIdx);
  const rest = columnName.slice(dotIdx + 1);
  if (root !== "metadata") return null;
  const path = rest.split(".").map((part) => part.trim()).filter(Boolean);
  if (path.length === 0) return null;
  if (!path.every((part) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part))) return null;
  return { root, path };
}

function storageColumnName(columnName: string): string {
  return parseJsonPathColumn(columnName)?.root ?? columnName;
}

function isTextSearchDataType(dataType: string | null | undefined): boolean {
  return TEXT_SEARCH_DATA_TYPES.has(String(dataType ?? "").toLowerCase());
}

function asPlainObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, unknown>) };
      }
    } catch { /* keep empty object */ }
  }
  return {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function numberRecord(value: unknown): Record<string, number> {
  const record = asPlainObject(value);
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) {
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (key && Number.isFinite(parsed)) out[key] = parsed;
  }
  return out;
}

function normalizeEntitySearchConfig(
  searchConfigRaw: unknown,
  defaultMinQueryLength = 1,
): EntitySearchConfig {
  const searchConfig = asPlainObject(searchConfigRaw);
  const hasConfiguredFields = Array.isArray(searchConfig["fields"]);
  const configuredFields = stringArray(searchConfig["fields"]);

  const minQueryLengthRaw = Number(searchConfig["min_query_length"] ?? defaultMinQueryLength);
  const minQueryLength = Number.isFinite(minQueryLengthRaw)
    ? Math.max(1, Math.floor(minQueryLengthRaw))
    : 1;

  return {
    enabled: searchConfig["enabled"] !== false,
    fields: hasConfiguredFields ? configuredFields : [],
    rank: numberRecord(searchConfig["rank"]),
    minQueryLength,
    operator: "contains",
    hasConfiguredFields,
  };
}

function searchPattern(term: string, operator: EntitySearchOperator): string {
  switch (operator) {
    case "contains":
    default:
      return `%${term}%`;
  }
}

function searchRankForField(config: EntitySearchConfig, fieldName: string, fallbackIndex: number): number {
  const configured = config.rank[fieldName];
  if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) return configured;
  const configuredIndex = config.fields.indexOf(fieldName);
  if (configuredIndex >= 0) return Math.max(1, config.fields.length - configuredIndex);
  if (config.fields.length > 0) return Math.max(1, config.fields.length - fallbackIndex);
  return 1;
}

function buildSearchScoreExpression(
  fields: Array<{ columnName: string; rank: number }>,
  term: string,
) {
  const exactPattern = term;
  const prefixPattern = `${term}%`;
  const containsPattern = `%${term}%`;
  const parts = fields.map(({ columnName, rank }) => sql<number>`
    CASE
      WHEN COALESCE(${sql.ref(columnName)}::text, '') ILIKE ${exactPattern} THEN ${rank * 100}
      WHEN COALESCE(${sql.ref(columnName)}::text, '') ILIKE ${prefixPattern} THEN ${rank * 10}
      WHEN COALESCE(${sql.ref(columnName)}::text, '') ILIKE ${containsPattern} THEN ${rank}
      ELSE 0
    END
  `);
  return sql<number>`(${sql.join(parts, sql` + `)})`;
}

function setJsonPath(target: Record<string, unknown>, path: string[], value: unknown): void {
  let cursor = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i]!;
    const existing = cursor[key];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]!] = value;
}

function getJsonPath(source: unknown, path: string[]): unknown {
  let cursor: unknown = source;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor ?? null;
}

function assignMappedValue(mappedData: Record<string, unknown>, columnName: string, value: unknown): void {
  const jsonPath = parseJsonPathColumn(columnName);
  if (!jsonPath) {
    mappedData[columnName] = value;
    return;
  }
  const rootObject = asPlainObject(mappedData[jsonPath.root]);
  setJsonPath(rootObject, jsonPath.path, value);
  mappedData[jsonPath.root] = rootObject;
}

function readMappedValue(row: Record<string, unknown>, columnName: string): unknown {
  const jsonPath = parseJsonPathColumn(columnName);
  if (!jsonPath) return row[columnName];
  return getJsonPath(row[jsonPath.root], jsonPath.path);
}

function remapRecordRow(row: Record<string, unknown>, fieldMap: Map<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const [fieldName, columnName] of fieldMap.entries()) {
    const value = readMappedValue(row, columnName);
    if (value !== undefined) out[fieldName] = value;
  }
  return out;
}

function mergeJsonColumnUpdates(
  mappedData: Record<string, unknown>,
  existingRow: Record<string, unknown> | undefined,
  jsonColumns: Map<string, string>,
): void {
  for (const columnName of jsonColumns.keys()) {
    const nextValue = mappedData[columnName];
    if (!nextValue || typeof nextValue !== "object" || Array.isArray(nextValue)) continue;
    mappedData[columnName] = {
      ...asPlainObject(existingRow?.[columnName]),
      ...(nextValue as Record<string, unknown>),
    };
  }
}

function includeMappedJsonObjects(
  mappedData: Record<string, unknown>,
  jsonColumns: Map<string, string>,
): void {
  if (mappedData["metadata"] !== undefined) jsonColumns.set("metadata", "jsonb");
}

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "t", "yes", "y", "1", "on"].includes(normalized)) return true;
  if (["false", "f", "no", "n", "0", "off"].includes(normalized)) return false;
  return null;
}

function jsonStringArray(value: unknown): string[] {
  const raw = typeof value === "string" && value.trim().startsWith("[")
    ? (() => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    })()
    : value;

  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().toLowerCase());
}

function normalizeCommodityCategoryDomainGuards(
  entityCode: string,
  mappedData: Record<string, unknown>,
  existingRow?: Record<string, unknown>,
): void {
  if (entityCode.replace(/-/g, "_") !== "commodity_category") return;

  const isHsRequired = parseBooleanLike(
    mappedData["is_hs_required"] ?? existingRow?.["is_hs_required"],
  );
  if (isHsRequired !== true) return;

  const domains = new Set(jsonStringArray(
    mappedData["allowed_classification_domains"] ?? existingRow?.["allowed_classification_domains"],
  ));
  domains.add("hs");
  mappedData["allowed_classification_domains"] = [...domains];
}

function parseFeatureScope(scope: unknown): { column: string; value: string } | null {
  if (typeof scope !== "string") return null;
  const eqIdx = scope.indexOf("=");
  if (eqIdx <= 0) return null;

  const column = scope.slice(0, eqIdx).trim();
  const value  = scope.slice(eqIdx + 1).trim();

  if (!column || !value) return null;
  if (!/^[a-z][a-z0-9_]*$/.test(column)) return null;

  return { column, value };
}

// ── Business-key / UUID dual resolver ────────────────────────────────────────

function stringConfigValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function identityParentRecord(identityConfig: Record<string, unknown>): Record<string, unknown> {
  return asPlainObject(identityConfig["parent"]);
}

function parentFkFromConfigs(
  identityConfig: Record<string, unknown>,
  featureFlags: Record<string, unknown>,
): string | null {
  return stringConfigValue(identityParentRecord(identityConfig)["field"])
    ?? stringConfigValue(featureFlags["parent_fk"]);
}

function parentScopeFromConfigs(
  identityConfig: Record<string, unknown>,
  featureFlags: Record<string, unknown>,
): string | null {
  return stringConfigValue(identityParentRecord(identityConfig)["scope"])
    ?? stringConfigValue(featureFlags["parent_scope"]);
}

function configuredListEntityCode(table: EntityTableInfo): string | null {
  return stringConfigValue(table.identity_config["list_entity_code"])
    ?? stringConfigValue(table.feature_flags["list_entity_code"]);
}

function configuredIdentityVia(table: EntityTableInfo): string | null {
  return stringConfigValue(table.identity_config["identity_via"])
    ?? stringConfigValue(table.feature_flags["identity_via"]);
}

function configuredParentFk(table: EntityTableInfo): string | null {
  return parentFkFromConfigs(table.identity_config, table.feature_flags);
}

function configuredParentScope(table: EntityTableInfo): string | null {
  return parentScopeFromConfigs(table.identity_config, table.feature_flags);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rejectInvalidUuidParam(res: Response, value: string, label: string): boolean {
  if (UUID_RE.test(value)) return false;
  res.status(400).json({ error: "INVALID_ID", message: `${label} must be a valid UUID` });
  return true;
}

function readJwtSubject(claims: Record<string, unknown>): string | null {
  const sub = typeof claims.sub === "string" ? claims.sub.trim() : "";
  return sub.length > 0 ? sub : null;
}

function requireJwtSubject(claims: Record<string, unknown>, res: Response): string | null {
  const sub = readJwtSubject(claims);
  if (sub) return sub;
  res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim." });
  return null;
}

function isCertificationBackingTable(table: EntityTableInfo): boolean {
  return table.table_schema === "master" && table.table_name === "certification";
}

function isCommodityClassificationBackingTable(table: EntityTableInfo): boolean {
  return table.table_schema === "master" && table.table_name === "commodity_classification";
}

// Adds display-only values from the existing certification_type table. These are
// virtual API fields, not DDL columns.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichCertificationTypeDisplayFields(
  db: Kysely<any>,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const typeIds = Array.from(new Set(
    rows
      .map((row) => row["certification_type_id"])
      .filter((id): id is string => typeof id === "string" && UUID_RE.test(id)),
  ));

  if (typeIds.length === 0) {
    return rows.map((row) => ({
      ...row,
      certification_display_name: row["custom_name"] ?? null,
      certification_type_name:    null,
      certification_type_code:    null,
      certification_category:     null,
      certification_issuing_body: null,
    }));
  }

  const typeRows = await db
    .selectFrom("master.certification_type as ct" as never)
    .select([
      "ct.id",
      "ct.code",
      "ct.name",
      "ct.category",
      "ct.issuing_body",
    ] as never[])
    .where("ct.id" as never, "in", typeIds as never)
    .execute() as Record<string, unknown>[];

  const typeById = new Map<string, Record<string, unknown>>();
  for (const typeRow of typeRows) {
    if (typeof typeRow["id"] === "string") typeById.set(typeRow["id"], typeRow);
  }

  return rows.map((row) => {
    const typeId = row["certification_type_id"];
    const typeRow = typeof typeId === "string" ? typeById.get(typeId) : undefined;
    const typeName = typeRow?.["name"] ?? null;

    return {
      ...row,
      certification_display_name: typeName ?? row["custom_name"] ?? null,
      certification_type_name:    typeName,
      certification_type_code:    typeRow?.["code"] ?? null,
      certification_category:     typeRow?.["category"] ?? null,
      certification_issuing_body: typeRow?.["issuing_body"] ?? null,
    };
  });
}

// Adds display-only code values for the polymorphic commodity_classification
// bridge. These are virtual API fields backed by shared.commodity_code or
// shared.industry_code, so the generic app can avoid showing code_id UUIDs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichCommodityClassificationDisplayFields(
  db: Kysely<any>,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const commodityIds = Array.from(new Set(
    rows
      .filter((row) => row["classification_type"] === "commodity")
      .map((row) => row["code_id"])
      .filter((id): id is string => typeof id === "string" && UUID_RE.test(id)),
  ));
  const industryIds = Array.from(new Set(
    rows
      .filter((row) => row["classification_type"] === "industry")
      .map((row) => row["code_id"])
      .filter((id): id is string => typeof id === "string" && UUID_RE.test(id)),
  ));

  const [commodityRows, industryRows] = await Promise.all([
    commodityIds.length > 0
      ? db
        .selectFrom("shared.commodity_code as cc" as never)
        .select(["cc.id", "cc.code", "cc.name", "cc.domain_code", "cc.level_no"] as never[])
        .where("cc.id" as never, "in", commodityIds as never)
        .execute() as Promise<Record<string, unknown>[]>
      : Promise.resolve([]),
    industryIds.length > 0
      ? db
        .selectFrom("shared.industry_code as ic" as never)
        .select(["ic.id", "ic.code", "ic.name", "ic.domain_code", "ic.level_no"] as never[])
        .where("ic.id" as never, "in", industryIds as never)
        .execute() as Promise<Record<string, unknown>[]>
      : Promise.resolve([]),
  ]);

  const codeById = new Map<string, Record<string, unknown>>();
  for (const codeRow of [...commodityRows, ...industryRows]) {
    if (typeof codeRow["id"] === "string") codeById.set(codeRow["id"], codeRow);
  }

  return rows.map((row) => {
    const codeId = row["code_id"];
    const codeRow = typeof codeId === "string" ? codeById.get(codeId) : undefined;
    const code = codeRow?.["code"] ?? null;
    const name = codeRow?.["name"] ?? null;
    const label = code && name ? `${code} - ${name}` : (code ?? name ?? null);

    return {
      ...row,
      system_code:  code,
      system_name:  name,
      system_label: label,
      code_domain:  codeRow?.["domain_code"] ?? row["domain_code"] ?? null,
      code_level:   codeRow?.["level_no"] ?? null,
    };
  });
}

/**
 * Resolve a record row by either UUID (globally unique, no tenant scope) or
 * canonical business key (tenant-scoped via natural_key_fields).
 *
 * Returns undefined when:
 *   - id is not a UUID and no natural_key_fields are configured
 *   - id is not a UUID and tenantId is null
 *   - the row simply does not exist
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveRecordRow(
  db:               Kysely<any>,
  fullTable:        `${string}.${string}`,
  id:               string,
  naturalKeyFields: string[],
  fieldMap:         Map<string, string>,
  tenantId:         string | null,
): Promise<Record<string, unknown> | undefined> {
  if (UUID_RE.test(id)) {
    return db
      .selectFrom(fullTable)
      .selectAll()
      .where("id" as never, "=", id as never)
      .executeTakeFirst() as Promise<Record<string, unknown> | undefined>;
  }

  // Business-key path — requires tenant scope and at least one natural key field
  if (!tenantId || naturalKeyFields.length === 0) return undefined;

  // Map logical field names → physical column names
  const nkColumns = naturalKeyFields.map((f) => fieldMap.get(f) ?? f);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db
    .selectFrom(fullTable)
    .selectAll()
    .where("tenant_id" as never, "=", tenantId as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where((eb: any) =>
      eb.or(nkColumns.map((col: string) => eb(col as never, "=", id as never))),
    )
    .executeTakeFirst() as Promise<Record<string, unknown> | undefined>;
}

// ── Filter sigil parser (mirrors client parseFilterSigil, no shared dep) ─────

type ServerFilterOp =
  | { type: "in";       values: unknown[] }
  | { type: "not_in";   values: unknown[] }
  | { type: "gt";       value: unknown }
  | { type: "lt";       value: unknown }
  | { type: "gte";      value: unknown }
  | { type: "lte";      value: unknown }
  | { type: "between";  lo: unknown; hi: unknown }
  | { type: "is_null" }
  | { type: "is_not_null" }
  | { type: "ilike";    value: string }
  | { type: "range";    from: string; to: string };

function coerce(s: string): unknown {
  const normalized = s.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  const n = Number(s);
  return Number.isFinite(n) && s.trim() !== "" ? n : s;
}

function coerceList(raw: string): unknown[] {
  return raw.split(",").filter(Boolean).map((value) => {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return value;
  });
}

function parseServerFilterSigil(raw: string): ServerFilterOp {
  if (raw === "null")    return { type: "is_null" };
  if (raw === "notnull") return { type: "is_not_null" };

  if (raw.startsWith("@")) {
    const range = resolveRelativeRange(raw.slice(1));
    if (range) return { type: "range", from: range.from, to: range.to };
  }
  if (raw.startsWith("~"))  return { type: "ilike", value: raw.slice(1) };
  if (raw.startsWith(">=")) return { type: "gte", value: coerce(raw.slice(2)) };
  if (raw.startsWith("<=")) return { type: "lte", value: coerce(raw.slice(2)) };
  if (raw.startsWith(">"))  return { type: "gt",  value: coerce(raw.slice(1)) };
  if (raw.startsWith("<"))  return { type: "lt",  value: coerce(raw.slice(1)) };

  if (raw.startsWith("between:")) {
    const rest  = raw.slice("between:".length);
    const comma = rest.indexOf(",");
    if (comma > 0) return { type: "between", lo: coerce(rest.slice(0, comma)), hi: coerce(rest.slice(comma + 1)) };
  }
  if (raw.startsWith("not_in:")) {
    return { type: "not_in", values: coerceList(raw.slice("not_in:".length)) };
  }
  if (raw.startsWith("in:")) {
    return { type: "in", values: coerceList(raw.slice("in:".length)) };
  }

  // Default: comma-separated → IN
  return { type: "in", values: coerceList(raw) };
}

function singleStringQueryParam(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string" && value[0].trim()) {
    return value[0].trim();
  }
  return null;
}

function singleStringFilterValue(op: ServerFilterOp | undefined): string | null {
  if (!op) return null;
  if (op.type === "in" && op.values.length === 1 && typeof op.values[0] === "string" && op.values[0].trim()) {
    return op.values[0].trim();
  }
  return null;
}

function singleStringLegacyFilterValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string" && value[0].trim()) {
    return value[0].trim();
  }
  return null;
}

function booleanFilterValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (Array.isArray(value) && value.length === 1) return booleanFilterValue(value[0]);
  return null;
}

function booleanFilterOpValue(op: ServerFilterOp | undefined): boolean | null {
  if (!op) return null;
  if (op.type === "in" && op.values.length === 1) return booleanFilterValue(op.values[0]);
  return null;
}

// ── Relative range resolver ────────────────────────────────────────────────────

function resolveRelativeRange(token: string): { from: string; to: string } | null {
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth();      // 0-based
  const d     = now.getDate();

  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  const startOf = (yr: number, mo: number, day: number) => new Date(yr, mo, day);
  const endOf   = (yr: number, mo: number, day: number) => {
    const dt = new Date(yr, mo, day);
    dt.setHours(23, 59, 59, 999);
    return dt;
  };

  const qStart = Math.floor(m / 3) * 3;  // first month of current quarter (0-based)

  switch (token) {
    case "today":
      return { from: iso(startOf(y, m, d)), to: iso(endOf(y, m, d)) };
    case "yesterday":
      return { from: iso(startOf(y, m, d - 1)), to: iso(endOf(y, m, d - 1)) };
    case "this_week": {
      const dow  = now.getDay();          // 0=Sun
      const diff = now.getDate() - dow + (dow === 0 ? -6 : 1); // Mon
      const mon  = new Date(now); mon.setDate(diff);
      const sun  = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { from: iso(mon), to: iso(sun) };
    }
    case "last_week": {
      const dow  = now.getDay();
      const diff = now.getDate() - dow + (dow === 0 ? -6 : 1);
      const mon  = new Date(now); mon.setDate(diff - 7);
      const sun  = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { from: iso(mon), to: iso(sun) };
    }
    case "this_month":
      return { from: iso(startOf(y, m, 1)), to: iso(endOf(y, m + 1, 0)) };
    case "last_month":
      return { from: iso(startOf(y, m - 1, 1)), to: iso(endOf(y, m, 0)) };
    case "this_quarter":
      return { from: iso(startOf(y, qStart, 1)), to: iso(endOf(y, qStart + 3, 0)) };
    case "last_quarter":
      return { from: iso(startOf(y, qStart - 3, 1)), to: iso(endOf(y, qStart, 0)) };
    case "this_year":
      return { from: iso(startOf(y, 0, 1)), to: iso(endOf(y, 11, 31)) };
    case "last_year":
      return { from: iso(startOf(y - 1, 0, 1)), to: iso(endOf(y - 1, 11, 31)) };
    case "ytd":
      return { from: iso(startOf(y, 0, 1)), to: iso(endOf(y, m, d)) };
    case "qtd":
      return { from: iso(startOf(y, qStart, 1)), to: iso(endOf(y, m, d)) };
    case "mtd":
      return { from: iso(startOf(y, m, 1)), to: iso(endOf(y, m, d)) };
    default:
      return null;
  }
}

function parseCachedCount(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createRecordsRoute(router: Router, deps: RecordsRouteDeps): Router {
  const { db, auth, logger, cache, redis } = deps;

  // ── Phase 11 #2: record-level pub/sub for the edit-during-status-change
  // recovery flow. Channel format mirrors the collab activity SSE so a
  // single Redis instance can host both topics without collision.
  const recordChannel = (tenantId: string, entityCode: string, recordId: string): string =>
    `record:${tenantId}:${entityCode}:${recordId}`;

  /** PUBLISH a record event to all SSE subscribers of this record. Fire-and-forget. */
  const publishRecordEvent = (
    tenantId: string,
    entityCode: string,
    recordId: string,
    eventType: "record.statusChanged" | "record.deleted",
    data: Record<string, unknown>,
    createdAt: string,
  ): void => {
    if (!redis) return;
    const ch = recordChannel(tenantId, entityCode, recordId);
    redis.publish(ch, JSON.stringify({ eventType, createdAt, data })).catch((err: unknown) => {
      logger?.error("records_pubsub_publish_error", { err: String(err), entity: entityCode, recordId });
    });
  };

  function normalizeDefaultProcurementLineUom(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return DEFAULT_PROCUREMENT_LINE_UOM_FALLBACK;
    if (trimmed.toLowerCase() === "each") return DEFAULT_PROCUREMENT_LINE_UOM_FALLBACK;
    return trimmed.toUpperCase();
  }

  async function resolveDefaultProcurementLineUom(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kysely: Kysely<any>,
    tenantId: string | null,
  ): Promise<string> {
    const snapshot = tenantId && cache
      ? await resolveParameterSnapshot(kysely, cache, tenantId, "finance.ap").catch(() => null)
      : null;
    return normalizeDefaultProcurementLineUom(
      getStringParam(snapshot, DEFAULT_PROCUREMENT_LINE_UOM_PARAMETER_CODE, DEFAULT_PROCUREMENT_LINE_UOM_FALLBACK),
    );
  }

  // Best-effort insert into log.activity_log. Never throws — main operation already succeeded.
  const logActivityRecord = async (
    tenantId: string, entityType: string, entityId: string,
    activityType: string, actorId: string, detail: Record<string, unknown>,
  ): Promise<void> => {
    try {
      await db
        .insertInto("log.activity_log" as never)
        .values({
          tenant_id:     tenantId,
          log_type:      "business",
          domain:        "document",
          activity_type: activityType,
          entity_type:   entityType,
          entity_id:     entityId,
          actor_id:      actorId,
          actor_type:    "principal",
          detail:        JSON.stringify(detail),
          created_by:    actorId,
        } as never)
        .execute();
    } catch { /* best-effort */ }
  };

  // ── LIST ──────────────────────────────────────────────────────────────────────
  //
  // Query params (canonical — matches EntityListQueryState URL serialization):
  //   ?page=<n>          current page (1-based, default 1)
  //   ?page_size=<n>     records per page (default 20, max 500; picker_tree can raise this)
  //   ?q=<term>          free-text ILIKE search on is_searchable fields
  //   ?filter.<field>=<sigil>   per-field operator filter (preferred)
  //   ?filters=<json>    legacy JSON map (deprecated, still accepted)
  //   ?sort=<field>:<dir>  field = logical field name; dir = asc | desc
  //   ?facets=cheap|all  return value-count map for enum/boolean fields
  //
  const invalidateListCachesForEntity = async (
    tenantId:   string,
    entityCode: string,
    table?:     EntityTableInfo,
  ): Promise<void> => {
    await invalidateEntityListCache(cache, tenantId, entityCode);
    const listEntityCode = table ? configuredListEntityCode(table) : null;
    if (listEntityCode && listEntityCode !== entityCode) {
      await invalidateEntityListCache(cache, tenantId, listEntityCode);
    }
  };

  const listHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const page          = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10) || 1);
      const rawPageSize   = parseInt(String(req.query["page_size"] ?? "0"), 10) || 0;
      const pickerTreeMode = ["1", "true", "yes"].includes(String(req.query["picker_tree"] ?? "").toLowerCase());

      const searchTerm = typeof req.query["q"] === "string" && req.query["q"].trim()
        ? req.query["q"].trim()
        : null;

      // ── Parse filter params: prefer filter.<field>=<sigil>; fall back to ?filters=<JSON> ──
      const sigilFilters: Record<string, ServerFilterOp> = {};
      for (const [key, val] of Object.entries(req.query)) {
        if (key.startsWith("filter.") && typeof val === "string" && val) {
          const field = key.slice("filter.".length);
          if (field) sigilFilters[field] = parseServerFilterSigil(val);
        }
      }
      // Legacy fallback — parse ?filters=<JSON> if no sigil params were found
      const legacyFilters: Record<string, unknown> = {};
      if (Object.keys(sigilFilters).length === 0 && typeof req.query["filters"] === "string") {
        try {
          Object.assign(legacyFilters, JSON.parse(req.query["filters"]) as Record<string, unknown>);
        } catch { /* ignore malformed */ }
      }

      // Sort — "field:dir[,field:dir:nfirst,...]"  nfirst = NULLS FIRST; default = NULLS LAST
      const sortRaw = typeof req.query["sort"] === "string" ? req.query["sort"].trim() : null;
      type SortEntry = { fieldName: string; dir: "asc" | "desc"; nulls: "first" | "last" };
      const sortEntries: SortEntry[] = [];
      if (sortRaw) {
        for (const token of sortRaw.split(",")) {
          const parts = token.trim().split(":");
          if (parts.length < 2 || !parts[0]) continue;
          sortEntries.push({
            fieldName: parts[0],
            dir:       parts[1] === "desc" ? "desc" : "asc",
            nulls:     parts[2] === "nfirst" ? "first" : "last",
          });
        }
      }
      // Legacy compat — expose primary sort for computed-field check below
      const sortFieldName = sortEntries[0]?.fieldName ?? null;

      const facetsParam = typeof req.query["facets"] === "string" ? req.query["facets"] : null;
      const includeFacets = facetsParam === "cheap" || facetsParam === "all";

      const groupParam = typeof req.query["group"] === "string" && req.query["group"].trim()
        ? req.query["group"].trim()
        : null;

      // ── Index table redirect ─────────────────────────────────────────────────
      // If identity_config.list_entity_code is set, list queries run against the
      // denormalized index table (e.g. supplier_app_index) instead of the thin
      // role table.  Identity + role fields are co-located in the index for fast
      // list/search.  The canonical table is still used for detail GET and writes.
      const listEntityCode = configuredListEntityCode(table) ?? undefined;
      const listTable      = listEntityCode ? (await resolveEntityTable(db, listEntityCode) ?? table) : table;
      let   fullTable      = `${listTable.table_schema}.${listTable.table_name}` as `${string}.${string}`;
      const listCode       = listTable !== table ? listEntityCode! : entityCode;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      const [paginationSnap, searchSnap, listSnap] = tenantId && cache
        ? await Promise.all([
            resolveParameterSnapshot(db, cache, tenantId, "api.pagination").catch(() => null),
            resolveParameterSnapshot(db, cache, tenantId, "api.search").catch(() => null),
            resolveParameterSnapshot(db, cache, tenantId, "api.list").catch(() => null),
          ])
        : [null, null, null] as const;
      const defaultPageSize = getIntParam(paginationSnap, "api.pagination.default_page_size", DEFAULT_PAGE_SIZE);
      const defaultSearchMinQueryLength = getIntParam(searchSnap, "api.search.min_query_length", 2);
      const listPageCacheTtlSeconds = getIntParam(listSnap, "api.list.redis_page_cache_ttl_seconds", 45);
      const listCountCacheTtlSeconds = getIntParam(listSnap, "api.list.redis_count_cache_ttl_seconds", 120);
      const maxPageSize = Math.min(
        MAX_PAGE_SIZE,
        getIntParam(paginationSnap, "api.pagination.max_page_size", MAX_PAGE_SIZE),
      );
      const pickerTreeMinPageSize = getIntParam(
        paginationSnap,
        "api.pagination.picker_tree_min_page_size",
        500,
      );
      const effectiveMaxPageSize = pickerTreeMode
        ? Math.max(maxPageSize, Math.min(MAX_PAGE_SIZE, Math.max(500, pickerTreeMinPageSize)))
        : maxPageSize;
      const requestedPageSize = pickerTreeMode
        ? Math.max(rawPageSize || defaultPageSize, 500)
        : rawPageSize || defaultPageSize;
      const pageSize = Math.min(effectiveMaxPageSize, Math.max(1, requestedPageSize));
      const offset   = (page - 1) * pageSize;

      let fieldMap = await resolveFieldMap(db, listCode);

      // ── F5: resolve field metadata + display_config for sort fallback ────────
      // Uses listCode so that fieldMeta columns + sort defaults match the index table.
      let [fieldMeta, entityVersionRow, physicalColumns] = await Promise.all([
        db
          .selectFrom("control.entity_field as ef")
          .innerJoin("control.entity_version as ev", "ev.id", "ef.entity_version_id")
          .innerJoin("control.entity as e",          "e.id",  "ev.entity_id")
          .select(["ef.name", "ef.column_name", "ef.is_computed", "ef.is_searchable", "ef.data_type"])
          .where("e.name",       "=",  listCode)
          .where("e.tenant_id",  "is", null)
          .where("ev.status",    "=",  "EFFECTIVE")
          .where("ef.is_active", "=",  true)
          .execute() as Promise<{ name: string; column_name: string; is_computed: boolean; is_searchable: boolean; data_type: string }[]>,
        db
          .selectFrom("control.entity_version as ev")
          .innerJoin("control.entity as e", "e.id", "ev.entity_id")
          .select(["e.id as entity_id", "e.display_config", "e.search_config", "ev.version_no", "ev.version_hash"])
          .where("e.name",      "=", listCode)
          .where("e.tenant_id", "is", null)
          .where("ev.status",   "=", "EFFECTIVE")
          .executeTakeFirst() as Promise<{
            entity_id: string;
            display_config: Record<string, unknown> | null;
            search_config: Record<string, unknown> | null;
            version_no: number | null;
            version_hash: string | null;
          } | undefined>,
        db
          .selectFrom("information_schema.columns as c")
          .select(["c.column_name"])
          .where("c.table_schema", "=", listTable.table_schema)
          .where("c.table_name", "=", listTable.table_name)
          .execute() as Promise<{ column_name: string }[]>,
      ]);

      const computedFieldNames = new Set(fieldMeta.filter((f) => f.is_computed).map((f) => f.name));
      const metadataColumnNames = new Set(fieldMeta.map((f) => f.column_name));
      const physicalColumnNames = new Set(physicalColumns.map((f) => f.column_name));
      const queryableColumnNames = physicalColumnNames.size > 0 ? physicalColumnNames : metadataColumnNames;
      const hasTenantColumn = queryableColumnNames.has("tenant_id");

      // Reject attempts to filter/sort on computed fields
      const computedFilterKeys = Object.keys(sigilFilters).filter((f) => computedFieldNames.has(f));
      const computedSortKeys   = sortEntries.filter((e) => computedFieldNames.has(e.fieldName)).map((e) => e.fieldName);
      if (computedFilterKeys.length > 0 || computedSortKeys.length > 0) {
        res.status(422).json({
          error:   "COMPUTED_FIELD_NOT_QUERYABLE",
          message: "Computed fields cannot be used in filters or sort",
          fields:  [...computedFilterKeys, ...computedSortKeys],
        });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let listQuery: any  = db.selectFrom(fullTable).selectAll();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let countQuery: any = db.selectFrom(fullTable).select(db.fn.countAll<string>().as("count"));

      // Group counts query — parallel COUNT(*) GROUP BY when ?group= is provided.
      // Validated: field must exist in fieldMap and must not be computed.
      const groupCol = groupParam && !computedFieldNames.has(groupParam)
        ? (fieldMap.get(groupParam) ?? (metadataColumnNames.has(groupParam) ? groupParam : null))
        : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let groupCountQuery: any = groupCol && queryableColumnNames.has(groupCol)
        ? db.selectFrom(fullTable).select([
            sql.raw(`COALESCE("${groupCol}"::text, '__null__') AS group_value`) as never,
            db.fn.countAll<string>().as("count"),
          ]).groupBy(sql.raw(`COALESCE("${groupCol}"::text, '__null__')`) as never)
        : null;

      if (tenantId && hasTenantColumn) {
        listQuery  = listQuery.where("tenant_id"  as never, "=", tenantId as never);
        countQuery = countQuery.where("tenant_id" as never, "=", tenantId as never);
        if (groupCountQuery) groupCountQuery = groupCountQuery.where("tenant_id" as never, "=", tenantId as never);
      }

      // ── Org-context scope: Legal Entity / Company Code ────────────────────────
      // The relay injects X-Org-Context-Type / X-Organization-ID / X-Legal-Entity-ID
      // from the user's active session. We enforce the org boundary here so the
      // generic relay list path applies the same scope as the RSC/BFF helper path.
      //
      // User-supplied company_code_id filters are AND-ed with the scope, never broadened.
      // Enforcement runs before field filters so scope cannot be bypassed by URL params.
      {
        const orgContextType = ((req.headers["x-org-context-type"] as string) ?? "").toLowerCase().trim();
        const orgId          = ((req.headers["x-organization-id"]  as string) ?? "").trim();
        const legalEntityId  = ((req.headers["x-legal-entity-id"]  as string) ?? "").trim();

        // Helper: apply a scope predicate to list + count + group-count in one call
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const applyWhere = (col: string, op: "=" | "in", value: string | string[]) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const add = (q: any) => q.where(col as never, op as never, value as never);
          listQuery  = add(listQuery);
          countQuery = add(countQuery);
          if (groupCountQuery) groupCountQuery = add(groupCountQuery);
        };
        const applyEmpty = () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const add = (q: any) => q.where(sql<boolean>`false` as never);
          listQuery  = add(listQuery);
          countQuery = add(countQuery);
          if (groupCountQuery) groupCountQuery = add(groupCountQuery);
        };

        const entityFieldNames = new Set(fieldMeta.map((f) => f.name));

        if (tenantId && orgContextType === "company_code" && orgId) {
          // Active org context is a specific company code.
          if (listCode === "legal_entity") {
            // Reverse lookup: show only the LE that owns this company code.
            const leRows = await sql<{ legal_entity_id: string }>`
              SELECT legal_entity_id FROM master.company_code
              WHERE tenant_id = ${tenantId}::uuid AND id = ${orgId}::uuid
            `.execute(db);
            const leIds = leRows.rows.map((r) => r.legal_entity_id).filter(Boolean);
            leIds.length > 0 ? applyWhere("id", "in", leIds) : applyEmpty();
          } else if (listCode === "company_code") {
            applyWhere("id", "in", [orgId]);
          } else if (entityFieldNames.has("legal_entity_id")) {
            // Resolve LE for this company code, then scope by legal_entity_id.
            const leRows = await sql<{ legal_entity_id: string }>`
              SELECT legal_entity_id FROM master.company_code
              WHERE tenant_id = ${tenantId}::uuid AND id = ${orgId}::uuid
            `.execute(db);
            const leIds = leRows.rows.map((r) => r.legal_entity_id).filter(Boolean);
            const leCol = fieldMap.get("legal_entity_id") ?? "legal_entity_id";
            if (leIds.length > 0 && queryableColumnNames.has(leCol)) {
              applyWhere(leCol, "in", leIds);
            }
          } else if (entityFieldNames.has("company_code_id")) {
            const ccCol = fieldMap.get("company_code_id") ?? "company_code_id";
            if (queryableColumnNames.has(ccCol)) applyWhere(ccCol, "in", [orgId]);
          } else if (entityFieldNames.has("site_id")) {
            // Multi-hop: company_code → sites → site_id
            const siteRows = await sql<{ id: string }>`
              SELECT id FROM master.site
              WHERE tenant_id = ${tenantId}::uuid AND company_code_id = ${orgId}::uuid
            `.execute(db);
            const siteIds = siteRows.rows.map((r) => r.id).filter(Boolean);
            const siteCol = fieldMap.get("site_id") ?? "site_id";
            if (siteIds.length === 0) {
              applyEmpty();
            } else if (queryableColumnNames.has(siteCol)) {
              applyWhere(siteCol, "in", siteIds);
            }
          }
        }

        if (tenantId && orgContextType === "legal_entity" && legalEntityId) {
          // Active org context is a legal entity — scope to its subtree.
          if (listCode === "legal_entity") {
            applyWhere("id", "=", legalEntityId);
          } else if (listCode === "company_code" || entityFieldNames.has("legal_entity_id")) {
            const leCol = fieldMap.get("legal_entity_id") ?? "legal_entity_id";
            if (queryableColumnNames.has(leCol)) {
              applyWhere(leCol, "=", legalEntityId);
            }
          } else if (entityFieldNames.has("company_code_id")) {
            // Resolve company codes for this legal entity, then scope by company_code_id.
            const ccRows = await sql<{ id: string }>`
              SELECT id FROM master.company_code
              WHERE tenant_id = ${tenantId}::uuid AND legal_entity_id = ${legalEntityId}::uuid
            `.execute(db);
            const ccIds = ccRows.rows.map((r) => r.id).filter(Boolean);
            if (ccIds.length === 0) {
              applyEmpty();
            } else {
              const ccCol = fieldMap.get("company_code_id") ?? "company_code_id";
              if (queryableColumnNames.has(ccCol)) applyWhere(ccCol, "in", ccIds);
            }
          } else if (entityFieldNames.has("site_id")) {
            // Two-hop: legal_entity → company_codes → sites → site_id
            const siteRows = await sql<{ id: string }>`
              SELECT id FROM master.site
              WHERE tenant_id = ${tenantId}::uuid
                AND company_code_id IN (
                  SELECT id FROM master.company_code
                  WHERE tenant_id = ${tenantId}::uuid AND legal_entity_id = ${legalEntityId}::uuid
                )
            `.execute(db);
            const siteIds = siteRows.rows.map((r) => r.id).filter(Boolean);
            const siteCol = fieldMap.get("site_id") ?? "site_id";
            if (siteIds.length === 0) {
              applyEmpty();
            } else if (queryableColumnNames.has(siteCol)) {
              applyWhere(siteCol, "in", siteIds);
            }
          }
        }
      }

      // ── Parent FK filter for child entities ───────────────────────────────────
      // ?parent_id=<uuid> narrows results to records belonging to that parent.
      // Uses identity_config.parent.field to resolve the physical FK column.
      // identity_config.parent.scope ("col=val") adds any extra discriminator.
      // Virtual quick filters are configured in entity.display_config.filter_bar.
      // Handle generic __ keys here, then remove them before normal field filters.
      const virtualFilterKeys = Object.keys(sigilFilters).filter((field) => field.startsWith("__"));
      if (virtualFilterKeys.length > 0) {
        const sub = typeof claims.sub === "string" ? claims.sub : "";
        const principalId = sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;

        if (sigilFilters["__bookmarked"]) {
          if (tenantId && principalId) {
            const recordIdRef = sql.ref(`${listTable.table_name}.id`);
            const bookmarkedPredicate = sql<boolean>`exists (
              select 1
              from master.record_bookmark rb
              where rb.tenant_id = ${tenantId}::uuid
                and rb.principal_id = ${principalId}::uuid
                and rb.entity_code = ${entityCode}
                and rb.record_id = ${recordIdRef}
            )`;
            listQuery = listQuery.where(bookmarkedPredicate as never);
            countQuery = countQuery.where(bookmarkedPredicate as never);
            if (groupCountQuery) groupCountQuery = groupCountQuery.where(bookmarkedPredicate as never);
          } else {
            listQuery = listQuery.where(sql<boolean>`false` as never);
            countQuery = countQuery.where(sql<boolean>`false` as never);
            if (groupCountQuery) groupCountQuery = groupCountQuery.where(sql<boolean>`false` as never);
          }
          delete sigilFilters["__bookmarked"];
        }

        if (sigilFilters["__created_by"]) {
          const createdByCol = fieldMap.get("created_by") ?? "created_by";
          if (createdByCol && principalId) {
            listQuery = listQuery.where(createdByCol as never, "=" as never, principalId as never);
            countQuery = countQuery.where(createdByCol as never, "=" as never, principalId as never);
            if (groupCountQuery) groupCountQuery = groupCountQuery.where(createdByCol as never, "=" as never, principalId as never);
          } else {
            listQuery = listQuery.where(sql<boolean>`false` as never);
            countQuery = countQuery.where(sql<boolean>`false` as never);
            if (groupCountQuery) groupCountQuery = groupCountQuery.where(sql<boolean>`false` as never);
          }
          delete sigilFilters["__created_by"];
        }
      }

      const parentIdParam     = typeof req.query["parent_id"]     === "string" ? req.query["parent_id"]     : null;
      const parentFkCol       = configuredParentFk(table);
      const throughEntityCode = typeof req.query["through_entity"] === "string" ? req.query["through_entity"] : null;
      const parentScope       = parseFeatureScope(configuredParentScope(table));

      if (parentIdParam && parentFkCol) {
        if (throughEntityCode) {
          // ── Two-hop: child.parentFkCol IN (SELECT id FROM throughTable WHERE throughParentFk = parentId) ──
          // All metadata (through table schema/name, through parent FK) is resolved from
          // control.entity at runtime — nothing entity-specific is hardcoded here.
          const throughMeta = await db
            .selectFrom("control.entity as e")
            .select(["e.table_schema", "e.table_name", "e.identity_config", "e.feature_flags"])
            .where("e.entity_code", "=", throughEntityCode)
            .where("e.tenant_id",   "is", null)
            .executeTakeFirst() as { table_schema: string; table_name: string; identity_config: unknown; feature_flags: unknown } | undefined;

          if (throughMeta) {
            const throughParentFk = parentFkFromConfigs(
              asPlainObject(throughMeta.identity_config),
              asPlainObject(throughMeta.feature_flags),
            );
            if (throughParentFk) {
              const throughTable = `${throughMeta.table_schema}.${throughMeta.table_name}`;
              const inPredicate = tenantId
                ? sql<boolean>`${sql.ref(parentFkCol)} IN (SELECT id FROM ${sql.raw(throughTable)} WHERE ${sql.raw(throughParentFk)} = ${parentIdParam}::uuid AND tenant_id = ${tenantId}::uuid)`
                : sql<boolean>`${sql.ref(parentFkCol)} IN (SELECT id FROM ${sql.raw(throughTable)} WHERE ${sql.raw(throughParentFk)} = ${parentIdParam}::uuid)`;
              listQuery  = listQuery.where(inPredicate  as never);
              countQuery = countQuery.where(inPredicate as never);
              if (groupCountQuery) groupCountQuery = groupCountQuery.where(inPredicate as never);
            }
          }

          // Apply the entity's own parent_scope (e.g. owner_type=supplier) — driven by
          // the entity registry, never overridden when using through_entity.
          if (parentScope && queryableColumnNames.has(parentScope.column)) {
            listQuery  = listQuery.where(parentScope.column  as never, "=", parentScope.value as never);
            countQuery = countQuery.where(parentScope.column as never, "=", parentScope.value as never);
            if (groupCountQuery) groupCountQuery = groupCountQuery.where(parentScope.column as never, "=", parentScope.value as never);
          }
        } else {
          // ── Direct parent filter — existing logic unchanged ────────────────────
          listQuery  = listQuery.where(parentFkCol  as never, "=", parentIdParam as never);
          countQuery = countQuery.where(parentFkCol as never, "=", parentIdParam as never);
          if (groupCountQuery) groupCountQuery = groupCountQuery.where(parentFkCol as never, "=", parentIdParam as never);
          if (parentScope && queryableColumnNames.has(parentScope.column)) {
            // Allow caller to override the entity's default parent_scope value via
            // ?{col}_filter=X (e.g. ?owner_type_filter=business_partner). This lets
            // polymorphic tables be queried from detail tabs without a separate
            // entity registration for each owner kind.
            const overrideKey = `${parentScope.column}_filter`;
            const scopeVal = (typeof req.query[overrideKey] === "string" ? req.query[overrideKey] : null)
              ?? parentScope.value;
            listQuery  = listQuery.where(parentScope.column  as never, "=", scopeVal as never);
            countQuery = countQuery.where(parentScope.column as never, "=", scopeVal as never);
            if (groupCountQuery) groupCountQuery = groupCountQuery.where(parentScope.column as never, "=", scopeVal as never);
          }
        }
      }

      // Apply registry discriminator scope even for top-level list requests.
      // Polymorphic backing tables share rows across owner/party types; without
      // this guard, a business_partner_* entity can list supplier/customer/LE
      // rows when no parent_id is provided.
      if (!parentIdParam && parentScope && queryableColumnNames.has(parentScope.column)) {
        listQuery  = listQuery.where(parentScope.column  as never, "=", parentScope.value as never);
        countQuery = countQuery.where(parentScope.column as never, "=", parentScope.value as never);
        if (groupCountQuery) groupCountQuery = groupCountQuery.where(parentScope.column as never, "=", parentScope.value as never);
      }

      // Owner-type scope for exposed polymorphic relation tables.
      const requiresOwnerTypeScope = listTable.feature_flags["requires_owner_type_scope"] === true
        || (
          listTable.table_schema === "master"
          && (listTable.table_name === "bank_account_link" || listTable.table_name === "commodity_classification")
        );
      if (requiresOwnerTypeScope) {
        const ownerTypeColumn = typeof listTable.feature_flags["owner_type_column"] === "string"
          ? listTable.feature_flags["owner_type_column"]
          : "owner_type";

        if (!queryableColumnNames.has(ownerTypeColumn)) {
          res.status(500).json({
            error: "ENTITY_SCOPE_MISCONFIGURED",
            message: `Entity '${listCode}' requires owner_type scoping but '${ownerTypeColumn}' is not queryable`,
          });
          return;
        }

        const queryOwnerType = singleStringQueryParam(req.query[`${ownerTypeColumn}_filter`])
          ?? singleStringQueryParam(req.query[ownerTypeColumn]);
        const sigilOwnerType = singleStringFilterValue(sigilFilters[ownerTypeColumn]);
        const legacyOwnerType = singleStringLegacyFilterValue(legacyFilters[ownerTypeColumn]);
        const hasInvalidOwnerTypeFilter =
          (!!sigilFilters[ownerTypeColumn] && !sigilOwnerType)
          || (Object.prototype.hasOwnProperty.call(legacyFilters, ownerTypeColumn) && !legacyOwnerType);

        if (hasInvalidOwnerTypeFilter) {
          res.status(400).json({
            error: "OWNER_TYPE_SCOPE_REQUIRED",
            message: `${listCode} requires exactly one ${ownerTypeColumn} filter`,
          });
          return;
        }

        const ownerTypeValues = [queryOwnerType, sigilOwnerType, legacyOwnerType]
          .filter((value): value is string => typeof value === "string" && value.length > 0);
        const uniqueOwnerTypes = new Set(ownerTypeValues);
        if (uniqueOwnerTypes.size > 1) {
          res.status(400).json({
            error: "OWNER_TYPE_SCOPE_CONFLICT",
            message: `${listCode} received conflicting ${ownerTypeColumn} filters`,
          });
          return;
        }

        const defaultOwnerType = singleStringQueryParam(listTable.feature_flags["default_owner_type_scope"])
          ?? singleStringQueryParam(listTable.feature_flags["default_owner_type"]);
        const ownerType = ownerTypeValues[0] ?? defaultOwnerType ?? null;
        if (!ownerType) {
          res.status(400).json({
            error: "OWNER_TYPE_SCOPE_REQUIRED",
            message: `${listCode} requires ${ownerTypeColumn}_filter or filter.${ownerTypeColumn}`,
          });
          return;
        }

        listQuery  = listQuery.where(ownerTypeColumn  as never, "=", ownerType as never);
        countQuery = countQuery.where(ownerTypeColumn as never, "=", ownerType as never);
        if (groupCountQuery) groupCountQuery = groupCountQuery.where(ownerTypeColumn as never, "=", ownerType as never);
        delete sigilFilters[ownerTypeColumn];
        delete legacyFilters[ownerTypeColumn];
      }

      // Apply company-code ACL filtering after all explicit entity filters.
      if (entityCode === "company_code" && tenantId) {
        const sub = typeof claims.sub === "string" ? claims.sub : "";
        const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
        if (principalId) {
          const scope = await createCompanyCodeScopeService(db).resolveScope(principalId, tenantId);
          if (!scope.isUnrestricted) {
            if (scope.companyCodeIds.length === 0) {
              listQuery  = listQuery.where(sql<boolean>`false` as never);
              countQuery = countQuery.where(sql<boolean>`false` as never);
              if (groupCountQuery) groupCountQuery = groupCountQuery.where(sql<boolean>`false` as never);
            } else {
              listQuery  = listQuery.where("id"  as never, "in", scope.companyCodeIds as never);
              countQuery = countQuery.where("id" as never, "in", scope.companyCodeIds as never);
              if (groupCountQuery) groupCountQuery = groupCountQuery.where("id" as never, "in", scope.companyCodeIds as never);
            }
          }
        }
      }

      // Virtual GL-account picker filter. Reporting taxonomy leaves are rollup
      // targets, not journal-postable accounts, even when node_type='posting'.
      if (listCode === "gl_account") {
        const postingAllowedFilter =
          booleanFilterValue(legacyFilters["posting_allowed"])
          ?? booleanFilterOpValue(sigilFilters["posting_allowed"]);

        if (postingAllowedFilter !== null) {
          const predicate = postingAllowedFilter
            ? sql<boolean>`node_type = 'posting' AND COALESCE((metadata->>'_journal_postable')::boolean, true) = true`
            : sql<boolean>`(node_type <> 'posting' OR COALESCE((metadata->>'_journal_postable')::boolean, true) = false)`;

          listQuery = listQuery.where(predicate as never);
          countQuery = countQuery.where(predicate as never);
          if (groupCountQuery) groupCountQuery = groupCountQuery.where(predicate as never);

          delete legacyFilters["posting_allowed"];
          delete sigilFilters["posting_allowed"];
        }
      }

      // ── Sigil-based filters ───────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const applyOp = (q: any, col: never, op: ServerFilterOp): any => {
        switch (op.type) {
          case "in":
            return op.values.length === 0
              ? q.where(sql<boolean>`false` as never)
              : q.where(col, "in", op.values as never);
          case "not_in":   return q.where(col, "not in", op.values as never);
          case "gt":       return q.where(col, ">",       op.value as never);
          case "lt":       return q.where(col, "<",       op.value as never);
          case "gte":      return q.where(col, ">=",      op.value as never);
          case "lte":      return q.where(col, "<=",      op.value as never);
          case "between":  return q.where(col, ">=", op.lo as never).where(col, "<=", op.hi as never);
          case "is_null":  return q.where(col, "is",     null as never);
          case "is_not_null": return q.where(col, "is not", null as never);
          case "ilike":    return q.where(col, "ilike",  `%${op.value}%` as never);
          case "range":    return q.where(col, ">=", op.from as never).where(col, "<", op.to as never);
          default:         return q;
        }
      };

      for (const [fieldName, op] of Object.entries(sigilFilters)) {
        if (fieldName.startsWith("_")) continue;
        const colName = fieldMap.get(fieldName) ?? fieldName;
        if (!queryableColumnNames.has(colName)) continue;
        const col = colName as never;
        listQuery  = applyOp(listQuery,  col, op);
        countQuery = applyOp(countQuery, col, op);
        if (groupCountQuery) groupCountQuery = applyOp(groupCountQuery, col, op);
      }

      // ── Legacy JSON filters (backward compat) ─────────────────────────────────
      for (const [fieldName, value] of Object.entries(legacyFilters)) {
        if (value === undefined || value === null || fieldName.startsWith("_")) continue;
        const colName = fieldMap.get(fieldName) ?? fieldName;
        if (!queryableColumnNames.has(colName)) continue;
        const col = colName as never;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const applyLegacy = (q: any) => {
          if (Array.isArray(value) && value.length > 0) return q.where(col, "in", value as never);
          if (Array.isArray(value) && value.length === 0) return q.where(sql<boolean>`false` as never);
          return q.where(col, "=", value as never);
        };
        listQuery  = applyLegacy(listQuery);
        countQuery = applyLegacy(countQuery);
        if (groupCountQuery) groupCountQuery = applyLegacy(groupCountQuery);
      }

      // ── F1: fail-closed search ────────────────────────────────────────────────
      // When a search term is provided but the entity has no searchable fields,
      // return empty results with a reasons flag rather than silently returning all rows.
      const reasons: Record<string, boolean> = {};
      if (searchTerm) {
        const searchConfig = normalizeEntitySearchConfig(entityVersionRow?.search_config, defaultSearchMinQueryLength);

        if (!searchConfig.enabled) {
          reasons["search_disabled"] = true;
          res.json({
            data: [],
            pagination: { total: 0, page, page_size: pageSize, total_pages: 0 },
            reasons,
          });
          return;
        }

        if (searchTerm.length < searchConfig.minQueryLength) {
          reasons["search_min_query_length"] = true;
        } else {
        const configuredSearchFields = new Set(searchConfig.fields);
        const usesConfiguredFields = searchConfig.hasConfiguredFields || searchConfig.fields.length > 0;
        const searchableFields = fieldMeta
          .filter((f) =>
            (usesConfiguredFields ? configuredSearchFields.has(f.name) : f.is_searchable) &&
            isTextSearchDataType(f.data_type) &&
            queryableColumnNames.has(f.column_name))
          .map((f, index) => ({
            columnName: f.column_name,
            rank: searchRankForField(searchConfig, f.name, index),
          }));
        const searchableCols = [...new Set(searchableFields.map((f) => f.columnName))];
        if (searchableCols.length > 0) {
          const pattern = searchPattern(searchTerm, searchConfig.operator) as never;
          const rankingFields = [...new Map(
            searchableFields.map((f) => [
              f.columnName,
              { columnName: f.columnName, rank: f.rank },
            ]),
          ).values()];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const applySearch = (q: any) => q.where((eb: any) =>
            eb.or(searchableCols.map((col: string) => eb(col as never, "ilike", pattern))),
          );
          listQuery  = applySearch(listQuery);
          countQuery = applySearch(countQuery);
          if (groupCountQuery) groupCountQuery = applySearch(groupCountQuery);
          listQuery = listQuery.orderBy(buildSearchScoreExpression(rankingFields, searchTerm), "desc");
        } else {
          logger?.warn("records_search_no_searchable_fields", { entityCode, searchTerm });
          reasons["search_unsupported"] = true;
          // Return empty — don't silently return all rows when search is requested
          res.json({
            data: [],
            pagination: { total: 0, page, page_size: pageSize, total_pages: 0 },
            reasons,
          });
          return;
        }
        }
      }

      // ── Sort + F2 id tie-breaker ───────────────────────────────────────────────
      const columnNames = queryableColumnNames;
      const fieldNames  = new Set(fieldMeta.map((f) => f.name));

      // Filter requested sort entries to columns that actually exist on the table.
      // Stale URL params (e.g. sort=name:asc on a thin BP-role table) are silently
      // dropped so the fallback sort logic below kicks in instead of a SQL error.
      const validSortEntries = sortEntries.filter(({ fieldName }) => {
        const col = fieldMap.get(fieldName) ?? fieldName;
        return columnNames.has(col);
      });

      if (validSortEntries.length > 0) {
        for (const { fieldName, dir, nulls } of validSortEntries) {
          const col = fieldMap.get(fieldName) ?? fieldName;
          const nullsClause = nulls === "first" ? "NULLS FIRST" : "NULLS LAST";
          listQuery = listQuery.orderBy(sql.raw(`"${col}" ${dir.toUpperCase()} ${nullsClause}`) as never);
        }
      } else {
        // A3: metadata-driven fallback — display_config.default_sort_field → created_at → natural key → id
        const displayConfig = entityVersionRow?.display_config as Record<string, unknown> | null | undefined;
        const metaSortField = typeof displayConfig?.default_sort_field === "string"
          ? displayConfig.default_sort_field
          : null;
        const metaSortDir   = displayConfig?.default_sort_order === "asc" ? "asc" : "desc";

        // Resolve: metadata field → created_at → natural key (code/name) → skip (id covers it)
        const resolveDefaultSortCol = (): { col: string; dir: string } | null => {
          if (metaSortField) {
            const col = fieldMap.get(metaSortField) ?? (columnNames.has(metaSortField) ? metaSortField : null);
            if (col && columnNames.has(col)) return { col, dir: metaSortDir };
          }
          if (columnNames.has("created_at") || (fieldNames.has("created_at") && columnNames.has(fieldMap.get("created_at") ?? "created_at"))) {
            return { col: fieldMap.get("created_at") ?? "created_at", dir: "desc" };
          }
          for (const natural of ["code", "name", "number"]) {
            if (fieldNames.has(natural)) {
              const col = fieldMap.get(natural) ?? natural;
              if (columnNames.has(col)) return { col, dir: "asc" };
            }
          }
          return null;
        };

        const defaultSort = resolveDefaultSortCol();
        if (defaultSort) {
          listQuery = listQuery.orderBy(sql.raw(`"${defaultSort.col}" ${defaultSort.dir.toUpperCase()} NULLS LAST`) as never);
        }
      }
      // Always append id ASC as tie-breaker to guarantee stable pagination
      listQuery = listQuery.orderBy("id" as never, "asc" as never);

      const descriptorHash = stableEntityListCacheHash({
        versionHash: entityVersionRow?.version_hash,
        versionNo:   entityVersionRow?.version_no,
        entityId:    entityVersionRow?.entity_id,
        displayConfig: entityVersionRow?.display_config,
        searchConfig:  entityVersionRow?.search_config,
        fields: fieldMeta.map((field) => ({
          name: field.name,
          column: field.column_name,
          searchable: field.is_searchable,
          type: field.data_type,
        })),
      });
      const scopeHash = stableEntityListCacheHash({
        xOrg,
        xRealm,
        orgContextType: req.headers["x-org-context-type"] ?? "",
        organizationId: req.headers["x-organization-id"] ?? "",
        legalEntityId:  req.headers["x-legal-entity-id"] ?? "",
      });
      const roles = Array.isArray(claims["roles"]) ? (claims["roles"] as string[]).filter((role) => typeof role === "string").sort() : [];
      const securityHash = stableEntityListCacheHash({
        subject: typeof claims.sub === "string" ? claims.sub : "",
        roles,
        scopeHash,
      });
      const filterHash = stableEntityListCacheHash({
        sigilFilters,
        legacyFilters,
        parentId: parentIdParam,
        throughEntity: throughEntityCode,
        pickerTreeMode,
        facets: facetsParam,
        group: groupParam,
      });
      const sortHash = stableEntityListCacheHash(validSortEntries);
      const searchHash = searchTerm
        ? stableEntityListCacheHash({ q: searchTerm, scope: req.query["search_scope"] ?? "implicit" })
        : "none";
      const listCacheVersion = tenantId && cache
        ? await resolveEntityListVersion(cache, tenantId, listCode)
        : "0";
      const listCacheKeyInput = tenantId && cache ? {
        tenantId,
        entityCode: listCode,
        scopeHash,
        securityHash,
        descriptorHash,
        filterHash,
        sortHash,
        searchHash,
        page,
        pageSize,
        version: listCacheVersion,
      } : null;
      const pageCacheKey = listCacheKeyInput && listPageCacheTtlSeconds > 0
        ? buildEntityListPageCacheKey(listCacheKeyInput)
        : null;
      const countCacheKey = listCacheKeyInput && listCountCacheTtlSeconds > 0
        ? buildEntityListCountCacheKey(listCacheKeyInput)
        : null;

      if (cache && pageCacheKey) {
        const cachedPage = await cache.get(pageCacheKey).catch(() => null);
        if (cachedPage) {
          try {
            res.setHeader("X-List-Cache", "hit");
            res.json(JSON.parse(cachedPage) as Record<string, unknown>);
            return;
          } catch {
            await cache.del(pageCacheKey).catch(() => undefined);
          }
        }
      }

      const cachedTotal = cache && countCacheKey
        ? parseCachedCount(await cache.get(countCacheKey).catch(() => null))
        : null;

      // ── Execute list + count + group counts (parallel) ────────────────────────
      const [rows, countResult, groupCountRows] = await Promise.all([
        listQuery.limit(pageSize).offset(offset).execute(),
        cachedTotal === null ? countQuery.executeTakeFirst() : Promise.resolve({ count: String(cachedTotal) }),
        groupCountQuery ? (groupCountQuery as { execute(): Promise<{ group_value: string; count: string }[]> }).execute() : Promise.resolve(null),
      ]);

      const total = parseInt(String(countResult?.count ?? "0"), 10);

      const remappedRows = (rows as Record<string, unknown>[]).map((row) => {
        return remapRecordRow(row, fieldMap);
      });
      let responseRows = remappedRows;
      if (isCertificationBackingTable(listTable)) {
        responseRows = await enrichCertificationTypeDisplayFields(db, responseRows);
      }
      if (isCommodityClassificationBackingTable(listTable)) {
        responseRows = await enrichCommodityClassificationDisplayFields(db, responseRows);
      }

      // ── Facets with budget (F7: scoped to the same filtered context) ─────────
      // Budget: 20-field cap, 200-value cardinality cap per field, 2s hard timeout.
      // facet_status communicates whether the response is complete or budget-trimmed.
      const FACET_FIELD_CAP   = 20;
      const FACET_VALUE_CAP   = 200;
      const FACET_TIMEOUT_MS  = 2000;

      let facets: Record<string, { value: string; count: number }[]> | undefined;
      let facetStatus: "complete" | "truncated" | "timeout" | undefined;

      if (includeFacets && tenantId) {
        // cheap scope: enum + boolean only (bounded cardinality, fast GROUP BY)
        // all scope: also include string/text fields (useful for category, label, type fields
        //            typed as string rather than enum — bounded by FACET_VALUE_CAP)
        const isFacetEligible = (dt: string) =>
          dt === "enum" || dt === "boolean" ||
          (facetsParam === "all" && (dt === "string" || dt === "text"));

        const eligibleFieldMeta = fieldMeta
          .filter((f) => isFacetEligible(f.data_type) && !f.is_computed && columnNames.has(f.column_name))
          .slice(0, FACET_FIELD_CAP);

        const wasFieldCapped = fieldMeta.filter(
          (f) => isFacetEligible(f.data_type) && !f.is_computed && columnNames.has(f.column_name),
        ).length > FACET_FIELD_CAP;

        const facetWork = Promise.all(
          eligibleFieldMeta.map(async ({ name, column_name }) => {
            // Build from the filtered countQuery so counts reflect applied filters (F7).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const facetQ: any = countQuery
              .clearSelect()
              .select([
                column_name as never,
                db.fn.countAll<string>().as("count") as never,
              ])
              .groupBy(column_name as never)
              .orderBy(db.fn.countAll<string>() as never, "desc" as never)
              .limit(FACET_VALUE_CAP + 1); // +1 to detect truncation

            const raw = await facetQ.execute() as Record<string, string>[];
            const hasMore = raw.length > FACET_VALUE_CAP;
            return {
              name,
              values: raw.slice(0, FACET_VALUE_CAP).map((row) => ({
                value: String(row[column_name] ?? ""),
                count: parseInt(row["count"] ?? "0", 10),
              })),
              hasMore,
            };
          }),
        );

        const timeoutSentinel = new Promise<"timeout">((resolve) =>
          setTimeout(() => resolve("timeout"), FACET_TIMEOUT_MS),
        );

        const result = await Promise.race([facetWork, timeoutSentinel]);

        if (result === "timeout") {
          facetStatus = "timeout";
        } else {
          facets = {};
          let anyTruncated = wasFieldCapped;
          for (const { name, values, hasMore } of result) {
            facets[name] = values;
            if (hasMore) anyTruncated = true;
          }
          facetStatus = anyTruncated ? "truncated" : "complete";
        }
      }

      // Build group_counts: map __null__ sentinel back to __unassigned__ (matches KanbanView)
      const groupCounts = groupCountRows
        ? Object.fromEntries(
            groupCountRows.map(({ group_value, count }) => [
              group_value === "__null__" ? "__unassigned__" : group_value,
              parseInt(count, 10),
            ]),
          )
        : undefined;

      const responseBody: Record<string, unknown> = {
        data: responseRows,
        pagination: {
          total,
          page,
          page_size: pageSize,
          total_pages: Math.ceil(total / pageSize),
        },
        ...(groupCounts  ? { group_counts: groupCounts } : {}),
        ...(facets       ? { facets }                   : {}),
        ...(facetStatus  ? { facet_status: facetStatus } : {}),
        ...(Object.keys(reasons).length > 0 ? { reasons } : {}),
      };

      if (tenantId) {
        const roles = Array.isArray(claims["roles"]) ? (claims["roles"] as string[]) : [];
        await applyFieldSecurityMask(db, tenantId, entityCode, roles, responseBody, logger);
      }

      if (cache) {
        if (pageCacheKey) {
          await cache.set(pageCacheKey, JSON.stringify(responseBody), "EX", listPageCacheTtlSeconds).catch(() => undefined);
        }
        if (countCacheKey && cachedTotal === null) {
          await cache.set(countCacheKey, String(total), "EX", listCountCacheTtlSeconds).catch(() => undefined);
        }
      }

      res.json(responseBody);
    } catch (err) {
      logger?.error("records_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET BY ID ─────────────────────────────────────────────────────────────────
  const getHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = req.params["entity"] as string;
      const id = req.params["id"] as string;
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;

      // Resolve field map early — needed for both business-key lookup and response remapping
      const fieldMap = await resolveFieldMap(db, entityCode);
      // Resolve tenant for business-key path (UUID path works without tenant scope)
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      const row = await resolveRecordRow(db, fullTable, id, table.natural_key_fields, fieldMap, tenantId);

      if (!row) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      // Remap DB row keys and expose aliases for metadata-backed logical fields.
      const data = remapRecordRow(row, fieldMap);

      // ── BP identity merge ────────────────────────────────────────────────────
      // When identity_config.identity_via = 'business_partner', the role table (supplier/customer)
      // holds only commercial fields.  Fetch the linked BP record and merge
      // identity fields (name, legal_name, country, etc.) into data so the detail
      // header can display them without a second client-side request.
      // Role fields (supplier_code, status, etc.) take precedence — BP fields only
      // fill keys that are absent from the role row.
      if (configuredIdentityVia(table) === "business_partner") {
        const bpId = row["business_partner_id"] as string | undefined;
        if (bpId) {
          const bpRow = await db
            .selectFrom("master.business_partner as bp")
            .selectAll("bp")
            .where("bp.id" as never, "=", bpId as never)
            .executeTakeFirst() as Record<string, unknown> | undefined;
          if (bpRow) {
            const BP_MERGE_FIELDS = [
              "code", "name", "display_name", "legal_name", "legal_form",
              "registration_no", "registration_country_code", "tax_residence_country_code",
              "partner_category", "website_url", "description", "long_description",
              "external_ref", "aliases", "tags",
              "business_types", "founded_year", "employee_count_band", "annual_revenue_band",
            ] as const;
            for (const f of BP_MERGE_FIELDS) {
              if (bpRow[f] !== undefined && data[f] === undefined) {
                data[f] = bpRow[f];
              }
            }
            // Always expose bp_code regardless of field collision
            data["business_partner_code"] = bpRow["code"];
          }
        }

        // Qualification merge — surfaces key approval/risk fields for header status strip
        // without a separate client-side request.  Fields are merged only if absent from
        // the role row so role-level overrides always win.
        if (entityCode === "supplier" && typeof row.id === "string") {
          const qualRow = await db
            .selectFrom("master.supplier_qualification as sq" as never)
            .select(["sq.is_approved_supplier", "sq.is_blocked", "sq.risk_tier", "sq.onboarding_status"] as never[])
            .where("sq.supplier_id" as never, "=", row.id as never)
            .executeTakeFirst() as Record<string, unknown> | undefined;
          if (qualRow) {
            const QUAL_MERGE = ["is_approved_supplier", "is_blocked", "risk_tier", "onboarding_status"] as const;
            for (const f of QUAL_MERGE) {
              if (qualRow[f] !== undefined && data[f] === undefined) data[f] = qualRow[f];
            }
          }
        }
      }

      let responseData = data;
      if (isCertificationBackingTable(table)) {
        responseData = (await enrichCertificationTypeDisplayFields(db, [responseData]))[0] ?? responseData;
      }
      if (isCommodityClassificationBackingTable(table)) {
        responseData = (await enrichCommodityClassificationDisplayFields(db, [responseData]))[0] ?? responseData;
      }

      const detailBody: Record<string, unknown> = {
        id:               row.id,
        entity_code:      entityCode,
        tenant_id:        row.tenant_id,
        status:           row.status,
        is_active:        row.is_active,
        created_at:       row.created_at,
        created_by:       row.created_by,
        updated_at:       row.updated_at ?? null,
        updated_by:       row.updated_by ?? null,
        status_changed_at: row.status_changed_at ?? null,
        status_changed_by: row.status_changed_by ?? null,
        data:             responseData,
      };

      // Apply field-security masking using tenantId from the fetched row
      if (typeof row.tenant_id === "string") {
        const roles = Array.isArray(claims["roles"]) ? (claims["roles"] as string[]) : [];
        await applyFieldSecurityMask(db, row.tenant_id, entityCode, roles, detailBody, logger);
      }

      res.json(detailBody);
    } catch (err) {
      logger?.error("records_get_error", { err: String(err) });
      next(err);
    }
  };

  // ── CREATE ────────────────────────────────────────────────────────────────────
  const createHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = req.params["entity"] as string;
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      // Remap form field names → physical column names via entity_field
      const fieldMap = await resolveFieldMap(db, entityCode);
      const writeRules = await resolveEntityWriteFieldRules(db, entityCode);
      const body = req.body as { data?: Record<string, unknown> };
      const inputData = body.data ?? {};
      const mappedData: Record<string, unknown> = {};
      for (const [fieldName, value] of Object.entries(inputData)) {
        const fieldRule = writeRules.get(fieldName);
        if (!isEntityFieldWritable(fieldRule, "create").writable) continue;
        const columnName = fieldMap.get(fieldName);
        // Skip undefined/null values so DB column defaults can apply
        if (columnName && value !== undefined && value !== null) {
          assignMappedValue(mappedData, columnName, value);
        }
      }
      coerceArrayFields(mappedData, await resolveArrayColumns(db, entityCode));
      const jsonColumns = await resolveJsonColumns(db, entityCode);
      includeMappedJsonObjects(mappedData, jsonColumns);
      normalizeCommodityCategoryDomainGuards(entityCode, mappedData);
      serializeJsonFields(mappedData, jsonColumns);

      // Inject parent FK when entity is a child (identity_config.parent.field + scope).
      // The caller passes parent_id in body.data; we resolve the physical FK column from
      // metadata so the form never needs to know the internal column name.
      const createParentFk  = configuredParentFk(table);
      const createParentId  = typeof inputData["parent_id"] === "string" ? inputData["parent_id"] : null;
      if (createParentFk && createParentId) {
        mappedData[createParentFk] = createParentId;
        const scopeStr = configuredParentScope(table);
        if (scopeStr) {
          const eqIdx = scopeStr.indexOf("=");
          if (eqIdx > 0) {
            const scopeCol = scopeStr.slice(0, eqIdx);
            // Only apply entity default if the caller did not already supply the
            // discriminator column (e.g. form pre-fills owner_type=business_partner
            // from the add_href_template URL param for polymorphic child entities).
            if (mappedData[scopeCol] === undefined) {
              mappedData[scopeCol] = scopeStr.slice(eqIdx + 1);
            }
          }
        }
      }

      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Could not resolve tenant from session. Ensure you have an active org selected." });
        return;
      }
      mappedData.tenant_id = tenantId;

      // Resolve principal UUID (FK to master.principal). JIT-provisions on first use.
      const sub = requireJwtSubject(claims, res);
      if (!sub) return;
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);
      mappedData.created_by = principalId;

      if (!await authorizeEntityMutation({
        db,
        res,
        table: toMutationTableInfo(table),
        entityCode,
        tenantId,
        principalId,
        action: "create",
        logger,
      })) return;

      // Hoisted payment_entry post-insert data (set inside enrichment block below)
      let peSourceInvoiceId: string | undefined;

      // Auto-populate DOCUMENT-entity system fields that the generic form doesn't expose
      if (table.entity_class === "DOCUMENT") {
        if (!mappedData["company_code_id"]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cc = await (db as any)
            .selectFrom("master.company_code")
            .select(["id", "functional_currency"])
            .where("tenant_id", "=", tenantId)
            .where("status", "=", "active")
            .orderBy("created_at", "asc")
            .executeTakeFirst() as { id: string; functional_currency: string } | undefined;
          if (cc) {
            mappedData["company_code_id"] = cc.id;
            if (!mappedData["base_currency_code"]) {
              mappedData["base_currency_code"] = cc.functional_currency;
            }
          }
        } else if (!mappedData["base_currency_code"]) {
          // company_code_id was provided, resolve functional_currency from it
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cc = await (db as any)
            .selectFrom("master.company_code")
            .select(["functional_currency"])
            .where("id", "=", mappedData["company_code_id"])
            .executeTakeFirst() as { functional_currency: string } | undefined;
          if (cc) mappedData["base_currency_code"] = cc.functional_currency;
        }
        // Fallback: use currency_code as base_currency_code if still missing
        if (!mappedData["base_currency_code"] && mappedData["currency_code"]) {
          mappedData["base_currency_code"] = mappedData["currency_code"];
        }
        // journal_entry uses the column name "base_currency" (not "base_currency_code") and
        // it is auto-synced from company_code_id by trg_je_sync_base_currency — skip injection
        if (entityCode === "journal_entry") {
          delete mappedData["base_currency_code"];

          const jeCompanyId = mappedData["company_code_id"] as string | undefined;

          // Manual JE creation omits the locked source field from the form, but
          // document.journal_entry.source_doc_type is NOT NULL.
          if (!mappedData["source_doc_type"]) {
            mappedData["source_doc_type"] = "manual";
          }

          // Resolve book_id via company_code_book_assignment (statutory book)
          if (!mappedData["book_id"] && jeCompanyId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const book = await (db as any)
              .selectFrom("master.company_code_book_assignment as ba")
              .innerJoin("master.ledger_book as lb", "lb.id", "ba.book_id")
              .select(["ba.book_id"])
              .where("ba.tenant_id",       "=", tenantId)
              .where("ba.company_code_id", "=", jeCompanyId)
              .where("ba.status",          "=", "active")
              .where("lb.is_manual_je_allowed", "=", true)
              .where("lb.category",        "=", "statutory")
              .orderBy("ba.priority", "asc")
              .executeTakeFirst() as { book_id: string } | undefined;
            if (book) mappedData["book_id"] = book.book_id;
          }

          // Resolve fiscal_period_id + fiscal_year + period_number from posting_date.
          // trg_je_period_gate fires before trg_je_sync_fiscal_period (alphabetical order),
          // so all three must be set in app code for the gate to see correct values.
          const jePd = mappedData["posting_date"] as string | undefined;
          if (!mappedData["fiscal_period_id"] && jePd && jeCompanyId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fp = await (db as any)
              .selectFrom("master.fiscal_period as fp")
              .select(["fp.id", "fp.fiscal_year", "fp.period_number"])
              .where("fp.tenant_id",       "=", tenantId)
              .where("fp.company_code_id", "=", jeCompanyId)
              .where("fp.period_number",   ">=", 1)
              .where("fp.period_number",   "<=", 12)
              .where("fp.start_date",      "<=", jePd)
              .where("fp.end_date",        ">=", jePd)
              .orderBy("fp.period_number", "asc")
              .executeTakeFirst() as { id: string; fiscal_year: number; period_number: number } | undefined;
            if (fp) {
              mappedData["fiscal_period_id"] = fp.id;
              mappedData["fiscal_year"]      = fp.fiscal_year;
              mappedData["period_number"]    = fp.period_number;
            }
          }

          // document_date is NOT NULL; mirror posting_date when not explicitly provided
          if (!mappedData["document_date"] && jePd) {
            mappedData["document_date"] = jePd;
          }
        }
        // purchase_invoice-specific NOT NULL defaults
        if (entityCode === "purchase_invoice") {
          // currency_code is NOT NULL — fall back to the company's functional currency
          if (!mappedData["currency_code"]) {
            mappedData["currency_code"] = mappedData["base_currency_code"];
          }
          // tax_mode is required for non-proforma invoices (pi_tax_mode_req CHECK)
          if (!mappedData["tax_mode"] && mappedData["status"] !== "proforma") {
            mappedData["tax_mode"]        = "exclusive";
            mappedData["tax_mode_source"] = "cannot_infer";
          }
          if (mappedData["supplier_invoice_number"] === undefined) {
            mappedData["supplier_invoice_number"] = "";
          }
        }

        // payment_entry-specific enrichment
        if (entityCode === "payment_entry") {
          const postingDate = mappedData["posting_date"] as string | undefined;

          // source_invoice_id is not a DB column so fieldMap drops it from mappedData.
          // Read it from the raw inputData body instead.
          peSourceInvoiceId = inputData["source_invoice_id"] as string | undefined;

          // payment_type is the settlement classification. Older drafts used this field for
          // instrument mode; keep that compatibility by moving non-contract values to metadata.
          const paymentEntryTypes = new Set([
            "standard", "advance", "retention_release", "partial",
            "final", "down_payment", "urgent", "netting",
          ]);
          const rawPaymentType = String(mappedData["payment_type"] ?? "").trim().toLowerCase();
          const instrumentMode = String(
            inputData["payment_instrument_mode"] ??
            (rawPaymentType && !paymentEntryTypes.has(rawPaymentType) ? rawPaymentType : "") ??
            "",
          ).trim();
          if (!rawPaymentType) {
            mappedData["payment_type"] = "standard";
          } else if (!paymentEntryTypes.has(rawPaymentType)) {
            mappedData["payment_type"] = "standard";
          }
          const existingMeta = (typeof mappedData["metadata"] === "object" && mappedData["metadata"] !== null)
            ? (mappedData["metadata"] as Record<string, unknown>)
            : {};
          mappedData["metadata"] = instrumentMode
            ? { ...existingMeta, instrument_mode: instrumentMode }
            : existingMeta;

          // supplier_name: denormalized NOT NULL; resolve through the supplier app index.
          if (!mappedData["supplier_name"] && mappedData["supplier_id"]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const supplierRow = await (db as any)
              .selectFrom("master.supplier_app_index as s")
              .select([
                sql<string>`COALESCE(s.display_name, s.name, s.supplier_code)`.as("supplier_name"),
              ])
              .where("s.supplier_id", "=", mappedData["supplier_id"])
              .where("s.tenant_id",   "=", tenantId)
              .executeTakeFirst() as { supplier_name: string } | undefined;
            mappedData["supplier_name"] = supplierRow?.supplier_name ?? "Unknown Supplier";
          }
          if (!mappedData["supplier_name"]) mappedData["supplier_name"] = "Unknown Supplier";

          // fiscal_year + period_number: NOT NULL — resolve from master.fiscal_period
          if (!mappedData["fiscal_year"] && postingDate) {
            const peCompanyId = mappedData["company_code_id"] as string | undefined;
            if (peCompanyId) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const fp = await (db as any)
                .selectFrom("master.fiscal_period as fp")
                .select(["fp.fiscal_year", "fp.period_number"])
                .where("fp.tenant_id",       "=", tenantId)
                .where("fp.company_code_id", "=", peCompanyId)
                .where("fp.period_number",   ">=", 1)
                .where("fp.period_number",   "<=", 12)
                .where("fp.start_date",      "<=", postingDate)
                .where("fp.end_date",        ">=", postingDate)
                .orderBy("fp.period_number", "asc")
                .executeTakeFirst() as { fiscal_year: number; period_number: number } | undefined;
              if (fp) {
                mappedData["fiscal_year"]   = fp.fiscal_year;
                mappedData["period_number"] = fp.period_number;
              }
            }
            // Fallback: extract from date directly
            if (!mappedData["fiscal_year"]) {
              const d = new Date(postingDate);
              mappedData["fiscal_year"]   = d.getFullYear();
              mappedData["period_number"] = d.getMonth() + 1;
            }
          }

          // payment_method_id: NOT NULL — look up by legacy instrument_mode only when absent.
          if (!mappedData["payment_method_id"]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let pm: { id: string } | undefined;
            if (instrumentMode) {
              pm = await (db as any)
                .selectFrom("master.payment_method as pm")
                .select(["pm.id"])
                .where("pm.tenant_id",       "=", tenantId)
                .where("pm.instrument_mode", "=", instrumentMode)
                .where("pm.is_active",       "=", true)
                .orderBy("pm.sort_order",    "asc")
                .executeTakeFirst() as { id: string } | undefined;
            }
            // Fallback: any active method for this tenant
            if (!pm) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              pm = await (db as any)
                .selectFrom("master.payment_method as pm")
                .select(["pm.id"])
                .where("pm.tenant_id", "=", tenantId)
                .where("pm.is_active", "=", true)
                .orderBy("pm.sort_order", "asc")
                .executeTakeFirst() as { id: string } | undefined;
            }
            if (pm) mappedData["payment_method_id"] = pm.id;
          }

          // value_date: NOT NULL DEFAULT CURRENT_DATE — mirror posting_date when absent
          if (!mappedData["value_date"] && postingDate) {
            mappedData["value_date"] = postingDate;
          }
        }

        // Auto-generate the system document number when the wizard doesn't supply one.
        // Each document type has its own NOT NULL number column; a short random suffix
        // keeps it unique within the tenant without a DB sequence.
        const DOC_NUMBER_COLS: Record<string, { col: string; prefix: string }> = {
          purchase_invoice: { col: "invoice_number",    prefix: "PI"  },
          journal_entry:    { col: "je_number",         prefix: "JE"  },
          purchase_order:   { col: "commitment_number", prefix: "PO"  },
          payment_entry:    { col: "payment_number",    prefix: "PMT" },
        };
        const docNum = DOC_NUMBER_COLS[entityCode];
        if (docNum && !mappedData[docNum.col]) {
          const now    = new Date();
          const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
          const rand   = Math.random().toString(36).substring(2, 8).toUpperCase();
          const configured = await nextConfiguredEntityNumber(db, {
            tenantId,
            entityCode,
            numberField: "document_no",
            companyCodeId: typeof mappedData["company_code_id"] === "string" ? mappedData["company_code_id"] : null,
            fiscalYear: typeof mappedData["fiscal_year"] === "number" ? mappedData["fiscal_year"] : Number(mappedData["fiscal_year"] ?? "") || null,
            periodNumber: typeof mappedData["period_number"] === "number" ? mappedData["period_number"] : Number(mappedData["period_number"] ?? "") || null,
            effectiveDate: typeof mappedData["posting_date"] === "string"
              ? mappedData["posting_date"]
              : typeof mappedData["document_date"] === "string"
              ? mappedData["document_date"]
              : now,
          });
          mappedData[docNum.col] = configured ?? `${docNum.prefix}-${yyyymm}-${rand}`;
        }
      }

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;
      const row = await db.insertInto(fullTable).values(mappedData as never).returningAll().executeTakeFirst();

      // payment_entry post-insert: create allocation row linking to the source invoice.
      // Only when payment was created from an invoice (Propose Payment flow).
      if (entityCode === "payment_entry" && row && peSourceInvoiceId) {
        try {
          const paymentId     = (row as Record<string, unknown>)["id"] as string;
          const currencyCode  = (row as Record<string, unknown>)["currency_code"] as string;
          const paymentAmount = String((row as Record<string, unknown>)["payment_amount"] ?? "0");
          await sql`
            INSERT INTO document.payment_entry_allocation (
              id, tenant_id, payment_entry_id, line_no,
              purchase_invoice_id,
              currency_code,
              allocated_amount, discount_amount, withholding_tax_amount,
              advance_recovery_amount, retention_amount,
              created_by
            ) VALUES (
              ${crypto.randomUUID()}, ${tenantId}, ${paymentId}, 1,
              ${peSourceInvoiceId},
              ${currencyCode},
              ${paymentAmount}, 0, 0,
              0, 0,
              ${principalId}
            )
          `.execute(db);

          // Invoice paid_amount/status is intentionally NOT updated here.
          // The allocation row creates the invoice↔payment link for a draft payment.
          // Invoice status only changes after the payment is successfully posted
          // (handlePostPayment in payment-posting.service.ts calls resolveInvoicePaymentStatus
          //  inside the same posting transaction, from posted/non-voided allocations only).
        } catch (allocErr) {
          logger?.warn("pe_allocation_create_failed", {
            paymentId: String((row as Record<string, unknown>)["id"]),
            invoiceId: peSourceInvoiceId,
            err: allocErr instanceof Error ? allocErr.message : String(allocErr),
          });
        }
      }

      // Emit search-topic outbox event — best-effort; must not fail the
      // request. The generic search outbox handler routes this through
      // control.entity → Meilisearch.
      if (row) {
        try {
          await emitOutboxEvent(db, {
            tenantId,
            topic:      "search",
            eventType:  `${entityCode}.created`,
            entityType: entityCode,
            entityId:   String((row as { id: string }).id),
            actorId:    principalId,
          });
        } catch (emitErr) {
          logger?.warn("records_emit_search_failed", {
            entity: entityCode,
            err:    emitErr instanceof Error ? emitErr.message : String(emitErr),
          });
        }
        void logActivityRecord(tenantId, entityCode, String((row as { id: string }).id), "document.created", principalId, {});
      }

      await invalidateListCachesForEntity(tenantId, entityCode, table);

      res.status(201).json(row);
    } catch (err) {
      const businessError = mapPostgresBusinessError(err);
      if (businessError) {
        logger?.warn("records_create_business_error", {
          err: businessError.code,
          message: businessError.message,
          details: businessError.details,
        });
      } else {
        logger?.error("records_create_error", { err: String(err) });
      }
      next(err);
    }
  };

  // ── UPDATE ────────────────────────────────────────────────────────────────────
  const updateHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = req.params["entity"] as string;
      const id = req.params["id"] as string;
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;

      // Remap form field names → physical column names.
      // Strip columns that are system-managed and must never be set via PUT:
      //   is_active / is_deleted  — lifecycle flags owned by status transitions
      //   id / tenant_id          — identity, never mutable
      //   created_at / created_by — immutable creation audit
      const IMMUTABLE_COLS = new Set([
        "id", "tenant_id",
        "created_at", "created_by",
        "is_active", "is_deleted",
        "row_version",   // incremented by trigger; must never be written by API
      ]);
      const fieldMap = await resolveFieldMap(db, entityCode);
      const writeRules = await resolveEntityWriteFieldRules(db, entityCode);
      // lock_token and expected_row_version are top-level concurrency fields alongside data
      const body = req.body as { data?: Record<string, unknown>; lock_token?: string; expected_row_version?: number };
      const inputData = body.data ?? {};

      // Resolve UUID from business key when caller passes a canonical key
      const physicalId = UUID_RE.test(id)
        ? id
        : String((await resolveRecordRow(db, fullTable, id, table.natural_key_fields, fieldMap, tenantId))?.id ?? "");
      if (!physicalId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      // Status-aware field locks (editable_in_status). Only FIELD_LOCKED_BY_STATUS
      // raises a 400; other non-writable reasons (read-only, computed, unknown)
      // continue to be silently dropped during the mapping loop below.
      const recordStatus = await fetchRecordStatus(db, fullTable, physicalId, tenantId);
      const lockedFields = collectStatusLockedFields(inputData, writeRules, recordStatus);
      if (lockedFields.length > 0) {
        res.status(400).json({
          error:   "FIELD_NOT_EDITABLE",
          message: `${lockedFields.length} field(s) cannot be edited in status '${recordStatus ?? "unknown"}'.`,
          fields:  lockedFields,
        });
        return;
      }

      const mappedData: Record<string, unknown> = {};
      for (const [fieldName, value] of Object.entries(inputData)) {
        const fieldRule = writeRules.get(fieldName);
        if (!isEntityFieldWritable(fieldRule, "update", recordStatus).writable) continue;
        const columnName = fieldMap.get(fieldName);
        if (columnName && !IMMUTABLE_COLS.has(storageColumnName(columnName))) {
          assignMappedValue(mappedData, columnName, value);
        }
      }
      coerceArrayFields(mappedData, await resolveArrayColumns(db, entityCode));
      const jsonColumns = await resolveJsonColumns(db, entityCode);
      includeMappedJsonObjects(mappedData, jsonColumns);

      const sub = requireJwtSubject(claims, res);
      if (!sub) return;
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);

      // ── Concurrency guard (lease_plus_version) ──────────────────────────────
      if (!await authorizeEntityMutation({
        db,
        res,
        table: toMutationTableInfo(table),
        entityCode,
        tenantId,
        principalId,
        action: "update",
        recordId: physicalId,
        logger,
      })) return;

      const policy = resolveConcurrencyPolicy(table.concurrency_policy);
      if (policy.strategy === "lease_plus_version") {
        const lockToken        = typeof body["lock_token"]         === "string" ? body["lock_token"]         : null;
        const expectedVersion  = typeof body["expected_row_version"] === "number" ? body["expected_row_version"] : null;

        if (policy.rollout === "enforced" || (policy.rollout === "optional" && lockToken !== null)) {
          if (!lockToken || !principalId) {
            res.status(423).json({ error: "LOCK_REQUIRED", message: "lock_token is required to edit this document" });
            return;
          }
          const lockCheck = await verifyLock(db, { tenantId, entityName: entityCode, recordId: physicalId, lockedBy: principalId, lockToken });
          if (!lockCheck.valid) {
            const status = lockCheck.reason === "expired" ? 410 : 423;
            res.status(status).json({ error: lockCheck.reason === "expired" ? "LOCK_EXPIRED" : "LOCK_INVALID", reason: lockCheck.reason });
            return;
          }
          if (expectedVersion === null) {
            res.status(400).json({ error: "VERSION_REQUIRED", message: "expected_row_version is required when lock_token is provided" });
            return;
          }
        }

        if (policy.rollout === "observe" && lockToken) {
          const lockCheck = await verifyLock(db, { tenantId, entityName: entityCode, recordId: physicalId, lockedBy: principalId ?? "", lockToken });
          if (!lockCheck.valid) {
            logger?.warn("records_lock_observe_invalid", { entity: entityCode, id: physicalId, reason: lockCheck.reason });
          }
        }

        // Bind expectedVersion into the WHERE clause (null = skip version check)
        if (expectedVersion !== null) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const versionRow = await (db.selectFrom(fullTable) as any)
            .select(["row_version"])
            .where("id", "=", physicalId)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst() as { row_version: number } | undefined;

          if (!versionRow) {
            res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
            return;
          }
          if (versionRow.row_version !== expectedVersion) {
            res.status(409).json({ error: "VERSION_CONFLICT", message: "Document was modified by another user. Reload and try again.", current_version: versionRow.row_version });
            return;
          }
        }
      }
      // ── end concurrency guard ───────────────────────────────────────────────

      // Fetch current state for before/after diff in activity log
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oldRow = (await (db.selectFrom(fullTable) as any)
        .selectAll()
        .where("id", "=", physicalId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst()) as Record<string, unknown> | undefined;

      mergeJsonColumnUpdates(mappedData, oldRow, jsonColumns);
      normalizeCommodityCategoryDomainGuards(entityCode, mappedData, oldRow);
      serializeJsonFields(mappedData, jsonColumns);

      mappedData.updated_by = principalId ?? undefined;
      mappedData.updated_at = new Date().toISOString();

      const row = await db.transaction().execute(async (trx) => {
        if (principalId) {
          await sql`select set_config('app.current_principal_id', ${principalId}, true)`.execute(trx);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (trx.updateTable(fullTable) as any)
          .set(mappedData)
          .where("id", "=", physicalId)
          .where("tenant_id", "=", tenantId)
          .returningAll()
          .executeTakeFirst();
      });

      if (!row) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      try {
        await emitOutboxEvent(db, {
          tenantId,
          topic:      "search",
          eventType:  `${entityCode}.updated`,
          entityType: entityCode,
          entityId:   id,
          actorId:    principalId ?? SYSTEM_PRINCIPAL_UUID,
        });
      } catch (emitErr) {
        logger?.warn("records_emit_search_failed", {
          entity: entityCode,
          err:    emitErr instanceof Error ? emitErr.message : String(emitErr),
        });
      }

      const diffBefore: Record<string, unknown> = {};
      const diffAfter: Record<string, unknown>  = {};
      for (const [fieldName, newValue] of Object.entries(inputData)) {
        const colName  = fieldMap.get(fieldName) ?? fieldName;
        const oldValue = oldRow ? readMappedValue(oldRow, colName) : null;
        if (String(oldValue ?? "") !== String(newValue ?? "")) {
          diffBefore[fieldName] = oldValue;
          diffAfter[fieldName]  = newValue;
        }
      }
      void logActivityRecord(tenantId, entityCode, physicalId, "document.updated", principalId ?? SYSTEM_PRINCIPAL_UUID, { before: diffBefore, after: diffAfter });

      await invalidateListCachesForEntity(tenantId, entityCode, table);

      res.json(row);
    } catch (err) {
      logger?.error("records_update_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /records/:entity/:id/stream — Phase 11 #2 SSE ─────────────────────────
  // Streams record-level events (currently `record.statusChanged`) to clients
  // that are actively editing this record. Subscribes to a per-record Redis
  // channel; in environments without Redis the endpoint still accepts the
  // connection and emits keepalive comments — clients can fall back to
  // periodic /edit-context polling.
  //
  // Auth: bearer required + tenant resolution (same as every other records
  // endpoint). Read access is implicit — anyone who can read the record
  // can observe its status events.
  const KEEPALIVE_MS = 15_000;

  const recordStreamHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = req.params["entity"] as string;
      const id = req.params["id"] as string;
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      const fieldMap = await resolveFieldMap(db, entityCode);
      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;
      const physicalId = UUID_RE.test(id)
        ? id
        : String((await resolveRecordRow(db, fullTable, id, table.natural_key_fields, fieldMap, tenantId))?.id ?? "");
      if (!physicalId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      // Capture current etag + status so the client can compare incoming
      // events against the version it saw at connection time. Also serves
      // as the first event so reconnect logic gets a known-good baseline.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const initialRow = await (db.selectFrom(fullTable) as any)
        .select(["status", "row_version"])
        .where("id", "=", physicalId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst() as { status?: string; row_version?: number } | undefined;
      const initialEtag = String(initialRow?.row_version ?? 0);
      const initialStatus = typeof initialRow?.status === "string" ? initialRow.status : "unknown";

      // ── Redis subscription with 2s timeout fallback ──────────────────────
      // Mirrors the collab activity SSE pattern: race subscribe() against
      // a short timeout so a down Redis degrades to keepalive-only mode.
      const channel = recordChannel(tenantId, entityCode, physicalId);
      let subscriber: RedisClient | undefined;
      let feedMode: "pubsub" | "keepalive-only" = "keepalive-only";

      if (redis) {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
          subscriber = redis.duplicate();
          await Promise.race([
            subscriber.subscribe(channel),
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error("pubsub_timeout")), 2_000);
            }),
          ]);
          if (timeoutId) clearTimeout(timeoutId);
          feedMode = "pubsub";
        } catch (err) {
          if (timeoutId) clearTimeout(timeoutId);
          logger?.error("records_stream_subscribe_error", { err: String(err), entity: entityCode, recordId: physicalId });
          try { subscriber?.disconnect(); } catch { /* ignore */ }
          subscriber = undefined;
        }
      }

      // ── SSE headers ──────────────────────────────────────────────────────
      res.setHeader("Content-Type",      "text/event-stream");
      res.setHeader("Cache-Control",     "no-cache, no-transform");
      res.setHeader("Connection",        "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("X-Feed-Mode",       feedMode);
      res.flushHeaders();

      const sendEvent = (event: string, data: unknown): void => {
        try {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (err) {
          logger?.warn("records_stream_write_error", { err: String(err) });
        }
      };
      const sendKeepalive = (): void => {
        try { res.write(`:keepalive ${Date.now()}\n\n`); } catch { /* socket closed */ }
      };

      // Initial baseline event — lets the client compare incoming etag
      // against the one it observed at connection time without an extra
      // GET /edit-context round-trip.
      sendEvent("record.connected", {
        etag:   initialEtag,
        status: initialStatus,
      });

      // Forward published events to this client.
      if (subscriber) {
        subscriber.on("message", (_channel: string, payload: string) => {
          try {
            const parsed = JSON.parse(payload) as { eventType: string; data: unknown };
            sendEvent(parsed.eventType, parsed.data);
          } catch (err) {
            logger?.warn("records_stream_payload_parse_error", { err: String(err) });
          }
        });
      }

      const keepalive = setInterval(sendKeepalive, KEEPALIVE_MS);

      req.on("close", () => {
        clearInterval(keepalive);
        try { subscriber?.disconnect(); } catch { /* ignore */ }
      });
    } catch (err) {
      logger?.error("records_stream_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET edit-context ──────────────────────────────────────────────────────────
  // Returns the server-truthed envelope a client needs to enter Edit Mode:
  //   { recordId, entityCode, status, etag, canUpdate, fieldMask, sectionMask }
  //
  // The `etag` aliases the existing `row_version` numeric column so the
  // document-level Edit Session reuses the same optimistic concurrency
  // primitive as record-level PATCH. Sent back as `If-Match` on save.
  //
  // Phase 4 sets `canUpdate` based on whether the table is mutable and the
  // session has a principal. A more granular RBAC preflight would require
  // refactoring authorizeEntityMutation to return without writing to res;
  // the actual edit-session PATCH still enforces full authorization.
  const editContextHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = req.params["entity"] as string;
      const id = req.params["id"] as string;
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      const sub = requireJwtSubject(claims, res);
      if (!sub) return;
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm);

      const fieldMap = await resolveFieldMap(db, entityCode);
      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;
      const physicalId = UUID_RE.test(id)
        ? id
        : String((await resolveRecordRow(db, fullTable, id, table.natural_key_fields, fieldMap, tenantId))?.id ?? "");
      if (!physicalId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = (await (db.selectFrom(fullTable) as any)
        .select(["status", "row_version"])
        .where("id", "=", physicalId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst()) as { status?: string; row_version?: number } | undefined;
      if (!row) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      const recordStatus = await fetchRecordStatus(db, fullTable, physicalId, tenantId);
      const etag = String(row.row_version ?? 0);

      const writeRules = await resolveEntityWriteFieldRules(db, entityCode);
      const { fieldMask, sectionMask } = buildEditContextMask(writeRules, recordStatus);

      // Phase 7 (#5): full RBAC preflight via the same gate that PATCH /edit-session
      // will run on save. Replaces the prior lightweight "is principal + table mutable"
      // check. Now `canUpdate=false` reliably means Save would 403 — Edit button gets
      // hidden client-side and the user never enters a mode they can't commit from.
      const authOutcome = await checkEntityMutationAuthorization({
        db,
        table: toMutationTableInfo(table),
        entityCode,
        tenantId,
        principalId,
        action: "update",
        recordId: physicalId,
        logger,
      });
      const canUpdate = authOutcome.allowed;
      const disabledReason = authOutcome.allowed ? undefined : authOutcome.message;

      res.json({
        recordId: physicalId,
        entityCode,
        status: recordStatus ?? row.status ?? "unknown",
        etag,
        canUpdate,
        disabledReason,
        fieldMask,
        sectionMask,
      });
    } catch (err) {
      logger?.error("records_edit_context_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH edit-session ────────────────────────────────────────────────────────
  // Single transactional save endpoint for document Edit Mode.
  //   PATCH /records/:entity/:id/edit-session
  //   If-Match: <etag>
  //   Body: { header?: {...}, lines?: { create?, update?, delete? } }
  //
  // Phase 4 supports the `header` bundle. The `lines` bundle is forward-
  // declared in the contract (api-contracts/edit-session.ts) and rejected
  // here with 501; transactional line writes land in Phase 6 alongside
  // virtual row editing.
  //
  // Response always includes a fresh etag + updated fieldMask + sectionMask
  // so the client can recompute editability if the save triggered a status
  // change. On etag mismatch returns 409 with { currentEtag } in the body.
  const editSessionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = req.params["entity"] as string;
      const id = req.params["id"] as string;
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      const sub = requireJwtSubject(claims, res);
      if (!sub) return;
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);

      const ifMatch = req.headers["if-match"];
      const ifMatchStr = typeof ifMatch === "string" ? ifMatch : Array.isArray(ifMatch) ? ifMatch[0] : null;
      if (!ifMatchStr) {
        res.status(428).json({
          error: "PRECONDITION_REQUIRED",
          message: "If-Match header is required for edit-session writes.",
        });
        return;
      }
      const expectedVersion = parseInt(ifMatchStr, 10);
      if (Number.isNaN(expectedVersion)) {
        res.status(400).json({ error: "BAD_ETAG", message: "If-Match must be a numeric etag." });
        return;
      }

      const body = req.body as {
        header?: Record<string, unknown>;
        lines?: {
          create?: Record<string, unknown>[];
          update?: { id: string; data: Record<string, unknown> }[];
          delete?: string[];
        };
      };
      const headerPatch = body.header ?? {};
      const linesBundle = body.lines;
      const hasHeader = Object.keys(headerPatch).length > 0;
      const hasLineCreates = (linesBundle?.create?.length ?? 0) > 0;
      const hasLineUpdates = (linesBundle?.update?.length ?? 0) > 0;
      const hasLineDeletes = (linesBundle?.delete?.length ?? 0) > 0;
      const hasLines = hasLineCreates || hasLineUpdates || hasLineDeletes;
      if (!hasHeader && !hasLines) {
        res.status(400).json({
          error: "EMPTY_PATCH",
          message: "edit-session PATCH must contain at least one header field or line change.",
        });
        return;
      }

      const fieldMap = await resolveFieldMap(db, entityCode);
      const writeRules = await resolveEntityWriteFieldRules(db, entityCode);
      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;

      const physicalId = UUID_RE.test(id)
        ? id
        : String((await resolveRecordRow(db, fullTable, id, table.natural_key_fields, fieldMap, tenantId))?.id ?? "");
      if (!physicalId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      const recordStatus = await fetchRecordStatus(db, fullTable, physicalId, tenantId);
      if (hasHeader) {
        const lockedFields = collectStatusLockedFields(headerPatch, writeRules, recordStatus);
        if (lockedFields.length > 0) {
          res.status(400).json({
            error: "FIELD_NOT_EDITABLE",
            message: `${lockedFields.length} field(s) cannot be edited in status '${recordStatus ?? "unknown"}'.`,
            fields: lockedFields,
          });
          return;
        }
      }

      // Lines bundle guard: child-table convention must hold.
      if (hasLines && rejectNonConventionalLineMutation(res, entityCode)) return;

      const mappedData: Record<string, unknown> = {};
      if (hasHeader) {
        for (const [fieldName, value] of Object.entries(headerPatch)) {
          const fieldRule = writeRules.get(fieldName);
          if (!isEntityFieldWritable(fieldRule, "update", recordStatus).writable) continue;
          const columnName = fieldMap.get(fieldName);
          if (!columnName) continue;
          if (["id", "tenant_id", "created_by", "created_at", "row_version"].includes(storageColumnName(columnName))) continue;
          assignMappedValue(mappedData, columnName, value);
        }
        coerceArrayFields(mappedData, await resolveArrayColumns(db, entityCode));
        const jsonColumnsForHeader = await resolveJsonColumns(db, entityCode);
        includeMappedJsonObjects(mappedData, jsonColumnsForHeader);
      }
      // Always touch updated_at + updated_by so row_version bumps even on
      // lines-only saves — keeps the etag fresh for the next save.
      mappedData.updated_by = principalId ?? undefined;
      mappedData.updated_at = new Date().toISOString();
      const jsonColumns = await resolveJsonColumns(db, entityCode);

      // Authorization (full RBAC + policy gate). Writes 4xx to res on denial.
      if (!await authorizeEntityMutation({
        db,
        res,
        table: toMutationTableInfo(table),
        entityCode,
        tenantId,
        principalId,
        action: "update",
        recordId: physicalId,
        logger,
      })) return;

      // Optimistic concurrency: If-Match → expected row_version.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const versionRow = await (db.selectFrom(fullTable) as any)
        .select(["row_version"])
        .where("id", "=", physicalId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst() as { row_version: number } | undefined;
      if (!versionRow) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }
      if (versionRow.row_version !== expectedVersion) {
        res.status(409).json({
          error: "VERSION_CONFLICT",
          message: "Document was modified by another user.",
          currentEtag: String(versionRow.row_version),
        });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oldRow = (await (db.selectFrom(fullTable) as any)
        .selectAll()
        .where("id", "=", physicalId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst()) as Record<string, unknown> | undefined;

      if (hasHeader) {
        mergeJsonColumnUpdates(mappedData, oldRow, jsonColumns);
        normalizeCommodityCategoryDomainGuards(entityCode, mappedData, oldRow);
        serializeJsonFields(mappedData, jsonColumns);
      }

      const linesTable = `${table.table_schema}.${table.table_name}_line` as `${string}.${string}`;
      const fkCol      = `${table.table_name}_id`;

      // Phase 8: capture lines that need post-commit classification. Per-line
      // POST/PATCH endpoints classify inline after the row commits; the
      // bundle handler matches that by collecting affected line IDs during
      // the transaction and running classification after commit. Failures
      // here are best-effort and do NOT roll back the bundle.
      const isApBundleEntity = isPurchaseInvoiceLineMutation(table);
      type ClassifyCandidate = {
        lineId: string;
        body?: Record<string, unknown>;
      };
      const classifyCandidates: ClassifyCandidate[] = [];

      const row = await db.transaction().execute(async (trx) => {
        if (principalId) {
          await sql`select set_config('app.current_principal_id', ${principalId}, true)`.execute(trx);
        }

        // Header UPDATE — always runs so row_version bumps even on lines-only
        // saves. mappedData carries at minimum updated_by + updated_at.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updatedRow = await (trx.updateTable(fullTable) as any)
          .set(mappedData)
          .where("id", "=", physicalId)
          .where("tenant_id", "=", tenantId)
          .returningAll()
          .executeTakeFirst();

        if (!updatedRow) return undefined;

        // Lines bundle inside the same transaction. Order: delete → update →
        // create. Deletes first avoids constraint violations when a create
        // reuses a line_no slot. Creates last so auto-numbering sees the
        // post-delete state.
        if (hasLineDeletes) {
          for (const lineId of linesBundle!.delete!) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (trx.deleteFrom(linesTable) as any)
              .where("id", "=", lineId)
              .where(fkCol, "=", physicalId)
              .where("tenant_id", "=", tenantId)
              .execute();
          }
        }

        if (hasLineUpdates) {
          for (const { id: lineId, data } of linesBundle!.update!) {
            const patchRow = lineBodyToDb(data, fkCol, physicalId, tenantId);
            delete patchRow["tenant_id"];
            delete patchRow[fkCol];
            // Phase 8: apply purchase_invoice derived amounts + metadata merge
            // inside the transaction so the final UPDATE writes both user
            // fields and derived ones in a single round-trip. Helpers are
            // tenant-aware and no-op on non-AP entities.
            await applyDerivedPatchLineAmounts(trx, linesTable, fkCol, physicalId, lineId, tenantId, data, patchRow);
            await mergePatchLineMetadata(trx, linesTable, fkCol, physicalId, lineId, tenantId, patchRow);
            if (Object.keys(patchRow).length === 0) continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (trx.updateTable(linesTable) as any)
              .set(patchRow)
              .where("id", "=", lineId)
              .where(fkCol, "=", physicalId)
              .where("tenant_id", "=", tenantId)
              .execute();

            if (isApBundleEntity) {
              classifyCandidates.push({ lineId, body: data });
            }
          }
        }

        if (hasLineCreates) {
          // Phase 8: pre-resolve the "AP standalone line" UOM default and
          // parent-source-doc flag once per bundle (rather than per line) since
          // they're invariant across creates within the same save.
          const parentHasSourceDocumentForBundle = isApBundleEntity
            ? await purchaseInvoiceHasSourceDocument(trx, physicalId, tenantId)
            : false;
          let cachedStandaloneUom: string | null = null;
          const resolveStandaloneUom = async (): Promise<string | null> => {
            if (cachedStandaloneUom !== null) return cachedStandaloneUom;
            cachedStandaloneUom = await resolveDefaultProcurementLineUom(trx, tenantId);
            return cachedStandaloneUom;
          };

          let nextLineNo: number | null = null;
          for (const lineData of linesBundle!.create!) {
            const insertRow = lineBodyToDb(lineData, fkCol, physicalId, tenantId);
            if (insertRow["line_no"] == null) {
              if (nextLineNo == null) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const maxRow = await (trx.selectFrom(linesTable) as any)
                  .select((eb: any) => eb.fn.max("line_no").as("max_no"))
                  .where(fkCol, "=", physicalId)
                  .where("tenant_id", "=", tenantId)
                  .executeTakeFirst() as { max_no: number | null } | undefined;
                nextLineNo = (maxRow?.max_no ?? 0) + 1;
              }
              insertRow["line_no"] = nextLineNo;
              nextLineNo++;
            }
            // AP standalone line default UOM (matches per-line POST behavior).
            if (
              isApBundleEntity
              && !isPresentLineValue(insertRow["item_id"])
              && !requestHasLineSourceDocument(lineData, insertRow)
              && !parentHasSourceDocumentForBundle
            ) {
              const uom = await resolveStandaloneUom();
              if (uom && !insertRow["uom_code"]) insertRow["uom_code"] = uom;
            }
            if (!insertRow["item_description"]) insertRow["item_description"] = "";
            if (insertRow["quantity"]   == null) insertRow["quantity"]   = 1;
            if (insertRow["unit_price"] == null) insertRow["unit_price"] = 0;
            // Phase 8: derived amount fields (gross_amount from qty*price etc.)
            // computed inside the transaction so the INSERT writes them.
            applyDerivedCreateLineAmounts(insertRow, lineData);
            insertRow["created_by"] = principalId;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const inserted = await (trx.insertInto(linesTable) as any)
              .values(insertRow)
              .returning(["id"])
              .executeTakeFirstOrThrow() as { id: string };

            if (isApBundleEntity && inserted.id) {
              classifyCandidates.push({ lineId: inserted.id, body: lineData });
            }
          }
        }

        return updatedRow;
      });

      if (!row) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      // Phase 8: post-commit classification pass for purchase_invoice bundle lines.
      // Mirrors the per-line POST/PATCH semantics where classification runs
      // inline after the row commits. Best-effort — individual failures are
      // logged but do NOT roll back the bundle (which is already committed).
      if (isApBundleEntity && classifyCandidates.length > 0) {
        for (const candidate of classifyCandidates) {
          try {
            const refreshed = await refreshLineRow(db, linesTable, fkCol, physicalId, candidate.lineId, tenantId);
            if (!refreshed) continue;
            await maybeClassifyPurchaseInvoiceLine({
              table,
              linesTable,
              fkCol,
              tenantId,
              principalId,
              invoiceId:  physicalId,
              lineId:     candidate.lineId,
              lineRow:    refreshed,
              body:       candidate.body,
            });
          } catch (err) {
            logger?.warn("records_edit_session_bundle_classify_error", {
              entity:  entityCode,
              lineId:  candidate.lineId,
              err:     err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      // Status may have changed (e.g. workflow side-effect); recompute mask.
      const newStatus = await fetchRecordStatus(db, fullTable, physicalId, tenantId);
      const refreshedRules = await resolveEntityWriteFieldRules(db, entityCode);
      const { fieldMask: newFieldMask, sectionMask: newSectionMask } = buildEditContextMask(refreshedRules, newStatus);

      try {
        await emitOutboxEvent(db, {
          tenantId,
          topic:      "search",
          eventType:  `${entityCode}.updated`,
          entityType: entityCode,
          entityId:   id,
          actorId:    principalId ?? SYSTEM_PRINCIPAL_UUID,
        });
      } catch (emitErr) {
        logger?.warn("records_edit_session_emit_search_failed", {
          entity: entityCode,
          err:    emitErr instanceof Error ? emitErr.message : String(emitErr),
        });
      }

      const diffBefore: Record<string, unknown> = {};
      const diffAfter: Record<string, unknown>  = {};
      for (const [fieldName, newValue] of Object.entries(headerPatch)) {
        const colName  = fieldMap.get(fieldName) ?? fieldName;
        const oldValue = oldRow ? readMappedValue(oldRow, colName) : null;
        if (String(oldValue ?? "") !== String(newValue ?? "")) {
          diffBefore[fieldName] = oldValue;
          diffAfter[fieldName]  = newValue;
        }
      }
      void logActivityRecord(tenantId, entityCode, physicalId, "document.updated", principalId ?? SYSTEM_PRINCIPAL_UUID, { before: diffBefore, after: diffAfter });

      await invalidateListCachesForEntity(tenantId, entityCode, table);

      const rowRecord = row as Record<string, unknown>;
      const newEtag = String(rowRecord["row_version"] ?? expectedVersion + 1);
      const finalStatus = typeof rowRecord["status"] === "string"
        ? rowRecord["status"]
        : (newStatus ?? "unknown");

      // Phase 11 #2: notify any other clients editing this record that its
      // state advanced. The actor's own client receives the event too via SSE,
      // but its etag will match `newEtag` so the client filters it out.
      // Fired AFTER the response payload is computed but before res.json so
      // we don't block the HTTP response on the publish.
      const oldStatus = typeof (oldRow ?? {})["status"] === "string"
        ? (oldRow as Record<string, unknown>)["status"] as string
        : null;
      if (finalStatus !== oldStatus) {
        publishRecordEvent(
          tenantId,
          entityCode,
          physicalId,
          "record.statusChanged",
          {
            etag:      newEtag,
            newStatus: finalStatus,
            oldStatus,
            actorId:   principalId ?? SYSTEM_PRINCIPAL_UUID,
          },
          new Date().toISOString(),
        );
      }

      res.json({
        record: {
          id: physicalId,
          data: rowRecord,
          status: finalStatus,
        },
        etag: newEtag,
        status: finalStatus,
        fieldMask: newFieldMask,
        sectionMask: newSectionMask,
      });
    } catch (err) {
      logger?.error("records_edit_session_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH ─────────────────────────────────────────────────────────────────────
  // Partial update. Accepts either:
  //   Flat body:   { fieldName: value, ... }          — used by KanbanView status transitions
  //   Wrapped:     { data: { fieldName: value, ... } } — matches PUT convention
  // Only the provided fields are written; omitted fields are left unchanged.
  const patchHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = req.params["entity"] as string;
      const id = req.params["id"] as string;
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      // Resolve tenant + principal
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      const sub = requireJwtSubject(claims, res);
      if (!sub) return;
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);

      // Unwrap body — support both flat and { data: {...} } forms
      const body = req.body as Record<string, unknown>;
      const inputData: Record<string, unknown> =
        typeof body["data"] === "object" && body["data"] !== null && !Array.isArray(body["data"])
          ? (body["data"] as Record<string, unknown>)
          : body;

      if (Object.keys(inputData).length === 0) {
        res.status(400).json({ error: "EMPTY_PATCH", message: "PATCH body must contain at least one field" });
        return;
      }

      // Map logical field names → physical column names
      const fieldMap = await resolveFieldMap(db, entityCode);
      const writeRules = await resolveEntityWriteFieldRules(db, entityCode);

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;

      // Resolve UUID from business key when caller passes a canonical key
      const physicalId = UUID_RE.test(id)
        ? id
        : String((await resolveRecordRow(db, fullTable, id, table.natural_key_fields, fieldMap, tenantId))?.id ?? "");
      if (!physicalId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      // Status-aware field locks (editable_in_status). Only FIELD_LOCKED_BY_STATUS
      // raises a 400; other non-writable reasons continue to be silently dropped.
      const recordStatus = await fetchRecordStatus(db, fullTable, physicalId, tenantId);
      const lockedFields = collectStatusLockedFields(inputData, writeRules, recordStatus);
      if (lockedFields.length > 0) {
        res.status(400).json({
          error:   "FIELD_NOT_EDITABLE",
          message: `${lockedFields.length} field(s) cannot be edited in status '${recordStatus ?? "unknown"}'.`,
          fields:  lockedFields,
        });
        return;
      }

      const mappedData: Record<string, unknown> = {};
      for (const [fieldName, value] of Object.entries(inputData)) {
        const fieldRule = writeRules.get(fieldName);
        if (!isEntityFieldWritable(fieldRule, "update", recordStatus).writable) continue;
        const columnName = fieldMap.get(fieldName);
        if (!columnName) continue;
        if (["id", "tenant_id", "created_by", "created_at", "row_version"].includes(storageColumnName(columnName))) continue;
        assignMappedValue(mappedData, columnName, value);
      }
      coerceArrayFields(mappedData, await resolveArrayColumns(db, entityCode));
      const jsonColumns = await resolveJsonColumns(db, entityCode);
      includeMappedJsonObjects(mappedData, jsonColumns);

      mappedData.updated_by = principalId ?? undefined;
      mappedData.updated_at = new Date().toISOString();

      // ── Concurrency guard (lease_plus_version) ──────────────────────────────
      if (!await authorizeEntityMutation({
        db,
        res,
        table: toMutationTableInfo(table),
        entityCode,
        tenantId,
        principalId,
        action: "update",
        recordId: physicalId,
        logger,
      })) return;

      const patchPolicy = resolveConcurrencyPolicy(table.concurrency_policy);
      if (patchPolicy.strategy === "lease_plus_version") {
        const lockToken       = typeof body["lock_token"]          === "string" ? body["lock_token"]          : null;
        const expectedVersion = typeof body["expected_row_version"] === "number" ? body["expected_row_version"] : null;

        if (patchPolicy.rollout === "enforced" || (patchPolicy.rollout === "optional" && lockToken !== null)) {
          if (!lockToken || !principalId) {
            res.status(423).json({ error: "LOCK_REQUIRED", message: "lock_token is required to edit this document" });
            return;
          }
          const lockCheck = await verifyLock(db, { tenantId, entityName: entityCode, recordId: physicalId, lockedBy: principalId, lockToken });
          if (!lockCheck.valid) {
            const httpStatus = lockCheck.reason === "expired" ? 410 : 423;
            res.status(httpStatus).json({ error: lockCheck.reason === "expired" ? "LOCK_EXPIRED" : "LOCK_INVALID", reason: lockCheck.reason });
            return;
          }
          if (expectedVersion !== null) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const versionRow = await (db.selectFrom(fullTable) as any)
              .select(["row_version"])
              .where("id", "=", physicalId)
              .where("tenant_id", "=", tenantId)
              .executeTakeFirst() as { row_version: number } | undefined;
            if (versionRow && versionRow.row_version !== expectedVersion) {
              res.status(409).json({ error: "VERSION_CONFLICT", message: "Document was modified by another user. Reload and try again.", current_version: versionRow.row_version });
              return;
            }
          }
        }
      }
      // ── end concurrency guard ───────────────────────────────────────────────

      // Fetch current state for before/after diff in activity log
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oldRow = (await (db.selectFrom(fullTable) as any)
        .selectAll()
        .where("id", "=", physicalId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst()) as Record<string, unknown> | undefined;

      mergeJsonColumnUpdates(mappedData, oldRow, jsonColumns);
      normalizeCommodityCategoryDomainGuards(entityCode, mappedData, oldRow);
      serializeJsonFields(mappedData, jsonColumns);

      const row = await db.transaction().execute(async (trx) => {
        if (principalId) {
          await sql`select set_config('app.current_principal_id', ${principalId}, true)`.execute(trx);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (trx.updateTable(fullTable) as any)
          .set(mappedData)
          .where("id", "=", physicalId)
          .where("tenant_id", "=", tenantId)
          .returningAll()
          .executeTakeFirst();
      });

      if (!row) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      try {
        await emitOutboxEvent(db, {
          tenantId,
          topic:      "search",
          eventType:  `${entityCode}.updated`,
          entityType: entityCode,
          entityId:   id,
          actorId:    principalId ?? SYSTEM_PRINCIPAL_UUID,
        });
      } catch (emitErr) {
        logger?.warn("records_emit_search_failed", {
          entity: entityCode,
          err:    emitErr instanceof Error ? emitErr.message : String(emitErr),
        });
      }

      const diffBefore: Record<string, unknown> = {};
      const diffAfter: Record<string, unknown>  = {};
      for (const [fieldName, newValue] of Object.entries(inputData)) {
        const colName  = fieldMap.get(fieldName) ?? fieldName;
        const oldValue = oldRow ? readMappedValue(oldRow, colName) : null;
        if (String(oldValue ?? "") !== String(newValue ?? "")) {
          diffBefore[fieldName] = oldValue;
          diffAfter[fieldName]  = newValue;
        }
      }
      void logActivityRecord(tenantId, entityCode, physicalId, "document.updated", principalId ?? SYSTEM_PRINCIPAL_UUID, { before: diffBefore, after: diffAfter });

      await invalidateListCachesForEntity(tenantId, entityCode, table);

      res.json(row);
    } catch (err) {
      logger?.error("records_patch_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE ────────────────────────────────────────────────────────────────────
  const deleteHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = req.params["entity"] as string;
      const id = req.params["id"] as string;
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;

      // Resolve UUID from business key so the delete is always by primary key
      const sub = requireJwtSubject(claims, res);
      if (!sub) return;
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);

      const physicalId = UUID_RE.test(id)
        ? id
        : String((await resolveRecordRow(db, fullTable, id, table.natural_key_fields, new Map(), tenantId))?.id ?? "");
      if (!physicalId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      if (!await authorizeEntityMutation({
        db,
        res,
        table: toMutationTableInfo(table),
        entityCode,
        tenantId,
        principalId,
        action: "delete",
        recordId: physicalId,
        logger,
      })) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db.deleteFrom(fullTable) as any)
        .where("id", "=", physicalId)
        .where("tenant_id", "=", tenantId)
        .execute();

      // Emit delete event so the search outbox handler removes the doc.
      // Delete events are recognised by the `.deleted` suffix on event_type.
      try {
        await emitOutboxEvent(db, {
          tenantId,
          topic:      "search",
          eventType:  `${entityCode}.deleted`,
          entityType: entityCode,
          entityId:   physicalId,
          actorId:    principalId ?? SYSTEM_PRINCIPAL_UUID,
        });
      } catch (emitErr) {
        logger?.warn("records_emit_search_failed", {
          entity: entityCode,
          err:    emitErr instanceof Error ? emitErr.message : String(emitErr),
        });
      }

      await invalidateListCachesForEntity(tenantId, entityCode, table);

      // Phase 11 #2: notify any other clients viewing this record so their
      // SSE handler can route them to the list (or show an "Item removed"
      // banner). Mirrors the statusChanged emit on save.
      publishRecordEvent(tenantId, entityCode, physicalId, "record.deleted", {
        actorId: principalId ?? null,
      }, new Date().toISOString());

      res.status(204).end();
    } catch (err) {
      logger?.error("records_delete_error", { err: String(err) });
      next(err);
    }
  };

  // ── DEBUG (dev only) ──────────────────────────────────────────────────────────
  const debugHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const table = await resolveEntityTable(db, entityCode);

      const fieldRows = await db
        .selectFrom("control.entity_field as ef")
        .innerJoin("control.entity_version as ev", "ev.id", "ef.entity_version_id")
        .innerJoin("control.entity as e", "e.id", "ev.entity_id")
        .select(["ef.name", "ef.column_name", "ef.data_type", "ef.is_active", "ef.is_required", "ef.origin", "ev.status as version_status"])
        .where("e.name", "=", entityCode)
        .where("e.tenant_id", "is", null)
        .execute();

      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantCode = xOrg.split("--")[0] ?? null;
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      const sub = readJwtSubject(claims);
      const principalId = sub && tenantId ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims) : null;

      res.json({
        entity: table,
        fields: fieldRows,
        tenant: { xOrg, xRealm, tenantCode, resolvedId: tenantId },
        principal: { sub, resolvedId: principalId },
      });
    } catch (err) {
      logger?.error("records_debug_error", { err: String(err) });
      next(err);
    }
  };

  // ── Sub-resource stubs ────────────────────────────────────────────────────────
  // Return { data: [] } once auth + entity are verified.
  // Each sub-resource will be replaced with a real implementation when the
  // backing service layer is ready.
  function subResourceStub(subPath: string): RequestHandler {
    return async (req, res, next) => {
      try {
        const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
        if (!claims) return;
        const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
        const table = await resolveEntityTable(db, entityCode);
        if (!table) {
          res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
          return;
        }
        res.json({ data: [] });
      } catch (err) {
        logger?.error(`records_${subPath.replace(/-/g, "_")}_error`, { err: String(err) });
        next(err);
      }
    };
  }

  // ── GET /:entity/:id/distributions — accounting_distribution by source_doc_id ─
  const distributionsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id = req.params["id"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      let rows: Record<string, unknown>[] = [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (db as any)
          .selectFrom("document.accounting_distribution")
          .selectAll()
          .where("source_doc_id", "=", id);
        if (tenantId !== null) q = q.where("tenant_id", "=", tenantId);
        q = q
          .orderBy("source_line_id", "asc")
          .orderBy("distribution_no", "asc");
        rows = await q.execute();
      } catch {
        rows = [];
      }

      res.json({ data: rows });
    } catch (err) {
      logger?.error("records_distributions_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /:entity/:id/lines/:lineId/distributions — per-line distributions ───────
  const lineDistributionsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id     = req.params["id"]     as string;
      const lineId = req.params["lineId"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      let rows: Record<string, unknown>[] = [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (db as any)
          .selectFrom("document.accounting_distribution")
          .selectAll()
          .where("source_doc_id",  "=", id)
          .where("source_line_id", "=", lineId);
        if (tenantId !== null) q = q.where("tenant_id", "=", tenantId);
        q = q.orderBy("distribution_no", "asc");
        rows = await q.execute();
      } catch {
        rows = [];
      }

      res.json({ data: rows });
    } catch (err) {
      logger?.error("records_line_distributions_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /:entity/:id/workflow — document.workflow_request + stages ─────────────
  const workflowHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      let rows: Record<string, unknown>[] = [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (db as any)
          .selectFrom("document.workflow_request as wr")
          .select([
            "wr.id", "wr.workflow_type", "wr.entity_type", "wr.entity_id",
            "wr.status", "wr.decision", "wr.decided_by", "wr.decided_at",
            "wr.reason", "wr.requested_by", "wr.requested_at",
            "wr.metadata", "wr.created_at", "wr.updated_at",
          ] as never[])
          .where("wr.entity_type" as never, "=", entityCode as never)
          .where("wr.entity_id"   as never, "=", recordId   as never);
        if (tenantId) q = q.where("wr.tenant_id" as never, "=", tenantId as never);
        q = q.orderBy("wr.requested_at" as never, "desc");
        rows = await q.execute();
      } catch {
        rows = [];
      }

      // Attach stages (with SLA metrics) to each workflow_request
      const enriched = await Promise.all(rows.map(async (wr) => {
        let stageRows: Record<string, unknown>[] = [];
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          stageRows = await (db as any)
            .selectFrom("document.workflow_stage as ws")
            .leftJoin("control.workflow_sla_policy as sp", "sp.id" as never, "ws.sla_policy_id" as never)
            .select([
              "ws.id", "ws.stage_no", "ws.name", "ws.mode",
              "ws.status", "ws.outcome", "ws.started_at", "ws.completed_at",
              "sp.code as sla_code", "sp.name as sla_name", "sp.timers as sla_timers",
            ] as never[])
            .where("ws.workflow_request_id" as never, "=", (wr["id"] as string) as never)
            .orderBy("ws.stage_no" as never, "asc")
            .execute();
        } catch { stageRows = []; }

        // Compute SLA metrics per stage
        const now = Date.now();
        const stages = stageRows.map((ws) => {
          const timers = ws["sla_timers"] as Array<{ after_minutes: number; action: string }> | null;
          // sla_target_hours = first timer's after_minutes / 60 (the breach/escalate timer)
          const escalateTimer = timers?.find((t) => t.action === "escalate") ?? timers?.[0];
          const slaTargetHours = escalateTimer ? escalateTimer.after_minutes / 60 : undefined;

          const startedAt  = ws["started_at"]   ? new Date(ws["started_at"] as string).getTime()   : undefined;
          const completedAt = ws["completed_at"] ? new Date(ws["completed_at"] as string).getTime() : undefined;

          const slaDeadlineMs = startedAt && slaTargetHours
            ? startedAt + slaTargetHours * 3_600_000 : undefined;
          const slaDeadline = slaDeadlineMs
            ? new Date(slaDeadlineMs).toISOString() : undefined;

          const elapsedToMs = completedAt ?? now;
          const timeElapsedHours = startedAt
            ? (elapsedToMs - startedAt) / 3_600_000 : undefined;

          let slaStatus: string | undefined;
          if (slaTargetHours !== undefined && timeElapsedHours !== undefined) {
            const ratio     = timeElapsedHours / slaTargetHours;
            const isActive  = ws["status"] === "active" || ws["status"] === "pending";
            if (!isActive)         slaStatus = ratio <= 1 ? "completed_ok" : "completed_late";
            else if (ratio > 1)    slaStatus = "breached";
            else if (ratio >= 0.75) slaStatus = "at_risk";
            else                   slaStatus = "on_track";
          }

          // Omit raw timers JSONB from client response — replace with computed fields
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { sla_timers: _timers, ...rest } = ws as Record<string, unknown>;
          return {
            ...rest,
            sla_target_hours:    slaTargetHours,
            sla_deadline:        slaDeadline,
            time_elapsed_hours:  timeElapsedHours !== undefined ? Math.round(timeElapsedHours * 10) / 10 : undefined,
            sla_status:          slaStatus,
          };
        });

        return { ...wr, stages };
      }));

      res.json({ data: enriched });
    } catch (err) {
      logger?.error("records_workflow_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /:entity/:id/approvals — event.work_item (task_type=approval) ─────────
  const approvalsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      let rows: Record<string, unknown>[] = [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (db as any)
          .selectFrom("event.work_item as wi")
          .innerJoin("document.workflow_request as wr", "wr.id" as never, "wi.workflow_request_id" as never)
          .leftJoin("master.principal_profile as pp", "pp.principal_id" as never, "wi.assignee_id" as never)
          .select([
            "wi.id", "wi.task_type", "wi.workflow_request_id", "wi.workflow_stage_id",
            "wi.assignee_id", "wi.designated_id",
            "wi.order_index", "wi.status", "wi.decision", "wi.reason",
            "wi.assigned_at", "wi.started_at", "wi.completed_at", "wi.due_at",
            "wi.metadata",
            "pp.display_name as assignee_display_name",
            "pp.given_name as assignee_given_name",
            "pp.family_name as assignee_family_name",
          ] as never[])
          .where("wr.entity_type" as never, "=", entityCode as never)
          .where("wr.entity_id"   as never, "=", recordId   as never);
        if (tenantId) q = q.where("wi.tenant_id" as never, "=", tenantId as never);
        q = q
          .orderBy("wi.order_index" as never, "asc")
          .orderBy("wi.created_at"  as never, "asc");
        rows = await q.execute();
      } catch {
        rows = [];
      }

      res.json({ data: rows });
    } catch (err) {
      logger?.error("records_approvals_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /:entity/:id/approvals — add an ad-hoc approver to the active workflow ─
  const addApproverHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? (await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) ?? sub) : null;

      const body       = (req.body ?? {}) as Record<string, unknown>;
      const assigneeId = typeof body["assignee_id"] === "string" ? body["assignee_id"] : null;
      const reason     = typeof body["reason"]      === "string" ? body["reason"]      : null;

      if (!assigneeId) {
        res.status(400).json({ error: "MISSING_ASSIGNEE", message: "assignee_id is required" });
        return;
      }

      // Find the active workflow_request for this entity
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wr = await (db as any)
        .selectFrom("document.workflow_request as wr")
        .select(["wr.id"] as never[])
        .where("wr.entity_type" as never, "=", entityCode as never)
        .where("wr.entity_id"   as never, "=", recordId   as never)
        .where("wr.tenant_id"   as never, "=", tenantId   as never)
        .where("wr.status"      as never, "=", "pending"  as never)
        .orderBy("wr.requested_at" as never, "desc")
        .limit(1)
        .executeTakeFirst() as { id: string } | undefined;

      if (!wr) {
        res.status(422).json({ error: "NO_ACTIVE_WORKFLOW", message: "No pending workflow request found for this record" });
        return;
      }

      // Find the currently active stage (link ad-hoc item to it if one exists)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stage = await (db as any)
        .selectFrom("document.workflow_stage as ws")
        .select(["ws.id"] as never[])
        .where("ws.workflow_request_id" as never, "=", (wr["id"] as string) as never)
        .where("ws.status"              as never, "in", (["pending", "active"] as unknown) as never)
        .orderBy("ws.stage_no" as never, "asc")
        .limit(1)
        .executeTakeFirst() as { id: string } | undefined;

      const now = new Date();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inserted = await (db as any)
        .insertInto("event.work_item")
        .values({
          tenant_id:           tenantId,
          task_type:           "approval",
          workflow_request_id: wr["id"],
          workflow_stage_id:   stage?.id ?? null,
          designated_id:       assigneeId,
          assignee_id:         assigneeId,
          order_index:         99,
          status:              "assigned",
          assigned_at:         now,
          metadata:            JSON.stringify({ added_manually: true, ...(reason ? { reason } : {}) }),
          created_by:          principalId ?? SYSTEM_PRINCIPAL_UUID,
        })
        .returningAll()
        .executeTakeFirst() as Record<string, unknown>;

      res.status(201).json({ ok: true, data: inserted });
    } catch (err) {
      logger?.error("records_add_approver_error", { err: String(err) });
      next(err);
    }
  };

  // ── Helpers shared by line mutation handlers ─────────────────────────────────

  function rejectNonConventionalLineMutation(res: Response, entityCode: string): boolean {
    if (entityCode === "journal_entry") {
      res.status(422).json({
        error: "UNSUPPORTED_LINE_MUTATION",
        message: "Journal Entry lines use document.journal_line and require a GL account plus debit or credit amounts. Use the journal editor flow or /api/finance/journals instead.",
      });
      return true;
    }

    if (entityCode === "payment_entry") {
      res.status(422).json({
        error: "UNSUPPORTED_LINE_MUTATION",
        message: "Payment Entry allocation lines are derived from payment allocation data and cannot be changed through the generic records line endpoint.",
      });
      return true;
    }

    return false;
  }

  const LINE_PRICE_FIELDS = ["quantity", "unit_price", "price_unit"];
  const LINE_AMOUNT_DERIVATION_FIELDS = [
    ...LINE_PRICE_FIELDS,
    "discount_pct",
    "discount_amount",
    "tax_amount",
    "withholding_tax_amount",
    "retention_pct",
    "retention_amount",
  ];

  function hasOwnBodyField(body: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(body, key);
  }

  function isEmptyAmountValue(value: unknown): boolean {
    return value == null || (typeof value === "string" && value.trim() === "");
  }

  function isPresentLineValue(value: unknown): boolean {
    return value != null && (typeof value !== "string" || value.trim() !== "");
  }

  function requestHasLineSourceDocument(body: Record<string, unknown>, row: Record<string, unknown>): boolean {
    return [
      body["commitment_line_id"],
      body["goods_receipt_line_id"],
      body["ses_line_id"],
      row["commitment_line_id"],
      row["goods_receipt_line_id"],
      row["ses_line_id"],
    ].some(isPresentLineValue);
  }

  // Phase 8: helpers below accept an explicit `kysely` executor so the bundle
  // handler in editSessionHandler can run them inside its transaction. Pass `db`
  // from per-line handlers (they're not wrapped in tx) or `trx` from inside
  // `db.transaction().execute(async (trx) => ...)` for bundle operations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function purchaseInvoiceHasSourceDocument(kysely: Kysely<any>, invoiceId: string, tenantId: string | null): Promise<boolean> {
    if (!tenantId) return false;
    const row = await sql<{ commitment_id: string | null }>`
      SELECT commitment_id
      FROM document.purchase_invoice
      WHERE id = ${invoiceId}::uuid
        AND tenant_id = ${tenantId}::uuid
      LIMIT 1
    `.execute(kysely);
    return Boolean(row.rows[0]?.commitment_id);
  }

  function explicitLineAmount(body: Record<string, unknown>): number | null {
    const raw = hasOwnBodyField(body, "gross_amount") && !isEmptyAmountValue(body["gross_amount"])
      ? body["gross_amount"]
      : hasOwnBodyField(body, "line_amount") && !isEmptyAmountValue(body["line_amount"])
      ? body["line_amount"]
      : undefined;
    if (raw === undefined) return null;
    const amount = Number(raw);
    return Number.isFinite(amount) ? amount : null;
  }

  function finiteNumber(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function lineGrossAmount(
    quantity: unknown,
    unitPrice: unknown,
    priceUnit: unknown,
  ): number {
    const qty   = finiteNumber(quantity, 1);
    const price = finiteNumber(unitPrice, 0);
    const unit  = finiteNumber(priceUnit, 1);
    return (qty * price) / (unit || 1);
  }

  function applyDerivedCreateLineAmounts(
    row:  Record<string, unknown>,
    body: Record<string, unknown>,
  ): void {
    const amount = explicitLineAmount(body);
    if (amount !== null) {
      row["quantity"]     = 1;
      row["unit_price"]   = amount;
      row["price_unit"]   = 1;
      row["gross_amount"] = amount;
      return;
    }
    row["gross_amount"] = lineGrossAmount(
      row["quantity"],
      row["unit_price"],
      row["price_unit"] ?? 1,
    );
  }

  async function applyDerivedPatchLineAmounts(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kysely: Kysely<any>,
    linesTable: `${string}.${string}`,
    fkCol: string,
    parentId: string,
    lineId: string,
    tenantId: string | null,
    body: Record<string, unknown>,
    patchRow: Record<string, unknown>,
  ): Promise<void> {
    const hasDerivedInputChange = LINE_AMOUNT_DERIVATION_FIELDS.some((field) => hasOwnBodyField(body, field));
    const amount = hasDerivedInputChange ? null : explicitLineAmount(body);
    if (amount !== null) {
      patchRow["quantity"]     = 1;
      patchRow["unit_price"]   = amount;
      patchRow["price_unit"]   = 1;
      patchRow["gross_amount"] = amount;
      if (hasOwnBodyField(body, "uom_code") && isEmptyAmountValue(body["uom_code"])) {
        delete patchRow["uom_code"];
      }
      return;
    }

    const priceFieldChanged = LINE_PRICE_FIELDS.some((field) => hasOwnBodyField(body, field));
    if (!priceFieldChanged) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (kysely as any)
      .selectFrom(linesTable)
      .select(["quantity", "unit_price", "price_unit"] as never[])
      .where("id" as never, "=", lineId as never)
      .where(fkCol as never, "=", parentId as never);
    if (tenantId) q = q.where("tenant_id" as never, "=", tenantId as never);

    const current = await q.executeTakeFirst() as Record<string, unknown> | undefined;
    if (!current) return;

    patchRow["gross_amount"] = lineGrossAmount(
      hasOwnBodyField(body, "quantity")   ? body["quantity"]   : current["quantity"],
      hasOwnBodyField(body, "unit_price") ? body["unit_price"] : current["unit_price"],
      hasOwnBodyField(body, "price_unit") ? body["price_unit"] : current["price_unit"],
    );
  }

  async function mergePatchLineMetadata(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kysely: Kysely<any>,
    linesTable: `${string}.${string}`,
    fkCol: string,
    parentId: string,
    lineId: string,
    tenantId: string | null,
    patchRow: Record<string, unknown>,
  ): Promise<void> {
    const metadataPatch = patchRow["metadata"];
    if (!metadataPatch || typeof metadataPatch !== "object" || Array.isArray(metadataPatch)) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (kysely as any)
      .selectFrom(linesTable)
      .select(["metadata"] as never[])
      .where("id" as never, "=", lineId as never)
      .where(fkCol as never, "=", parentId as never);
    if (tenantId) q = q.where("tenant_id" as never, "=", tenantId as never);

    const current = await q.executeTakeFirst() as Record<string, unknown> | undefined;
    patchRow["metadata"] = {
      ...asPlainObject(current?.["metadata"]),
      ...(metadataPatch as Record<string, unknown>),
    };
  }

  /** Maps a DocumentLine-shaped request body to the DB column set for the line table. */
  function lineBodyToDb(
    body: Record<string, unknown>,
    fkCol: string,
    parentId: string,
    tenantId: string | null,
  ): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    if (tenantId)                              row["tenant_id"]      = tenantId;
    row[fkCol]                                                       = parentId;
    const directColumns = [
      "line_no",
      "item_description",
      "procurement_type",
      "item_id",
      "commodity_category_id",
      "business_intent_id",
      "uom_code",
      "quantity",
      "unit_price",
      "price_unit",
      "gross_amount",
      "tax_group_id",
      "withholding_tax_group_id",
      "tax_amount",
      "withholding_tax_amount",
      "discount_pct",
      "discount_amount",
      "retention_pct",
      "retention_amount",
      "cost_center_id",
      "profit_center_id",
      "project_id",
      "site_id",
      "match_status",
      "matched_quantity",
      "commitment_line_id",
      "goods_receipt_line_id",
      "ses_line_id",
      "is_asset",
      "asset_category_id",
      // source_binding (jsonb) — written by @athyper/runtime-add-item adapters
      // (catalog / open_po_line / open_receipt_line / open_service_sheet_line
      // / manual_invoice_line). The column was added to
      // document.purchase_invoice_line in DDL 01s_tables_source_binding.sql
      // with a CHECK constraint that gates shape. INSERT only succeeds
      // against line tables that have the column; if a future line entity
      // is wired through the framework but hasn't had the column added,
      // PostgreSQL will reject with "column source_binding does not exist".
      "source_binding",
    ];

    for (const column of directColumns) {
      if (body[column] !== undefined) row[column] = body[column];
    }

    if (body["line_number"] != null)           row["line_no"]        = Number(body["line_number"]);
    if (body["description"]   !== undefined)   row["item_description"] = body["description"] ?? "";
    if (body["unit_code"]     !== undefined)   row["uom_code"]       = body["unit_code"]   ?? "";
    // Framework-side adapters use camelCase (`sourceBinding`); DB column is
    // snake_case. Accept both forms at the boundary so consumers don't have
    // to translate. Shape is validated server-side by the DB CHECK
    // constraint (must be an object with a string `sourceType` field) and
    // client-side by SourceBindingSchema in @athyper/runtime-contracts.
    if (body["sourceBinding"] !== undefined)   row["source_binding"]  = body["sourceBinding"];
    if (body["quantity"]      !== undefined)   row["quantity"]       = body["quantity"]    ?? 1;
    if (body["unit_price"]    !== undefined)   row["unit_price"]     = body["unit_price"]  ?? 0;
    if (body["line_amount"]   !== undefined)   row["gross_amount"]   = body["line_amount"] ?? 0;
    if (body["tax_group_id"]  !== undefined)   row["tax_group_id"]    = body["tax_group_id"] ?? null;
    if (body["withholding_tax_group_id"] !== undefined) row["withholding_tax_group_id"] = body["withholding_tax_group_id"] ?? null;
    if (body["tax_amount"]    !== undefined)   row["tax_amount"]     = body["tax_amount"]  ?? 0;
    if (body["withholding_tax_amount"] !== undefined) row["withholding_tax_amount"] = body["withholding_tax_amount"] ?? 0;
    if (body["discount_pct"]  !== undefined)   row["discount_pct"]   = body["discount_pct"]  ?? 0;
    if (body["discount_amount"] !== undefined) row["discount_amount"] = body["discount_amount"] ?? 0;
    if (hasOwnBodyField(body, "gross_amount") && isEmptyAmountValue(body["gross_amount"])) {
      delete row["gross_amount"];
    }
    if (hasOwnBodyField(body, "line_amount") && isEmptyAmountValue(body["line_amount"])) {
      delete row["gross_amount"];
    }
    // Metadata-backed logical fields have no dedicated DB column.
    const data = body["data"];
    const hasData = data && typeof data === "object" && !Array.isArray(data);
    const metadataAliases = [
      "item_code",
      "tax_code",
      "unspsc_code",
      "hs_code",
      "trade_code",
      "commodity_code",
      "commodity_domain",
      "commodity_domain_code",
      "line_commodity_code",
    ];
    const hasMetaAliases = metadataAliases.some((alias) => body[alias] !== undefined);
    if (hasData || hasMetaAliases) {
      const aliasData = Object.fromEntries(
        metadataAliases
          .filter((alias) => body[alias] !== undefined)
          .map((alias) => [alias, body[alias]]),
      );
      row["metadata"] = {
        ...(hasData ? data as Record<string, unknown> : {}),
        ...aliasData,
      };
    }
    return row;
  }

  /** Normalises a raw DB line row back to the DocumentLine contract shape. */
  function normaliseLineRow(r: Record<string, unknown>, fkCol: string): Record<string, unknown> {
    const meta = (r["metadata"] as Record<string, unknown> | undefined) ?? {};
    return {
      ...r,
      document_id:             r[fkCol]                              ?? r["document_id"],
      line_number:             r["line_no"]                          ?? r["line_number"],
      description:             r["item_description"]                 ?? r["description"],
      unit_code:               r["uom_code"]                         ?? r["unit_code"],
      line_amount:             r["gross_amount"] ?? r["net_amount"]  ?? r["line_amount"],
      net_amount:              r["net_amount"]   ?? null,
      gross_amount:            r["gross_amount"] ?? null,
      item_code:               meta["item_code"] ?? r["item_code"]   ?? null,
      tax_code:                meta["tax_code"]  ?? r["tax_code"]    ?? null,
      unspsc_code:             meta["unspsc_code"] ?? r["unspsc_code"] ?? null,
      hs_code:                 meta["hs_code"] ?? meta["trade_code"] ?? r["hs_code"] ?? null,
      trade_code:              meta["trade_code"] ?? meta["hs_code"] ?? r["trade_code"] ?? null,
      discount_pct:            r["discount_pct"]            ?? null,
      discount_amount:         r["discount_amount"]          ?? null,
      tax_amount:              r["tax_amount"]               ?? null,
      retention_pct:           r["retention_pct"]            ?? null,
      retention_amount:        r["retention_amount"]         ?? null,
      withholding_tax_amount:  r["withholding_tax_amount"]   ?? null,
      // Surface source_binding under both casing conventions: the DB column
      // (snake_case) flows through the `...r` spread above; this entry
      // mirrors it under the camelCase name the framework uses for the
      // SourceBindingSchema shape consumers read on the client.
      sourceBinding:           r["source_binding"]           ?? null,
      data:                    meta,
    };
  }

  function isPurchaseInvoiceLineMutation(table: EntityTableInfo): boolean {
    return table.table_schema === "document" && table.table_name === "purchase_invoice";
  }

  function lineHasSourceDocument(row: Record<string, unknown>): boolean {
    return Boolean(
      row["commitment_line_id"]
      || row["goods_receipt_line_id"]
      || row["ses_line_id"],
    );
  }

  function hasLineClassificationInput(body: Record<string, unknown>): boolean {
    return LINE_CLASSIFICATION_INPUT_FIELDS.some((field) => hasOwnBodyField(body, field));
  }

  async function refreshLineRow(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kysely: Kysely<any>,
    linesTable: `${string}.${string}`,
    fkCol: string,
    parentId: string,
    lineId: string,
    tenantId: string | null,
  ): Promise<Record<string, unknown> | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (kysely as any)
      .selectFrom(linesTable)
      .selectAll()
      .where("id" as never, "=", lineId as never)
      .where(fkCol as never, "=", parentId as never);
    if (tenantId) q = q.where("tenant_id" as never, "=", tenantId as never);
    const row = await q.executeTakeFirst() as Record<string, unknown> | undefined;
    return row ?? null;
  }

  async function maybeClassifyPurchaseInvoiceLine(args: {
    table:       EntityTableInfo;
    linesTable:  `${string}.${string}`;
    fkCol:       string;
    tenantId:    string | null;
    principalId: string | null;
    invoiceId:   string;
    lineId:      string;
    lineRow:     Record<string, unknown>;
    body?:       Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    if (!isPurchaseInvoiceLineMutation(args.table)) return args.lineRow;
    if (!args.tenantId || !args.principalId || !args.lineId) return args.lineRow;
    if (lineHasSourceDocument(args.lineRow)) return args.lineRow;
    if (args.body && !hasLineClassificationInput(args.body)) return args.lineRow;

    try {
      await resolveLineClassification(
        { db, logger },
        {
          tenantId:    args.tenantId,
          principalId: args.principalId,
          invoiceId:   args.invoiceId,
          lineId:      args.lineId,
          mode:        "save",
        },
      );
      return await refreshLineRow(db, args.linesTable, args.fkCol, args.invoiceId, args.lineId, args.tenantId)
        ?? args.lineRow;
    } catch (err) {
      logger?.error("records_purchase_invoice_line_classify_error", {
        err: String(err),
        invoiceId: args.invoiceId,
        lineId: args.lineId,
      });
      return args.lineRow;
    }
  }

  // ── POST /:entity/:id/lines — create a new line ───────────────────────────────
  const createLineHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id         = req.params["id"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      const sub = typeof (claims as { sub?: unknown }).sub === "string"
        ? String((claims as { sub: string }).sub)
        : "";
      const principalId = sub && tenantId
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : sub;

      if (rejectNonConventionalLineMutation(res, entityCode)) return;

      const linesTable = `${table.table_schema}.${table.table_name}_line` as `${string}.${string}`;
      const fkCol      = `${table.table_name}_id`;

      const body = (req.body ?? {}) as Record<string, unknown>;

      // Auto-assign line_no if not supplied (MAX + 1, 1-safe)
      if (body["line_number"] == null) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q: any = db.selectFrom(linesTable).select((eb: any) => eb.fn.max("line_no").as("max_no")).where(fkCol as never, "=", id as never);
          if (tenantId) q = q.where("tenant_id" as never, "=", tenantId as never);
          const row = await q.executeTakeFirst() as { max_no: number | null } | undefined;
          body["line_number"] = (row?.max_no ?? 0) + 1;
        } catch {
          body["line_number"] = 1;
        }
      }

      const insertRow = lineBodyToDb(body, fkCol, id, tenantId);
      // Defaults for NOT NULL columns when creating a blank line.
      // quantity uses falsy-check (not == null) because lineBodyToDb converts null → 0,
      // which would violate the pil_qty_nonzero CHECK constraint.
      const isPurchaseInvoiceLine = isPurchaseInvoiceLineMutation(table);
      const parentHasSourceDocument = isPurchaseInvoiceLine
        ? await purchaseInvoiceHasSourceDocument(db, id, tenantId)
        : false;
      const shouldDefaultStandaloneUom =
        isPurchaseInvoiceLine
        && !isPresentLineValue(insertRow["item_id"])
        && !requestHasLineSourceDocument(body, insertRow)
        && !parentHasSourceDocument;
      const defaultUomCode = shouldDefaultStandaloneUom
        ? await resolveDefaultProcurementLineUom(db, tenantId)
        : null;
      if (!insertRow["item_description"]) insertRow["item_description"] = "";
      if (!insertRow["uom_code"] && defaultUomCode) insertRow["uom_code"] = defaultUomCode;
      if (!insertRow["quantity"])          insertRow["quantity"]         = 1;
      if (insertRow["unit_price"] == null) insertRow["unit_price"]      = 0;
      applyDerivedCreateLineAmounts(insertRow, body);
      insertRow["created_by"] = principalId;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inserted = await (db.insertInto(linesTable) as any)
        .values(insertRow)
        .returningAll()
        .executeTakeFirstOrThrow() as Record<string, unknown>;

      const lineId = typeof inserted["id"] === "string" ? inserted["id"] : "";
      const classified = await maybeClassifyPurchaseInvoiceLine({
        table,
        linesTable,
        fkCol,
        tenantId,
        principalId: principalId || null,
        invoiceId: id,
        lineId,
        lineRow: inserted,
      });

      res.status(201).json(normaliseLineRow(classified, fkCol));
    } catch (err) {
      logger?.error("records_create_line_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH /:entity/:id/lines/:lineId — update a line ─────────────────────────
  const patchLineHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id         = req.params["id"]     as string;
      const lineId     = req.params["lineId"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      const sub = typeof (claims as { sub?: unknown }).sub === "string"
        ? String((claims as { sub: string }).sub)
        : "";
      const principalId = sub && tenantId
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : sub;

      if (rejectNonConventionalLineMutation(res, entityCode)) return;

      const linesTable = `${table.table_schema}.${table.table_name}_line` as `${string}.${string}`;
      const fkCol      = `${table.table_name}_id`;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const patchRow = lineBodyToDb(body, fkCol, id, tenantId);
      // Remove identity columns from patch
      delete patchRow["tenant_id"];
      delete patchRow[fkCol];
      await applyDerivedPatchLineAmounts(db, linesTable, fkCol, id, lineId, tenantId, body, patchRow);
      await mergePatchLineMetadata(db, linesTable, fkCol, id, lineId, tenantId, patchRow);

      if (Object.keys(patchRow).length === 0) {
        res.status(400).json({ error: "EMPTY_PATCH", message: "No updatable fields supplied" });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (db.updateTable(linesTable) as any)
        .set(patchRow)
        .where("id" as never, "=", lineId as never)
        .where(fkCol as never, "=", id as never);
      if (tenantId) q = q.where("tenant_id" as never, "=", tenantId as never);

      const updated = await q.returningAll().executeTakeFirst() as Record<string, unknown> | undefined;
      if (!updated) {
        res.status(404).json({ error: "LINE_NOT_FOUND", message: "Line not found" });
        return;
      }

      const classified = await maybeClassifyPurchaseInvoiceLine({
        table,
        linesTable,
        fkCol,
        tenantId,
        principalId: principalId || null,
        invoiceId: id,
        lineId,
        lineRow: updated,
        body,
      });

      res.json(normaliseLineRow(classified, fkCol));
    } catch (err) {
      logger?.error("records_patch_line_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE /:entity/:id/lines/:lineId — delete a line ────────────────────────
  const deleteLineHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id         = req.params["id"]     as string;
      const lineId     = req.params["lineId"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      if (rejectNonConventionalLineMutation(res, entityCode)) return;

      const linesTable = `${table.table_schema}.${table.table_name}_line` as `${string}.${string}`;
      const fkCol      = `${table.table_name}_id`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (db.deleteFrom(linesTable) as any)
        .where("id" as never, "=", lineId as never)
        .where(fkCol as never, "=", id as never);
      if (tenantId) q = q.where("tenant_id" as never, "=", tenantId as never);

      const deleted = await q.returningAll().executeTakeFirst() as Record<string, unknown> | undefined;
      if (!deleted) {
        res.status(404).json({ error: "LINE_NOT_FOUND", message: "Line not found" });
        return;
      }

      res.status(204).end();
    } catch (err) {
      logger?.error("records_delete_line_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /:entity/:id/lines/:lineId/distributions — create a split ───────────
  const createDistributionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { sub } = claims as { sub: string };

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id        = req.params["id"]     as string;
      const lineId    = req.params["lineId"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND" });
        return;
      }

      if (rejectInvalidUuidParam(res, id, "Record id")) return;
      if (rejectInvalidUuidParam(res, lineId, "Line id")) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      const body = req.body as Record<string, unknown>;

      // Derive source_doc_type from entity_code — for now only purchase_invoice_line is supported
      const sourceDocType = body["source_doc_type"] as string | undefined
        ?? `${entityCode.replace("purchase_invoice", "PURCHASE_INVOICE")}_LINE`.toUpperCase();

      // Next distribution_no for this line
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maxRow = await (db as any)
        .selectFrom("document.accounting_distribution")
        .select((eb: any) => eb.fn.max("distribution_no").as("maxNo"))
        .where("source_line_id", "=", lineId)
        .executeTakeFirst();
      const nextNo = ((maxRow?.maxNo as number | null) ?? 0) + 1;

      const insert: Record<string, unknown> = {
        tenant_id:          tenantId,
        source_doc_type:    sourceDocType,
        source_doc_id:      id,
        source_line_id:     lineId,
        distribution_no:    nextNo,
        distribution_basis: body["distribution_basis"] ?? "PERCENT",
        split_pct:          body["split_pct"]          ?? null,
        split_amount:       body["split_amount"]       ?? null,
        split_quantity:     body["split_quantity"]      ?? null,
        distributed_amount: body["distributed_amount"] ?? 0,
        currency_code:      body["currency_code"]      ?? "USD",
        account_source:     body["account_source"]     ?? "FROM_CATEGORY",
        posting_role_code:  body["posting_role_code"]  ?? null,
        account_code:       body["account_code"]       ?? null,
        gl_account_id:      body["gl_account_id"]      ?? null,
        business_intent_id: body["business_intent_id"] ?? null,
        commodity_category_id:  body["commodity_category_id"]  ?? null,
        cost_center_id:     body["cost_center_id"]     ?? null,
        profit_center_id:   body["profit_center_id"]   ?? null,
        project_id:         body["project_id"]         ?? null,
        site_id:            body["site_id"]            ?? null,
        is_capex:           body["is_capex"]           ?? false,
        asset_class_id:     body["asset_class_id"]     ?? null,
        description:        body["description"]        ?? null,
        created_by:         sub,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [created] = await (db as any)
        .insertInto("document.accounting_distribution")
        .values(insert)
        .returningAll()
        .execute();

      res.status(201).json({ data: created });
    } catch (err) {
      logger?.error("records_distribution_create_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH /:entity/:id/lines/:lineId/distributions/:distId — update a split ──
  const patchDistributionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { sub } = claims as { sub: string };

      const lineId  = req.params["lineId"] as string;
      const distId  = req.params["distId"] as string;

      if (rejectInvalidUuidParam(res, lineId, "Line id")) return;
      if (rejectInvalidUuidParam(res, distId, "Distribution id")) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      const body = req.body as Record<string, unknown>;
      const allowedKeys = [
        "distribution_basis","split_pct","split_amount","split_quantity",
        "distributed_amount","account_source","posting_role_code","account_code",
        "gl_account_id","business_intent_id","commodity_category_id",
        "cost_center_id","profit_center_id","project_id","site_id",
        "is_capex","asset_class_id","description",
      ];
      const patch: Record<string, unknown> = { updated_at: new Date(), updated_by: sub };
      for (const k of allowedKeys) {
        if (k in body) patch[k] = body[k];
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (db as any)
        .updateTable("document.accounting_distribution")
        .set(patch)
        .where("id", "=", distId)
        .where("source_line_id", "=", lineId);
      if (tenantId !== null) q = q.where("tenant_id", "=", tenantId);
      const [updated] = await q.returningAll().execute();

      if (!updated) {
        res.status(404).json({ error: "DISTRIBUTION_NOT_FOUND" });
        return;
      }
      res.json({ data: updated });
    } catch (err) {
      logger?.error("records_distribution_patch_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE /:entity/:id/lines/:lineId/distributions/:distId ──────────────────
  const deleteDistributionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const lineId  = req.params["lineId"] as string;
      const distId  = req.params["distId"] as string;

      if (rejectInvalidUuidParam(res, lineId, "Line id")) return;
      if (rejectInvalidUuidParam(res, distId, "Distribution id")) return;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (db as any)
        .deleteFrom("document.accounting_distribution")
        .where("id", "=", distId)
        .where("source_line_id", "=", lineId);
      if (tenantId !== null) q = q.where("tenant_id", "=", tenantId);
      await q.execute();

      res.status(204).end();
    } catch (err) {
      logger?.error("records_distribution_delete_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /:entity/:id/lines — query convention-based {table_name}_line table ──
  const linesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const id = req.params["id"] as string;

      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      // ── journal_entry: use document.journal_line (non-conventional table name) ──
      // ── payment_entry: use document.payment_entry_allocation ─────────────────
      if (entityCode === "payment_entry") {
        try {
          const peRows = await sql<{
            id: string; line_no: number;
            purchase_invoice_id: string | null;
            invoice_number: string | null; invoice_date: string | null;
            currency_code: string;
            allocated_amount: string;
            discount_amount: string;
            withholding_tax_amount: string;
            advance_recovery_amount: string;
            retention_amount: string;
            net_payment_amount: string;
            base_amount: string | null;
            notes: string | null;
          }>`
            SELECT
              pea.id,
              pea.line_no,
              pea.purchase_invoice_id,
              pi.invoice_number,
              pi.document_date  AS invoice_date,
              pea.currency_code,
              pea.allocated_amount,
              pea.discount_amount,
              pea.withholding_tax_amount,
              pea.advance_recovery_amount,
              pea.retention_amount,
              pea.net_payment_amount,
              pea.base_amount,
              pea.notes
            FROM document.payment_entry_allocation pea
            LEFT JOIN document.purchase_invoice pi
                   ON pi.id = pea.purchase_invoice_id
             WHERE pea.payment_entry_id = ${id}
               AND pea.tenant_id = ${tenantId}
             ORDER BY pea.line_no
          `.execute(db);

          const data = peRows.rows.map((r) => ({
            id:           r.id,
            document_id:  id,
            line_number:  r.line_no,
            description:  r.invoice_number ? `Invoice ${r.invoice_number}` : "On Account",
            item_code:    r.invoice_number ?? null,
            quantity:     null,
            unit_code:    null,
            unit_price:   null,
            line_amount:  Number(r.allocated_amount),
            net_amount:   Number(r.net_payment_amount),
            gross_amount: Number(r.allocated_amount),
            data: {
              purchase_invoice_id:     r.purchase_invoice_id,
              invoice_number:          r.invoice_number,
              invoice_date:            r.invoice_date,
              currency_code:           r.currency_code,
              allocated_amount:        r.allocated_amount,
              discount_amount:         r.discount_amount,
              withholding_tax_amount:  r.withholding_tax_amount,
              advance_recovery_amount: r.advance_recovery_amount,
              retention_amount:        r.retention_amount,
              net_payment_amount:      r.net_payment_amount,
              base_amount:             r.base_amount,
            },
          }));
          res.json({ data });
        } catch (err) {
          logger?.error("pe_lines_error", { err: String(err) });
          res.json({ data: [] });
        }
        return;
      }

      if (entityCode === "journal_entry") {
        try {
          const jeRows = await sql<{
            id: string; line_no: number;
            gl_account_id: string; gl_account_code: string | null; gl_account_name: string | null;
            description: string | null;
            transaction_debit: string; transaction_credit: string;
            base_debit: string; base_credit: string;
            transaction_currency: string | null; base_currency: string | null; exchange_rate: string | null;
            subledger_type: string | null; party_type: string | null; party_id: string | null;
            cost_center_id: string | null; profit_center_id: string | null; project_id: string | null;
            references: unknown;
          }>`
            SELECT jl.id, jl.line_no,
                   jl.gl_account_id,
                   ga.code  AS gl_account_code,
                   ga.name  AS gl_account_name,
                   jl.description,
                   jl.transaction_debit,  jl.transaction_credit,
                   jl.base_debit,         jl.base_credit,
                   jl.transaction_currency,
                   jl.base_currency,
                   jl.exchange_rate,
                   jl.subledger_type, jl.party_type, jl.party_id,
                   jl.cost_center_id, jl.profit_center_id, jl.project_id,
                   COALESCE(
                     jsonb_agg(
                       jsonb_build_object(
                         'id', jlr.id,
                         'ref_type', jlr.ref_type,
                         'ref_doc_type', jlr.ref_doc_type,
                         'ref_doc_id', jlr.ref_doc_id,
                         'ref_doc_line_id', jlr.ref_doc_line_id,
                         'ref_doc_number', jlr.ref_doc_number,
                         'ref_doc_label', jlr.metadata->>'ref_doc_label',
                         'ref_doc_line_label', jlr.metadata->>'ref_doc_line_label',
                         'allocated_amount', jlr.allocated_amount,
                         'currency_code', jlr.currency_code,
                         'description', jlr.description
                       )
                       ORDER BY jlr.created_at, jlr.id
                     ) FILTER (WHERE jlr.id IS NOT NULL),
                     '[]'::jsonb
                   ) AS references
              FROM document.journal_line jl
              LEFT JOIN master.gl_account ga ON ga.id = jl.gl_account_id
              LEFT JOIN document.journal_line_reference jlr
                     ON jlr.tenant_id = jl.tenant_id
                    AND jlr.journal_line_id = jl.id
             WHERE jl.journal_entry_id = ${id}
               AND jl.tenant_id = ${tenantId}
             GROUP BY jl.id, jl.line_no, jl.gl_account_id, ga.code, ga.name,
                      jl.description, jl.transaction_debit, jl.transaction_credit,
                      jl.base_debit, jl.base_credit, jl.transaction_currency,
                      jl.base_currency, jl.exchange_rate,
                      jl.subledger_type, jl.party_type, jl.party_id,
                      jl.cost_center_id, jl.profit_center_id, jl.project_id
             ORDER BY jl.line_no
          `.execute(db);

          const data = jeRows.rows.map((r) => ({
            id:           r.id,
            document_id:  id,
            line_number:  r.line_no,
            description:  r.description ?? "",
            item_code:    r.gl_account_code ?? null,
            quantity:     null,
            unit_code:    null,
            unit_price:   null,
            line_amount:  Math.max(Number(r.transaction_debit), Number(r.transaction_credit)),
            net_amount:   r.transaction_debit,
            gross_amount: r.transaction_credit,
            data: {
              gl_account_id:      r.gl_account_id,
              gl_account_code:    r.gl_account_code,
              gl_account_name:    r.gl_account_name,
              transaction_debit:  r.transaction_debit,
              transaction_credit: r.transaction_credit,
              transaction_currency: r.transaction_currency,
              base_currency:      r.base_currency,
              base_debit:         r.base_debit,
              base_credit:        r.base_credit,
              exchange_rate:      r.exchange_rate,
              subledger_type:     r.subledger_type,
              party_type:         r.party_type,
              party_id:           r.party_id,
              references:         r.references,
              is_debit:           Number(r.transaction_debit) > 0,
            },
          }));
          res.json({ data });
        } catch (err) {
          logger?.error("je_lines_error", { err: String(err) });
          res.json({ data: [] });
        }
        return;
      }

      const linesTable = `${table.table_schema}.${table.table_name}_line` as `${string}.${string}`;
      const fkCol      = `${table.table_name}_id`;

      let rows: Record<string, unknown>[] = [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = db.selectFrom(linesTable).selectAll().where(fkCol as never, "=", id as never);
        if (tenantId !== null) q = q.where("tenant_id" as never, "=", tenantId as never);
        q = q.orderBy("line_no" as never, "asc");
        rows = await q.execute() as Record<string, unknown>[];
      } catch {
        // Lines table may not exist for this entity — return empty gracefully
        rows = [];
      }

      // Normalise DB column names → DocumentLine contract field names
      const data = rows.map((r) => ({
        ...r,
        document_id:       r[fkCol]                             ?? r["document_id"],
        line_number:       r["line_no"]                         ?? r["line_number"],
        description:       r["item_description"]                ?? r["description"],
        unit_code:         r["uom_code"]                        ?? r["unit_code"],
        // line_amount maps to gross_amount (after tax/discount); net_amount is pre-discount/tax
        line_amount:       r["gross_amount"] ?? r["net_amount"] ?? r["line_amount"],
        net_amount:        r["net_amount"]   ?? null,
        gross_amount:      r["gross_amount"] ?? null,
        item_code:         r["item_code"]    ?? null,
        tax_code:          r["tax_code"]     ?? null,
        // Discount
        discount_pct:      r["discount_pct"]    ?? null,
        discount_amount:   r["discount_amount"] ?? null,
        // Tax
        tax_amount:        r["tax_amount"]      ?? null,
        // Retention
        retention_pct:     r["retention_pct"]    ?? null,
        retention_amount:  r["retention_amount"] ?? null,
        // WHT
        withholding_tax_amount: r["withholding_tax_amount"] ?? null,
        data:              r["metadata"]     ?? r["data"]        ?? {},
      }));

      res.json({ data });
    } catch (err) {
      logger?.error("records_lines_error", { err: String(err) });
      next(err);
    }
  };

  // ── Filter-preset handlers ────────────────────────────────────────────────────

  const listPresetsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entity   = String(req.params["entity"] ?? "").trim();
      const xOrg     = (req.headers["x-org"]   as string) ?? "";
      const xRealm   = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "Tenant not found" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : SYSTEM_PRINCIPAL_UUID;

      type PresetRow = {
        id: string; name: string; filters: unknown;
        is_shared: boolean; created_at: string; updated_at: string;
      };
      const rows = await (db
        .selectFrom("master.filter_preset as fp" as never)
        .select([
          "fp.id" as never, "fp.name" as never, "fp.filters" as never,
          "fp.is_shared" as never, "fp.created_at" as never, "fp.updated_at" as never,
          "fp.principal_id" as never,
        ])
        .where("fp.tenant_id"   as never, "=", tenantId   as never)
        .where("fp.entity_code" as never, "=", entity     as never)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where((eb: any) => eb.or([
          eb("fp.principal_id" as never, "=", principalId as never),
          eb("fp.is_shared"    as never, "=", true        as never),
        ]))
        .orderBy("fp.name" as never, "asc")
        .execute() as Promise<(PresetRow & { principal_id: string })[]>);

      res.json({
        ok: true,
        data: rows.map((r) => ({
          id:        r.id,
          name:      r.name,
          filters:   r.filters,
          isShared:  r.is_shared,
          isOwn:     r.principal_id === principalId,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      });
    } catch (err) {
      logger?.error("records_filter_presets_list_error", { err: String(err) });
      next(err);
    }
  };

  const createPresetHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entity   = String(req.params["entity"] ?? "").trim();
      const body     = req.body as { name?: string; filters?: unknown; is_shared?: boolean } | undefined;
      const name     = (body?.name ?? "").trim();
      const filters  = body?.filters ?? {};
      const isShared = body?.is_shared === true;

      if (!name) { res.status(400).json({ error: "name is required" }); return; }

      const xOrg     = (req.headers["x-org"]   as string) ?? "";
      const xRealm   = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "Tenant not found" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : SYSTEM_PRINCIPAL_UUID;

      const now = new Date().toISOString();
      const id  = crypto.randomUUID();

      await (db
        .insertInto("master.filter_preset" as never)
        .values({
          id, tenant_id: tenantId, principal_id: principalId,
          entity_code: entity, name,
          filters: JSON.stringify(filters),
          is_shared: isShared,
          created_at: now, updated_at: now,
          created_by: principalId, updated_by: principalId,
        } as never)
        .onConflict((oc) =>
          (oc as any).columns(["tenant_id", "principal_id", "entity_code", "name"]).doUpdateSet({
            filters:    JSON.stringify(filters),
            is_shared:  isShared,
            updated_at: now,
            updated_by: principalId,
          })
        )
        .execute() as Promise<unknown>);

      res.status(201).json({ ok: true, data: { id, name, filters, isShared } });
    } catch (err) {
      logger?.error("records_filter_presets_create_error", { err: String(err) });
      next(err);
    }
  };

  const deletePresetHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entity   = String(req.params["entity"]   ?? "").trim();
      const presetId = String(req.params["presetId"] ?? "").trim();

      const xOrg     = (req.headers["x-org"]   as string) ?? "";
      const xRealm   = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "Tenant not found" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : SYSTEM_PRINCIPAL_UUID;

      // Only the owner can delete (even if shared)
      await (db
        .deleteFrom("master.filter_preset" as never)
        .where("id" as never,           "=", presetId    as never)
        .where("tenant_id" as never,    "=", tenantId    as never)
        .where("entity_code" as never,  "=", entity      as never)
        .where("principal_id" as never, "=", principalId as never)
        .execute() as Promise<unknown>);

      res.status(204).end();
    } catch (err) {
      logger?.error("records_filter_presets_delete_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /:entity/:id/lock — acquire edit-session lock ───────────────────────
  const acquireLockHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;
      if (!UUID_RE.test(recordId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const table = await resolveEntityTable(db, entityCode);
      if (!table) { res.status(404).json({ error: "ENTITY_NOT_FOUND" }); return; }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
      if (!principalId) { res.status(403).json({ error: "FORBIDDEN" }); return; }

      const body      = (req.body ?? {}) as Record<string, unknown>;
      const sessionId = typeof body["session_id"] === "string" ? body["session_id"] : undefined;

      const lockSnap  = cache
        ? await resolveParameterSnapshot(db, cache, tenantId, "jobs.editlock").catch(() => null)
        : null;
      const defaultLockTtl = getIntParam(lockSnap, "jobs.editlock.default_ttl_seconds", DEFAULT_LOCK_TTL_SECONDS);
      const policy    = resolveConcurrencyPolicy(table.concurrency_policy, { lockTtlSeconds: defaultLockTtl });
      const ttl       = policy.lockTtlSeconds;

      const result = await acquireLock(db, { tenantId, entityName: entityCode, recordId, lockedBy: principalId, sessionId, ttlSeconds: ttl });

      if (!result.acquired) {
        res.status(423).json({ error: "LOCKED", locked_by: result.lockedBy, is_locked_by_self: result.isLockedBySelf, expires_at: result.expiresAt });
        return;
      }

      // Fetch current row_version so client can store it alongside the lock token
      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rec = await (db.selectFrom(fullTable) as any)
        .select(["row_version"])
        .where("id", "=", recordId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst() as { row_version?: number } | undefined;

      res.json({ ok: true, lock_token: result.lockToken, expires_at: result.expiresAt, row_version: rec?.row_version ?? null });
    } catch (err) {
      logger?.error("records_lock_acquire_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /:entity/:id/lock — read current lock state ──────────────────────────
  const getLockHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;
      if (!UUID_RE.test(recordId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const status = await getLockStatus(db, { tenantId, entityName: entityCode, recordId });
      res.json(status);
    } catch (err) {
      logger?.error("records_lock_get_error", { err: String(err) });
      next(err);
    }
  };

  // ── PUT /:entity/:id/lock/heartbeat — renew lock TTL ────────────────────────
  const renewLockHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;
      if (!UUID_RE.test(recordId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
      if (!principalId) { res.status(403).json({ error: "FORBIDDEN" }); return; }

      const body      = (req.body ?? {}) as Record<string, unknown>;
      const lockToken = typeof body["lock_token"] === "string" ? body["lock_token"] : "";
      if (!lockToken) { res.status(400).json({ error: "MISSING_LOCK_TOKEN" }); return; }

      const result = await renewLock(db, { tenantId, entityName: entityCode, recordId, lockedBy: principalId, lockToken });
      if (!result.renewed) {
        const status = result.reason === "expired" ? 410 : 423;
        res.status(status).json({ error: result.reason === "expired" ? "LOCK_EXPIRED" : "LOCK_INVALID", reason: result.reason });
        return;
      }
      res.json({ ok: true, expires_at: result.expiresAt });
    } catch (err) {
      logger?.error("records_lock_renew_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE /:entity/:id/lock — release lock ──────────────────────────────────
  const releaseLockHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;
      if (!UUID_RE.test(recordId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
      if (!principalId) { res.status(403).json({ error: "FORBIDDEN" }); return; }

      const body      = (req.body ?? {}) as Record<string, unknown>;
      const lockToken = typeof body["lock_token"] === "string" ? body["lock_token"] : "";
      if (!lockToken) { res.status(400).json({ error: "MISSING_LOCK_TOKEN" }); return; }

      await releaseLock(db, { tenantId, entityName: entityCode, recordId, lockedBy: principalId, lockToken });
      res.status(204).end();
    } catch (err) {
      logger?.error("records_lock_release_error", { err: String(err) });
      next(err);
    }
  };

  // ── DELETE /:entity/:id/lock/force — admin force-release ─────────────────────
  const forceReleaseLockHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const recordId   = req.params["id"] as string;
      if (!UUID_RE.test(recordId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      // Permission gate — caller must have records.lock.force_release
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) : null;
      if (!principalId) {
        res.status(403).json({ error: "FORBIDDEN", message: "principal_not_found" });
        return;
      }

      const permissionCheck = await checkPermission(db, tenantId, principalId, "records.lock.force_release");
      if (!requireAllow(permissionCheck, res)) return;

      await forceReleaseLock(db, { tenantId, entityName: entityCode, recordId });
      res.status(204).end();
    } catch (err) {
      logger?.error("records_lock_force_release_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/records/:entity", listHandler);
  router.get("/records/:entity/_debug", debugHandler);
  // Sub-resource routes must be registered before /:id to avoid shadowing
  router.get("/records/:entity/:id/lines",                                      linesHandler);
  router.post("/records/:entity/:id/lines",                                     createLineHandler);
  router.patch("/records/:entity/:id/lines/:lineId",                            patchLineHandler);
  router.delete("/records/:entity/:id/lines/:lineId",                           deleteLineHandler);
  router.get("/records/:entity/:id/lines/:lineId/distributions",                lineDistributionsHandler);
  router.post("/records/:entity/:id/lines/:lineId/distributions",               createDistributionHandler);
  router.patch("/records/:entity/:id/lines/:lineId/distributions/:distId",      patchDistributionHandler);
  router.delete("/records/:entity/:id/lines/:lineId/distributions/:distId",     deleteDistributionHandler);
  router.get("/records/:entity/filter-presets",            listPresetsHandler);
  router.post("/records/:entity/filter-presets",           createPresetHandler);
  router.delete("/records/:entity/filter-presets/:presetId", deletePresetHandler);
  // versions route is registered in index.ts via createVersionsRoute
  router.get("/records/:entity/:id/workflow",           workflowHandler);
  router.get("/records/:entity/:id/attachments",        subResourceStub("attachments"));
  router.get("/records/:entity/:id/distributions",      distributionsHandler);
  router.get("/records/:entity/:id/approvals",          approvalsHandler);
  router.post("/records/:entity/:id/approvals",         addApproverHandler);
  router.get("/records/:entity/:id/tasks",              subResourceStub("tasks"));
  router.get("/records/:entity/:id/watchers",           subResourceStub("watchers"));
  router.get("/records/:entity/:id/rules",              subResourceStub("rules"));
  router.get("/records/:entity/:id/integration-events", subResourceStub("integration-events"));
  router.get("/records/:entity/:id/quality",            subResourceStub("quality"));
  router.get("/records/:entity/:id/reports",            subResourceStub("reports"));
  // Lock routes — must be registered before /:id to avoid shadowing
  router.post("/records/:entity/:id/lock",            acquireLockHandler);
  router.get("/records/:entity/:id/lock",             getLockHandler);
  router.put("/records/:entity/:id/lock/heartbeat",   renewLockHandler);
  router.delete("/records/:entity/:id/lock/force",    forceReleaseLockHandler);
  router.delete("/records/:entity/:id/lock",          releaseLockHandler);

  router.get("/records/:entity/:id/edit-context",   editContextHandler);
  router.patch("/records/:entity/:id/edit-session", editSessionHandler);
  router.get("/records/:entity/:id/stream",         recordStreamHandler);

  router.get("/records/:entity/:id", getHandler);
  router.post("/records/:entity", createHandler);
  router.put("/records/:entity/:id", updateHandler);
  router.patch("/records/:entity/:id", patchHandler);
  router.delete("/records/:entity/:id", deleteHandler);

  return router;
}
