/**
 * Document Lines Runtime Resolver
 *
 * Single service that resolves a docType slug into a fully normalized
 * runtime contract for line-item CRUD.  Meta-first with registry fallback.
 *
 * Routes never query meta tables directly — they receive a resolved definition.
 */

import { sql, type Kysely } from "kysely";

import { resolveEntityMeta, type EntityTableMeta } from "@/lib/entity-meta";

// ============================================================================
// Public types — the resolved runtime contract
// ============================================================================

/** Identity of a resolved entity */
export interface ResolvedEntityIdentity {
  entityName: string;
  tableSchema: string;
  tableName: string;
  /** Fully qualified: "schema.table" */
  qualifiedTable: string;
}

/** A single column in the SELECT projection */
export interface ProjectedColumn {
  columnName: string;
  alias: string;
  dataType: string;
  /** SQL cast expression for SELECT (e.g. "::text" for decimal/uuid) */
  selectCast: string;
}

/** A single column in the INSERT/UPDATE write set */
export interface WritableColumn {
  columnName: string;
  alias: string;
  dataType: string;
  isRequired: boolean;
  /** SQL cast expression for INSERT values (e.g. "::numeric", "::uuid") */
  insertCast: string;
  /** If true, this column can only be set on initial creation, not subsequent updates */
  writeOnce: boolean;
}

/** Default source JOIN descriptor */
export interface DefaultSource {
  sourceEntity: string;
  joinClause: string;
  fields: Array<{
    selectExpr: string;
    alias: string;
  }>;
}

/** Collection configuration */
export interface CollectionConfig {
  role: string;
  ownership: "owned" | "linked";
  deleteMode: "cascade" | "restrict" | "detach";
  ordering: boolean;
  orderField: string;
}

/** The fully resolved runtime definition */
export interface DocumentLineRuntimeDefinition {
  parent: ResolvedEntityIdentity;
  child: ResolvedEntityIdentity & {
    fkColumn: string;
    fkAlias: string;
  };
  collection: CollectionConfig;
  selectColumns: ProjectedColumn[];
  writableColumns: WritableColumn[];
  systemColumns: string[];
  defaults: { sources: DefaultSource[] };
  resolvedFrom: "meta" | "registry_fallback";
  diagnostics: string[];
}

// ============================================================================
// Resolution cache — caches the composed definition, not raw queries
// ============================================================================

interface DefinitionCacheEntry {
  def: DocumentLineRuntimeDefinition;
  expiresAt: number;
}

const DEFINITION_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const definitionCache = new Map<string, DefinitionCacheEntry>();

export function invalidateDocLineCache(): void {
  definitionCache.clear();
}

// ============================================================================
// SQL identifier safety — validates all identifiers before they enter sql.raw()
// ============================================================================

/** Strict PostgreSQL identifier pattern: letters, digits, underscores only */
const SAFE_IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Schema-qualified identifier: "schema.table" */
const SAFE_QUALIFIED_RE = /^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Whitelist of allowed SQL cast suffixes */
const SAFE_CAST_VALUES = new Set(["", "::text", "::numeric", "::uuid", "::jsonb"]);

function assertSafeIdentifier(value: string, context: string): void {
  if (!SAFE_IDENTIFIER_RE.test(value)) {
    throw new Error(
      `[doc-lines-runtime] Unsafe SQL identifier in ${context}: "${value}"`,
    );
  }
}

function assertSafeQualifiedTable(value: string, context: string): void {
  if (!SAFE_QUALIFIED_RE.test(value)) {
    throw new Error(
      `[doc-lines-runtime] Unsafe qualified table name in ${context}: "${value}"`,
    );
  }
}

function assertSafeCast(value: string, context: string): void {
  if (!SAFE_CAST_VALUES.has(value)) {
    throw new Error(
      `[doc-lines-runtime] Unsafe SQL cast in ${context}: "${value}"`,
    );
  }
}

/**
 * Validates every identifier in a resolved definition before it can reach sql.raw().
 * Called once after resolution, before caching.
 */
function validateDefinitionIdentifiers(
  def: DocumentLineRuntimeDefinition,
): void {
  assertSafeQualifiedTable(def.parent.qualifiedTable, "parent.qualifiedTable");
  assertSafeIdentifier(def.parent.tableSchema, "parent.tableSchema");
  assertSafeIdentifier(def.parent.tableName, "parent.tableName");

  assertSafeQualifiedTable(def.child.qualifiedTable, "child.qualifiedTable");
  assertSafeIdentifier(def.child.tableSchema, "child.tableSchema");
  assertSafeIdentifier(def.child.tableName, "child.tableName");
  assertSafeIdentifier(def.child.fkColumn, "child.fkColumn");
  assertSafeIdentifier(def.child.fkAlias, "child.fkAlias");

  assertSafeIdentifier(def.collection.orderField, "collection.orderField");

  for (const col of def.selectColumns) {
    assertSafeIdentifier(col.columnName, `selectColumn[${col.alias}].columnName`);
    assertSafeIdentifier(col.alias, `selectColumn[${col.alias}].alias`);
    assertSafeCast(col.selectCast, `selectColumn[${col.alias}].selectCast`);
  }

  for (const col of def.writableColumns) {
    assertSafeIdentifier(col.columnName, `writableColumn[${col.alias}].columnName`);
    assertSafeIdentifier(col.alias, `writableColumn[${col.alias}].alias`);
    assertSafeCast(col.insertCast, `writableColumn[${col.alias}].insertCast`);
  }

  for (const col of def.systemColumns) {
    assertSafeIdentifier(col, `systemColumn[${col}]`);
  }
}

// ============================================================================
// Diagnostics observability — counters for monitoring seed debt
// ============================================================================

interface ResolutionCounters {
  metaSuccess: number;
  registryFallback: number;
  notFound: number;
  identifierValidationFailed: number;
  /** Tracks per-slug fallback reasons for operational monitoring */
  fallbackReasons: Map<string, string>;
}

const counters: ResolutionCounters = {
  metaSuccess: 0,
  registryFallback: 0,
  notFound: 0,
  identifierValidationFailed: 0,
  fallbackReasons: new Map(),
};

/** Expose counters for operational monitoring / health checks */
export function getResolutionCounters(): Readonly<Omit<ResolutionCounters, "fallbackReasons"> & { fallbackReasons: Record<string, string> }> {
  return {
    metaSuccess: counters.metaSuccess,
    registryFallback: counters.registryFallback,
    notFound: counters.notFound,
    identifierValidationFailed: counters.identifierValidationFailed,
    fallbackReasons: Object.fromEntries(counters.fallbackReasons),
  };
}

// ============================================================================
// Main resolver
// ============================================================================

export async function resolveDocumentLineRuntime(
  db: Kysely<any>,
  tenantId: string,
  docTypeSlug: string,
): Promise<DocumentLineRuntimeDefinition | null> {
  // ── Cache check ──
  const cacheKey = `${tenantId}:${docTypeSlug}`;
  const cached = definitionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.def;

  const diagnostics: string[] = [];

  // ── Step 1: Resolve parent entity ──
  const parentMeta = await resolveEntityMeta(db, docTypeSlug, tenantId);
  if (!parentMeta) {
    // Not registered in meta at all — try registry fallback directly
    diagnostics.push(`parent entity not found for slug '${docTypeSlug}'`);
    return tryRegistryFallback(docTypeSlug, diagnostics);
  }

  // ── Step 2: Find primary collection field ──
  const collectionResult = await findPrimaryCollection(db, tenantId, parentMeta.entityName);
  if (!collectionResult.collection) {
    diagnostics.push(collectionResult.reason);
    return tryRegistryFallback(docTypeSlug, diagnostics);
  }
  const collection = collectionResult.collection;

  // ── Step 3: Resolve child entity ──
  const childMeta = await resolveEntityMeta(
    db,
    collection.childEntityName,
    tenantId,
  );
  if (!childMeta) {
    diagnostics.push(
      `child entity '${collection.childEntityName}' not registered in meta.entity`,
    );
    return tryRegistryFallback(docTypeSlug, diagnostics);
  }

  // ── Step 4: Load child field dictionary ──
  const childFields = await getPublishedFields(
    db,
    tenantId,
    childMeta.entityName,
  );
  if (childFields.length === 0) {
    diagnostics.push(
      `no published field dictionary for child entity ${childMeta.entityName}`,
    );
    return tryRegistryFallback(docTypeSlug, diagnostics);
  }

  // ── Step 5: Classify fields into projection categories ──
  const { selectColumns, writableColumns, systemColumns } = classifyFields(
    childFields,
    collection.fkColumn,
  );

  if (selectColumns.length === 0) {
    diagnostics.push(
      `field classification produced zero readable columns for ${childMeta.entityName}`,
    );
    return tryRegistryFallback(docTypeSlug, diagnostics);
  }

  // ── Step 6: Build defaults strategy ──
  const defaults = buildDefaultsSources(parentMeta);

  const def: DocumentLineRuntimeDefinition = {
    parent: {
      entityName: parentMeta.entityName,
      tableSchema: parentMeta.tableSchema,
      tableName: parentMeta.tableName,
      qualifiedTable: `${parentMeta.tableSchema}.${parentMeta.tableName}`,
    },
    child: {
      entityName: childMeta.entityName,
      tableSchema: childMeta.tableSchema,
      tableName: childMeta.tableName,
      qualifiedTable: `${childMeta.tableSchema}.${childMeta.tableName}`,
      fkColumn: collection.fkColumn,
      fkAlias: snakeToCamel(collection.fkColumn),
    },
    collection: {
      role: collection.role,
      ownership: collection.ownership,
      deleteMode: collection.deleteMode,
      ordering: collection.ordering,
      orderField: collection.orderField,
    },
    selectColumns,
    writableColumns,
    systemColumns,
    defaults,
    resolvedFrom: "meta",
    diagnostics,
  };

  // ── Step 7: Validate all identifiers before caching ──
  try {
    validateDefinitionIdentifiers(def);
  } catch (validationErr) {
    counters.identifierValidationFailed++;
    diagnostics.push(
      `identifier validation failed: ${validationErr instanceof Error ? validationErr.message : String(validationErr)}`,
    );
    console.error(
      `[doc-lines-runtime] SECURITY: Identifier validation failed for '${docTypeSlug}', falling back to registry.`,
      validationErr,
    );
    return tryRegistryFallback(docTypeSlug, diagnostics);
  }

  counters.metaSuccess++;

  definitionCache.set(cacheKey, {
    def,
    expiresAt: Date.now() + DEFINITION_CACHE_TTL_MS,
  });
  return def;
}

// ============================================================================
// Meta queries
// ============================================================================

interface CollectionFieldRow {
  childEntityName: string;
  fkColumn: string;
  role: string;
  ownership: "owned" | "linked";
  deleteMode: "cascade" | "restrict" | "detach";
  ordering: boolean;
  orderField: string;
}

interface CollectionLookupResult {
  collection: CollectionFieldRow | null;
  reason: string;
}

/**
 * Find the primary line-item collection on a parent entity.
 *
 * Refinement A:
 *  - Prefer collection_behavior.role = 'document_lines' when present
 *  - Otherwise allow single unambiguous cardinality='many' field
 *  - If multiple many-collections and no role, return null with diagnostic
 */
async function findPrimaryCollection(
  db: Kysely<any>,
  tenantId: string,
  parentEntityName: string,
): Promise<CollectionLookupResult> {
  const rows = await sql<{
    child_entity_name: string;
    child_fk_field: string;
    collection_behavior: Record<string, unknown> | null;
  }>`
    SELECT f.child_entity_name, f.child_fk_field, f.collection_behavior
    FROM meta.field f
    JOIN meta.entity_version ev ON ev.id = f.entity_version_id AND ev.tenant_id = f.tenant_id
    JOIN meta.entity e ON e.id = ev.entity_id AND e.tenant_id = ev.tenant_id
    WHERE e.tenant_id = ${tenantId}
      AND e.name = ${parentEntityName}
      AND e.is_active = true
      AND ev.status = 'published'
      AND f.cardinality = 'many'
      AND f.child_entity_name IS NOT NULL
      AND f.child_fk_field IS NOT NULL
    ORDER BY f.sort_order
  `.execute(db);

  if (rows.rows.length === 0) {
    return {
      collection: null,
      reason: `no cardinality='many' collection field found on ${parentEntityName}`,
    };
  }

  // Prefer explicit role = 'document_lines'
  const withRole = rows.rows.find(
    (r) => r.collection_behavior && (r.collection_behavior as any).role === "document_lines",
  );
  if (withRole) return { collection: parseCollectionRow(withRole), reason: "" };

  // Fallback: single unambiguous collection
  if (rows.rows.length === 1) return { collection: parseCollectionRow(rows.rows[0]), reason: "" };

  // Ambiguous — multiple collections, no role discriminator
  const childNames = rows.rows.map((r) => r.child_entity_name).join(", ");
  return {
    collection: null,
    reason: `ambiguous: ${parentEntityName} has ${rows.rows.length} many-collections [${childNames}] but none has collection_behavior.role = 'document_lines' — add a role marker to disambiguate`,
  };
}

function parseCollectionRow(row: {
  child_entity_name: string;
  child_fk_field: string;
  collection_behavior: Record<string, unknown> | null;
}): CollectionFieldRow {
  const cb = row.collection_behavior ?? {};
  return {
    childEntityName: row.child_entity_name,
    fkColumn: row.child_fk_field,
    role: (cb as any).role ?? "document_lines",
    ownership: ((cb as any).ownership as "owned" | "linked") ?? "owned",
    deleteMode:
      ((cb as any).deleteMode as "cascade" | "restrict" | "detach") ?? "cascade",
    ordering: (cb as any).ordering ?? true,
    orderField: ((cb as any).orderField as string) ?? "line_no",
  };
}

// ============================================================================
// Child field dictionary
// ============================================================================

interface MetaFieldRow {
  name: string;
  columnName: string;
  dataType: string;
  origin: string;
  isReadOnly: boolean;
  isComputed: boolean;
  writeOnce: boolean;
  isRequired: boolean;
  sortOrder: number;
}

async function getPublishedFields(
  db: Kysely<any>,
  tenantId: string,
  entityName: string,
): Promise<MetaFieldRow[]> {
  const result = await sql<{
    name: string;
    column_name: string;
    data_type: string;
    origin: string;
    is_read_only: boolean;
    is_computed: boolean;
    write_once: boolean;
    is_required: boolean;
    sort_order: number;
  }>`
    SELECT f.name, f.column_name, f.data_type, f.origin,
           f.is_read_only, f.is_computed, f.write_once, f.is_required,
           f.sort_order
    FROM meta.field f
    JOIN meta.entity_version ev ON ev.id = f.entity_version_id AND ev.tenant_id = f.tenant_id
    JOIN meta.entity e ON e.id = ev.entity_id AND e.tenant_id = ev.tenant_id
    WHERE e.tenant_id = ${tenantId}
      AND e.name = ${entityName}
      AND e.is_active = true
      AND ev.status = 'published'
      AND f.cardinality = 'one'
    ORDER BY f.sort_order, f.name
  `.execute(db);

  return result.rows.map((r) => ({
    name: r.name,
    columnName: r.column_name,
    dataType: r.data_type,
    origin: r.origin,
    isReadOnly: r.is_read_only,
    isComputed: r.is_computed,
    writeOnce: r.write_once,
    isRequired: r.is_required,
    sortOrder: r.sort_order,
  }));
}

// ============================================================================
// Field classification — projection policy
// ============================================================================

/** Columns that are always system-managed and never exposed in API payloads */
const SYSTEM_COLUMN_NAMES = new Set([
  "id",
  "tenant_id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
]);

/** Columns exposed in GET but as system identity, not user data */
const IDENTITY_COLUMNS = new Set(["id"]);

/** Data type → SELECT cast (decimal/uuid → ::text for MC-4 compliance) */
function selectCastFor(dataType: string): string {
  switch (dataType) {
    case "decimal":
    case "number":
      return "::text";
    case "uuid":
    case "reference":
      return "::text";
    default:
      return "";
  }
}

/** Data type → INSERT cast */
function insertCastFor(dataType: string): string {
  switch (dataType) {
    case "decimal":
    case "number":
      return "::numeric";
    case "uuid":
    case "reference":
      return "::uuid";
    case "jsonb":
    case "json":
      return "::jsonb";
    default:
      return "";
  }
}

function classifyFields(
  fields: MetaFieldRow[],
  fkColumn: string,
): {
  selectColumns: ProjectedColumn[];
  writableColumns: WritableColumn[];
  systemColumns: string[];
} {
  const selectColumns: ProjectedColumn[] = [];
  const writableColumns: WritableColumn[] = [];
  const systemColumns: string[] = [];

  // Always include id in select projection (identity)
  selectColumns.push({
    columnName: "id",
    alias: "id",
    dataType: "uuid",
    selectCast: "::text",
  });

  // Always include the FK column in select projection
  selectColumns.push({
    columnName: fkColumn,
    alias: snakeToCamel(fkColumn),
    dataType: "uuid",
    selectCast: "::text",
  });

  for (const f of fields) {
    const col = f.columnName;

    // ── System columns: never exposed ──
    if (SYSTEM_COLUMN_NAMES.has(col) || col === fkColumn) {
      if (!IDENTITY_COLUMNS.has(col) && col !== fkColumn) {
        systemColumns.push(col);
      }
      continue;
    }

    // ── Internal-hidden: system-origin computed fields ──
    if (f.origin === "system" && f.isComputed) {
      systemColumns.push(col);
      continue;
    }

    const alias = f.name.includes("_") ? snakeToCamel(f.name) : f.name;

    // ── Readable: exposed in GET ──
    selectColumns.push({
      columnName: col,
      alias,
      dataType: f.dataType,
      selectCast: selectCastFor(f.dataType),
    });

    // ── Writable: NOT read-only, NOT computed, NOT system ──
    if (!f.isReadOnly && !f.isComputed && f.origin !== "system") {
      writableColumns.push({
        columnName: col,
        alias,
        dataType: f.dataType,
        isRequired: f.isRequired,
        insertCast: insertCastFor(f.dataType),
        writeOnce: f.writeOnce,
      });
    }
  }

  return { selectColumns, writableColumns, systemColumns };
}

// ============================================================================
// Defaults — meta discovery (Layer 1 & 2 only)
// ============================================================================

/**
 * Build defaults sources from known patterns on the parent entity.
 * This is a static mapping today — Phase 2 will resolve from meta.relation.
 */
function buildDefaultsSources(
  parentMeta: EntityTableMeta,
): { sources: DefaultSource[] } {
  const sources: DefaultSource[] = [];
  const pt = `${parentMeta.tableSchema}.${parentMeta.tableName}`;

  // Pattern: parent has spend_category_id → SpendCategory has default_gl_account, default_tax_code
  // We only add these for known finance document tables that have spend_category_id
  const hasSpendCategory = [
    "fin.purchase_invoice",
  ].includes(pt);

  if (hasSpendCategory) {
    sources.push({
      sourceEntity: "SpendCategory",
      joinClause:
        "left join fin.spend_category sc on sc.id = d.spend_category_id and sc.tenant_id = d.tenant_id",
      fields: [
        { selectExpr: 'sc.default_gl_account', alias: "accountId" },
        { selectExpr: 'sc.default_tax_code', alias: "taxCode" },
      ],
    });
  }

  // Pattern: parent has ou_id → OperatingUnit has default_cost_center_id, etc.
  // NOTE: ent.operating_unit does not yet exist in the database.
  // Re-enable this block once the ent schema and operating_unit table are created.
  // const hasOU = ["fin.purchase_invoice", "fin.credit_note", "fin.debit_note"].includes(pt);
  // if (hasOU) { ... }

  return { sources };
}

// ============================================================================
// Registry fallback (Phase 1 bridge)
// ============================================================================

/**
 * Static registry — replaces _registry.ts.
 * Kept as fallback when meta data is incomplete.
 * Each entry must provide the full runtime contract.
 */
const STATIC_REGISTRY: Record<
  string,
  Omit<DocumentLineRuntimeDefinition, "resolvedFrom" | "diagnostics">
> = {
  "purchase-invoices": {
    parent: {
      entityName: "PurchaseInvoice",
      tableSchema: "fin",
      tableName: "purchase_invoice",
      qualifiedTable: "fin.purchase_invoice",
    },
    child: {
      entityName: "PurchaseInvoiceLine",
      tableSchema: "fin",
      tableName: "purchase_invoice_line",
      qualifiedTable: "fin.purchase_invoice_line",
      fkColumn: "invoice_id",
      fkAlias: "invoiceId",
    },
    collection: {
      role: "document_lines",
      ownership: "owned",
      deleteMode: "cascade",
      ordering: true,
      orderField: "line_no",
    },
    selectColumns: [
      { columnName: "id", alias: "id", dataType: "uuid", selectCast: "::text" },
      { columnName: "invoice_id", alias: "invoiceId", dataType: "uuid", selectCast: "::text" },
      { columnName: "line_no", alias: "lineNo", dataType: "integer", selectCast: "" },
      { columnName: "description", alias: "description", dataType: "string", selectCast: "" },
      { columnName: "item_id", alias: "itemId", dataType: "uuid", selectCast: "::text" },
      { columnName: "warehouse_id", alias: "warehouseId", dataType: "uuid", selectCast: "::text" },
      { columnName: "quantity", alias: "quantity", dataType: "decimal", selectCast: "::text" },
      { columnName: "uom", alias: "uom", dataType: "string", selectCast: "" },
      { columnName: "unit_price", alias: "unitPrice", dataType: "decimal", selectCast: "::text" },
      { columnName: "amount", alias: "amount", dataType: "decimal", selectCast: "::text" },
      { columnName: "tax_code", alias: "taxCode", dataType: "string", selectCast: "" },
      { columnName: "tax_rate", alias: "taxRate", dataType: "decimal", selectCast: "::text" },
      { columnName: "tax_amount", alias: "taxAmount", dataType: "decimal", selectCast: "::text" },
      { columnName: "tax_inclusive", alias: "taxInclusive", dataType: "boolean", selectCast: "" },
      { columnName: "account_id", alias: "accountId", dataType: "uuid", selectCast: "::text" },
      { columnName: "cost_center_id", alias: "costCenterId", dataType: "uuid", selectCast: "::text" },
      { columnName: "profit_center_id", alias: "profitCenterId", dataType: "uuid", selectCast: "::text" },
      { columnName: "fp_id", alias: "fpId", dataType: "uuid", selectCast: "::text" },
      { columnName: "asset_id", alias: "assetId", dataType: "uuid", selectCast: "::text" },
      { columnName: "inventory_movement_id", alias: "inventoryMovementId", dataType: "uuid", selectCast: "::text" },
    ],
    writableColumns: [
      { columnName: "description", alias: "description", dataType: "string", isRequired: true, insertCast: "", writeOnce: false },
      { columnName: "item_id", alias: "itemId", dataType: "uuid", isRequired: false, insertCast: "::uuid", writeOnce: false },
      { columnName: "warehouse_id", alias: "warehouseId", dataType: "uuid", isRequired: false, insertCast: "::uuid", writeOnce: false },
      { columnName: "quantity", alias: "quantity", dataType: "decimal", isRequired: true, insertCast: "::numeric", writeOnce: false },
      { columnName: "uom", alias: "uom", dataType: "string", isRequired: false, insertCast: "", writeOnce: false },
      { columnName: "unit_price", alias: "unitPrice", dataType: "decimal", isRequired: true, insertCast: "::numeric", writeOnce: false },
      { columnName: "amount", alias: "amount", dataType: "decimal", isRequired: true, insertCast: "::numeric", writeOnce: false },
      { columnName: "tax_code", alias: "taxCode", dataType: "string", isRequired: false, insertCast: "", writeOnce: false },
      { columnName: "tax_rate", alias: "taxRate", dataType: "decimal", isRequired: false, insertCast: "::numeric", writeOnce: false },
      { columnName: "tax_amount", alias: "taxAmount", dataType: "decimal", isRequired: false, insertCast: "::numeric", writeOnce: false },
      { columnName: "tax_inclusive", alias: "taxInclusive", dataType: "boolean", isRequired: false, insertCast: "", writeOnce: false },
      { columnName: "account_id", alias: "accountId", dataType: "uuid", isRequired: false, insertCast: "::uuid", writeOnce: false },
      { columnName: "cost_center_id", alias: "costCenterId", dataType: "uuid", isRequired: false, insertCast: "::uuid", writeOnce: false },
      { columnName: "profit_center_id", alias: "profitCenterId", dataType: "uuid", isRequired: false, insertCast: "::uuid", writeOnce: false },
      { columnName: "fp_id", alias: "fpId", dataType: "uuid", isRequired: false, insertCast: "::uuid", writeOnce: false },
      { columnName: "asset_id", alias: "assetId", dataType: "uuid", isRequired: false, insertCast: "::uuid", writeOnce: false },
      { columnName: "inventory_movement_id", alias: "inventoryMovementId", dataType: "uuid", isRequired: false, insertCast: "::uuid", writeOnce: false },
      { columnName: "tags", alias: "tags", dataType: "jsonb", isRequired: false, insertCast: "::jsonb", writeOnce: false },
    ],
    systemColumns: ["tenant_id", "created_at", "updated_at", "spend_category_id", "commitment_id", "commitment_schedule_id", "resolved_dimension_set_id"],
    defaults: {
      sources: [
        {
          sourceEntity: "SpendCategory",
          joinClause: "left join fin.spend_category sc on sc.id = d.spend_category_id and sc.tenant_id = d.tenant_id",
          fields: [
            { selectExpr: "sc.default_gl_account", alias: "accountId" },
            { selectExpr: "sc.default_tax_code", alias: "taxCode" },
          ],
        },
      ],
    },
  },

  "credit-notes": {
    parent: {
      entityName: "CreditNote",
      tableSchema: "fin",
      tableName: "credit_note",
      qualifiedTable: "fin.credit_note",
    },
    child: {
      entityName: "CreditNoteLine",
      tableSchema: "fin",
      tableName: "credit_note_line",
      qualifiedTable: "fin.credit_note_line",
      fkColumn: "credit_note_id",
      fkAlias: "creditNoteId",
    },
    collection: {
      role: "document_lines",
      ownership: "owned",
      deleteMode: "cascade",
      ordering: true,
      orderField: "line_no",
    },
    selectColumns: [
      { columnName: "id", alias: "id", dataType: "uuid", selectCast: "::text" },
      { columnName: "credit_note_id", alias: "creditNoteId", dataType: "uuid", selectCast: "::text" },
      { columnName: "line_no", alias: "lineNo", dataType: "integer", selectCast: "" },
      { columnName: "description", alias: "description", dataType: "string", selectCast: "" },
      { columnName: "quantity", alias: "quantity", dataType: "decimal", selectCast: "::text" },
      { columnName: "unit_price", alias: "unitPrice", dataType: "decimal", selectCast: "::text" },
      { columnName: "amount", alias: "amount", dataType: "decimal", selectCast: "::text" },
      { columnName: "tax_code", alias: "taxCode", dataType: "string", selectCast: "" },
      { columnName: "tax_rate", alias: "taxRate", dataType: "decimal", selectCast: "::text" },
      { columnName: "tax_amount", alias: "taxAmount", dataType: "decimal", selectCast: "::text" },
      { columnName: "account_id", alias: "accountId", dataType: "uuid", selectCast: "::text" },
      { columnName: "cost_center_id", alias: "costCenterId", dataType: "uuid", selectCast: "::text" },
      { columnName: "profit_center_id", alias: "profitCenterId", dataType: "uuid", selectCast: "::text" },
    ],
    writableColumns: [
      { columnName: "description", alias: "description", dataType: "string", isRequired: true, insertCast: "", writeOnce: false },
      { columnName: "quantity", alias: "quantity", dataType: "decimal", isRequired: true, insertCast: "::numeric", writeOnce: false },
      { columnName: "unit_price", alias: "unitPrice", dataType: "decimal", isRequired: true, insertCast: "::numeric", writeOnce: false },
      { columnName: "amount", alias: "amount", dataType: "decimal", isRequired: true, insertCast: "::numeric", writeOnce: false },
      { columnName: "tax_code", alias: "taxCode", dataType: "string", isRequired: false, insertCast: "", writeOnce: false },
      { columnName: "tax_rate", alias: "taxRate", dataType: "decimal", isRequired: false, insertCast: "::numeric", writeOnce: false },
      { columnName: "tax_amount", alias: "taxAmount", dataType: "decimal", isRequired: false, insertCast: "::numeric", writeOnce: false },
      { columnName: "account_id", alias: "accountId", dataType: "uuid", isRequired: false, insertCast: "::uuid", writeOnce: false },
      { columnName: "cost_center_id", alias: "costCenterId", dataType: "uuid", isRequired: false, insertCast: "::uuid", writeOnce: false },
      { columnName: "profit_center_id", alias: "profitCenterId", dataType: "uuid", isRequired: false, insertCast: "::uuid", writeOnce: false },
    ],
    systemColumns: ["tenant_id", "created_at", "updated_at"],
    defaults: {
      sources: [],
    },
  },

  "debit-notes": {
    parent: {
      entityName: "DebitNote",
      tableSchema: "fin",
      tableName: "debit_note",
      qualifiedTable: "fin.debit_note",
    },
    child: {
      entityName: "DebitNoteLine",
      tableSchema: "fin",
      tableName: "debit_note_line",
      qualifiedTable: "fin.debit_note_line",
      fkColumn: "debit_note_id",
      fkAlias: "debitNoteId",
    },
    collection: {
      role: "document_lines",
      ownership: "owned",
      deleteMode: "cascade",
      ordering: true,
      orderField: "line_no",
    },
    selectColumns: [
      { columnName: "id", alias: "id", dataType: "uuid", selectCast: "::text" },
      { columnName: "debit_note_id", alias: "debitNoteId", dataType: "uuid", selectCast: "::text" },
      { columnName: "line_no", alias: "lineNo", dataType: "integer", selectCast: "" },
      { columnName: "description", alias: "description", dataType: "string", selectCast: "" },
      { columnName: "quantity", alias: "quantity", dataType: "decimal", selectCast: "::text" },
      { columnName: "unit_price", alias: "unitPrice", dataType: "decimal", selectCast: "::text" },
      { columnName: "amount", alias: "amount", dataType: "decimal", selectCast: "::text" },
      { columnName: "tax_code", alias: "taxCode", dataType: "string", selectCast: "" },
      { columnName: "tax_rate", alias: "taxRate", dataType: "decimal", selectCast: "::text" },
      { columnName: "tax_amount", alias: "taxAmount", dataType: "decimal", selectCast: "::text" },
      { columnName: "account_id", alias: "accountId", dataType: "uuid", selectCast: "::text" },
      { columnName: "cost_center_id", alias: "costCenterId", dataType: "uuid", selectCast: "::text" },
      { columnName: "profit_center_id", alias: "profitCenterId", dataType: "uuid", selectCast: "::text" },
    ],
    writableColumns: [
      { columnName: "description", alias: "description", dataType: "string", isRequired: true, insertCast: "", writeOnce: false },
      { columnName: "quantity", alias: "quantity", dataType: "decimal", isRequired: true, insertCast: "::numeric", writeOnce: false },
      { columnName: "unit_price", alias: "unitPrice", dataType: "decimal", isRequired: true, insertCast: "::numeric", writeOnce: false },
      { columnName: "amount", alias: "amount", dataType: "decimal", isRequired: true, insertCast: "::numeric", writeOnce: false },
      { columnName: "tax_code", alias: "taxCode", dataType: "string", isRequired: false, insertCast: "", writeOnce: false },
      { columnName: "tax_rate", alias: "taxRate", dataType: "decimal", isRequired: false, insertCast: "::numeric", writeOnce: false },
      { columnName: "tax_amount", alias: "taxAmount", dataType: "decimal", isRequired: false, insertCast: "::numeric", writeOnce: false },
      { columnName: "account_id", alias: "accountId", dataType: "uuid", isRequired: false, insertCast: "::uuid", writeOnce: false },
      { columnName: "cost_center_id", alias: "costCenterId", dataType: "uuid", isRequired: false, insertCast: "::uuid", writeOnce: false },
      { columnName: "profit_center_id", alias: "profitCenterId", dataType: "uuid", isRequired: false, insertCast: "::uuid", writeOnce: false },
    ],
    systemColumns: ["tenant_id", "created_at", "updated_at"],
    defaults: {
      sources: [],
    },
  },
};

function tryRegistryFallback(
  docTypeSlug: string,
  diagnostics: string[],
): DocumentLineRuntimeDefinition | null {
  const entry = STATIC_REGISTRY[docTypeSlug];
  if (!entry) {
    counters.notFound++;
    console.warn(
      `[doc-lines-runtime] No resolution for '${docTypeSlug}' (meta failed, no registry entry). Diagnostics: ${diagnostics.join("; ")}`,
    );
    return null;
  }

  counters.registryFallback++;
  counters.fallbackReasons.set(docTypeSlug, diagnostics.join("; "));

  console.warn(
    `[doc-lines-runtime] FALLBACK to static registry for '${docTypeSlug}' — meta seed debt detected. ` +
    `Reason: ${diagnostics.join("; ")}. ` +
    `Totals: meta=${counters.metaSuccess}, fallback=${counters.registryFallback}, notFound=${counters.notFound}`,
  );

  const def: DocumentLineRuntimeDefinition = {
    ...entry,
    resolvedFrom: "registry_fallback",
    diagnostics,
  };

  // Static registry entries are trusted but validate anyway for defense in depth
  validateDefinitionIdentifiers(def);

  return def;
}

// ============================================================================
// Utilities
// ============================================================================

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// ============================================================================
// Completeness validator — formal gate for meta-native readiness
// ============================================================================

export interface CompletenessCheckResult {
  slug: string;
  ready: boolean;
  steps: {
    step: string;
    passed: boolean;
    detail: string;
  }[];
  recommendation: "meta_native" | "registry_fallback" | "not_supported";
}

/**
 * Checks whether a docType slug is fully resolvable from meta without fallback.
 * Does NOT cache — intended for admin/diagnostic endpoints, not hot path.
 *
 * Returns a structured report for each resolution step, suitable for
 * a seed-debt dashboard or pre-migration validation.
 */
export async function validateMetaCompleteness(
  db: Kysely<any>,
  tenantId: string,
  docTypeSlug: string,
): Promise<CompletenessCheckResult> {
  const steps: CompletenessCheckResult["steps"] = [];

  // Step 1: Parent entity resolution
  const parentMeta = await resolveEntityMeta(db, docTypeSlug, tenantId);
  if (!parentMeta) {
    steps.push({
      step: "parent_entity",
      passed: false,
      detail: `Entity not found in meta.entity for slug '${docTypeSlug}'. Needs INSERT into meta.entity with matching name/slug.`,
    });
    return { slug: docTypeSlug, ready: false, steps, recommendation: hasFallback(docTypeSlug) ? "registry_fallback" : "not_supported" };
  }
  steps.push({
    step: "parent_entity",
    passed: true,
    detail: `Resolved to ${parentMeta.entityName} (${parentMeta.tableSchema}.${parentMeta.tableName})`,
  });

  // Step 2: Collection wiring
  const collectionResult = await findPrimaryCollection(db, tenantId, parentMeta.entityName);
  if (!collectionResult.collection) {
    steps.push({
      step: "collection_wiring",
      passed: false,
      detail: collectionResult.reason + `. Needs a meta.field row with cardinality='many', child_entity_name, and child_fk_field on entity ${parentMeta.entityName}.`,
    });
    return { slug: docTypeSlug, ready: false, steps, recommendation: hasFallback(docTypeSlug) ? "registry_fallback" : "not_supported" };
  }
  const hasExplicitRole = collectionResult.collection.role === "document_lines";
  steps.push({
    step: "collection_wiring",
    passed: true,
    detail: `Found collection → ${collectionResult.collection.childEntityName} via FK ${collectionResult.collection.fkColumn}` +
      (hasExplicitRole ? " (role=document_lines)" : " (implicit — single collection fallback)"),
  });

  // Step 3: Child entity resolution
  const childMeta = await resolveEntityMeta(db, collectionResult.collection.childEntityName, tenantId);
  if (!childMeta) {
    steps.push({
      step: "child_entity",
      passed: false,
      detail: `Child entity '${collectionResult.collection.childEntityName}' not found in meta.entity. Needs INSERT into meta.entity.`,
    });
    return { slug: docTypeSlug, ready: false, steps, recommendation: hasFallback(docTypeSlug) ? "registry_fallback" : "not_supported" };
  }
  steps.push({
    step: "child_entity",
    passed: true,
    detail: `Resolved to ${childMeta.entityName} (${childMeta.tableSchema}.${childMeta.tableName})`,
  });

  // Step 4: Field dictionary
  const childFields = await getPublishedFields(db, tenantId, childMeta.entityName);
  if (childFields.length === 0) {
    steps.push({
      step: "field_dictionary",
      passed: false,
      detail: `No published fields for ${childMeta.entityName}. Needs INSERT rows into meta.field for the published entity_version.`,
    });
    return { slug: docTypeSlug, ready: false, steps, recommendation: hasFallback(docTypeSlug) ? "registry_fallback" : "not_supported" };
  }
  steps.push({
    step: "field_dictionary",
    passed: true,
    detail: `${childFields.length} fields found (cardinality='one')`,
  });

  // Step 5: Field classification
  const { selectColumns, writableColumns } = classifyFields(childFields, collectionResult.collection.fkColumn);
  if (selectColumns.length === 0) {
    steps.push({
      step: "field_classification",
      passed: false,
      detail: `Classification produced zero readable columns. Check that fields have correct origin/is_computed flags.`,
    });
    return { slug: docTypeSlug, ready: false, steps, recommendation: hasFallback(docTypeSlug) ? "registry_fallback" : "not_supported" };
  }
  steps.push({
    step: "field_classification",
    passed: true,
    detail: `${selectColumns.length} readable, ${writableColumns.length} writable columns`,
  });

  // Step 6: Identifier safety
  try {
    const testDef: DocumentLineRuntimeDefinition = {
      parent: {
        entityName: parentMeta.entityName,
        tableSchema: parentMeta.tableSchema,
        tableName: parentMeta.tableName,
        qualifiedTable: `${parentMeta.tableSchema}.${parentMeta.tableName}`,
      },
      child: {
        entityName: childMeta.entityName,
        tableSchema: childMeta.tableSchema,
        tableName: childMeta.tableName,
        qualifiedTable: `${childMeta.tableSchema}.${childMeta.tableName}`,
        fkColumn: collectionResult.collection.fkColumn,
        fkAlias: snakeToCamel(collectionResult.collection.fkColumn),
      },
      collection: {
        role: collectionResult.collection.role,
        ownership: collectionResult.collection.ownership,
        deleteMode: collectionResult.collection.deleteMode,
        ordering: collectionResult.collection.ordering,
        orderField: collectionResult.collection.orderField,
      },
      selectColumns,
      writableColumns,
      systemColumns: [],
      defaults: { sources: [] },
      resolvedFrom: "meta",
      diagnostics: [],
    };
    validateDefinitionIdentifiers(testDef);
    steps.push({ step: "identifier_safety", passed: true, detail: "All identifiers pass SQL safety validation" });
  } catch (err) {
    steps.push({
      step: "identifier_safety",
      passed: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    return { slug: docTypeSlug, ready: false, steps, recommendation: hasFallback(docTypeSlug) ? "registry_fallback" : "not_supported" };
  }

  // Step 7: Compare with static fallback (if exists)
  const fallback = STATIC_REGISTRY[docTypeSlug];
  if (fallback) {
    const metaSelectCols = new Set(selectColumns.map((c) => c.columnName));
    const fallbackSelectCols = new Set(fallback.selectColumns.map((c) => c.columnName));
    const missingFromMeta = [...fallbackSelectCols].filter((c) => !metaSelectCols.has(c));
    const extraInMeta = [...metaSelectCols].filter((c) => !fallbackSelectCols.has(c));

    if (missingFromMeta.length > 0 || extraInMeta.length > 0) {
      steps.push({
        step: "parity_check",
        passed: false,
        detail: `Column parity mismatch vs static registry. Missing: [${missingFromMeta.join(", ")}]. Extra: [${extraInMeta.join(", ")}].`,
      });
    } else {
      steps.push({ step: "parity_check", passed: true, detail: "Full column parity with static registry" });
    }
  }

  const allPassed = steps.every((s) => s.passed);
  return {
    slug: docTypeSlug,
    ready: allPassed,
    steps,
    recommendation: allPassed ? "meta_native" : (hasFallback(docTypeSlug) ? "registry_fallback" : "not_supported"),
  };
}

function hasFallback(slug: string): boolean {
  return slug in STATIC_REGISTRY;
}
