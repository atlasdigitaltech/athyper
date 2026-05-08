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
import { applyFieldSecurityMask } from "../../policy/field-security.middleware.js";
import { createCompanyCodeScopeService } from "../../../../../src/foundation/iam/company-code-scope.service.js";
import {
  acquireLock,
  verifyLock,
  renewLock,
  releaseLock,
  forceReleaseLock,
  getLockStatus,
  resolveConcurrencyPolicy,
} from "@athyper/svc-shared";
import type { CacheClient } from "../../iam/session/session.service.js";
import {
  resolveParameterSnapshot,
  getIntParam,
} from "../../iam/parameters/parameter-resolver.service.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE     = 100;
const DEFAULT_LOCK_TTL_SECONDS = 300;

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
}

// ── Entity table resolver ─────────────────────────────────────────────────────

interface EntityTableInfo {
  table_schema:        string;
  table_name:          string;
  natural_key_fields:  string[];
  entity_class:        string;
  feature_flags:       Record<string, unknown>;
  concurrency_policy:  Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveEntityTable(db: Kysely<any>, entityCode: string): Promise<EntityTableInfo | null> {
  // Normalise URL slug → DB name (journal-entry → journal_entry)
  const name = entityCode.replace(/-/g, "_");
  const row = await db
    .selectFrom("control.entity as e")
    .select(["e.table_schema", "e.table_name", "e.natural_key_fields", "e.entity_class", "e.feature_flags", "e.concurrency_policy"] as never[])
    .where("e.name", "=", name)
    .where("e.tenant_id", "is", null)
    .executeTakeFirst() as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    table_schema:        String(row["table_schema"]),
    table_name:          String(row["table_name"]),
    natural_key_fields:  Array.isArray(row["natural_key_fields"]) ? (row["natural_key_fields"] as string[]) : [],
    entity_class:        String(row["entity_class"] ?? ""),
    feature_flags:       (row["feature_flags"]      && typeof row["feature_flags"]      === "object") ? (row["feature_flags"]      as Record<string, unknown>) : {},
    concurrency_policy:  (row["concurrency_policy"] && typeof row["concurrency_policy"] === "object") ? (row["concurrency_policy"] as Record<string, unknown>) : {},
  };
}

// ── Business-key / UUID dual resolver ────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isCertificationBackingTable(table: EntityTableInfo): boolean {
  return table.table_schema === "master" && table.table_name === "certification";
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
  const n = Number(s);
  return Number.isFinite(n) && s.trim() !== "" ? n : s;
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
    return { type: "not_in", values: raw.slice("not_in:".length).split(",").filter(Boolean) };
  }
  if (raw.startsWith("in:")) {
    return { type: "in", values: raw.slice("in:".length).split(",").filter(Boolean) };
  }

  // Default: comma-separated → IN
  return { type: "in", values: raw.split(",").filter(Boolean) };
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

// ── Route factory ─────────────────────────────────────────────────────────────

export function createRecordsRoute(router: Router, deps: RecordsRouteDeps): Router {
  const { db, auth, logger, cache } = deps;

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
  //   ?page_size=<n>     records per page (default 20, max 100)
  //   ?q=<term>          free-text ILIKE search on is_searchable fields
  //   ?filter.<field>=<sigil>   per-field operator filter (preferred)
  //   ?filters=<json>    legacy JSON map (deprecated, still accepted)
  //   ?sort=<field>:<dir>  field = logical field name; dir = asc | desc
  //   ?facets=cheap|all  return value-count map for enum/boolean fields
  //
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
      // If feature_flags.list_entity_code is set, list queries run against the
      // denormalized index table (e.g. supplier_app_index) instead of the thin
      // role table.  Identity + role fields are co-located in the index for fast
      // list/search.  The canonical table is still used for detail GET and writes.
      const listEntityCode = table.feature_flags["list_entity_code"] as string | undefined;
      const listTable      = listEntityCode ? (await resolveEntityTable(db, listEntityCode) ?? table) : table;
      let   fullTable      = `${listTable.table_schema}.${listTable.table_name}` as `${string}.${string}`;
      const listCode       = listTable !== table ? listEntityCode! : entityCode;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      const paginationSnap = tenantId && cache
        ? await resolveParameterSnapshot(db, cache, tenantId, "api.pagination").catch(() => null)
        : null;
      const defaultPageSize = getIntParam(paginationSnap, "api.pagination.default_page_size", DEFAULT_PAGE_SIZE);
      const maxPageSize     = getIntParam(paginationSnap, "api.pagination.max_page_size",     MAX_PAGE_SIZE);
      const pageSize = Math.min(maxPageSize, Math.max(1, rawPageSize || defaultPageSize));
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
          .select(["e.display_config"])
          .where("e.name",      "=", listCode)
          .where("e.tenant_id", "is", null)
          .where("ev.status",   "=", "EFFECTIVE")
          .executeTakeFirst() as Promise<{ display_config: Record<string, unknown> | null } | undefined>,
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

      if (tenantId) {
        listQuery  = listQuery.where("tenant_id"  as never, "=", tenantId as never);
        countQuery = countQuery.where("tenant_id" as never, "=", tenantId as never);
        if (groupCountQuery) groupCountQuery = groupCountQuery.where("tenant_id" as never, "=", tenantId as never);
      }

      // ── Parent FK filter for child entities ───────────────────────────────────
      // ?parent_id=<uuid> narrows results to records belonging to that parent.
      // Uses feature_flags.parent_fk to resolve the physical FK column.
      // feature_flags.parent_scope ("col=val") adds any extra discriminator.
      // Virtual quick filters are configured in entity.display_config.filter_bar.
      // Handle generic __ keys here, then remove them before normal field filters.
      const virtualFilterKeys = Object.keys(sigilFilters).filter((field) => field.startsWith("__"));
      if (virtualFilterKeys.length > 0) {
        const sub = typeof claims.sub === "string" ? claims.sub : "";
        const principalId = sub && tenantId ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;

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
      const parentFkCol       = typeof table.feature_flags["parent_fk"] === "string" ? table.feature_flags["parent_fk"] : null;
      const throughEntityCode = typeof req.query["through_entity"] === "string" ? req.query["through_entity"] : null;

      if (parentIdParam && parentFkCol) {
        if (throughEntityCode) {
          // ── Two-hop: child.parentFkCol IN (SELECT id FROM throughTable WHERE throughParentFk = parentId) ──
          // All metadata (through table schema/name, through parent FK) is resolved from
          // control.entity at runtime — nothing entity-specific is hardcoded here.
          const throughMeta = await db
            .selectFrom("control.entity as e")
            .select(["e.table_schema", "e.table_name", "e.feature_flags"])
            .where("e.entity_code", "=", throughEntityCode)
            .where("e.tenant_id",   "is", null)
            .executeTakeFirst() as { table_schema: string; table_name: string; feature_flags: Record<string, unknown> } | undefined;

          if (throughMeta) {
            const throughParentFk = typeof throughMeta.feature_flags["parent_fk"] === "string"
              ? throughMeta.feature_flags["parent_fk"] : null;
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
          const scopeStr = typeof table.feature_flags["parent_scope"] === "string" ? table.feature_flags["parent_scope"] : null;
          if (scopeStr) {
            const eqIdx = scopeStr.indexOf("=");
            if (eqIdx > 0) {
              const scopeCol = scopeStr.slice(0, eqIdx);
              const scopeVal = scopeStr.slice(eqIdx + 1);
              listQuery  = listQuery.where(scopeCol  as never, "=", scopeVal as never);
              countQuery = countQuery.where(scopeCol as never, "=", scopeVal as never);
              if (groupCountQuery) groupCountQuery = groupCountQuery.where(scopeCol as never, "=", scopeVal as never);
            }
          }
        } else {
          // ── Direct parent filter — existing logic unchanged ────────────────────
          listQuery  = listQuery.where(parentFkCol  as never, "=", parentIdParam as never);
          countQuery = countQuery.where(parentFkCol as never, "=", parentIdParam as never);
          if (groupCountQuery) groupCountQuery = groupCountQuery.where(parentFkCol as never, "=", parentIdParam as never);
          const scopeStr = typeof table.feature_flags["parent_scope"] === "string" ? table.feature_flags["parent_scope"] : null;
          if (scopeStr) {
            const eqIdx = scopeStr.indexOf("=");
            if (eqIdx > 0) {
              const scopeCol = scopeStr.slice(0, eqIdx);
              // Allow caller to override the entity's default parent_scope value via
              // ?{col}_filter=X (e.g. ?owner_type_filter=business_partner).  This lets
              // polymorphic tables (party_identifier, party_contact_person) be queried
              // from Business Partner or Customer pages without a separate entity registration.
              const overrideKey = `${scopeCol}_filter`;
              const scopeVal = (typeof req.query[overrideKey] === "string" ? req.query[overrideKey] : null)
                ?? scopeStr.slice(eqIdx + 1);
              listQuery  = listQuery.where(scopeCol  as never, "=", scopeVal as never);
              countQuery = countQuery.where(scopeCol as never, "=", scopeVal as never);
              if (groupCountQuery) groupCountQuery = groupCountQuery.where(scopeCol as never, "=", scopeVal as never);
            }
          }
        }
      }

      // ── Company code scope filter ─────────────────────────────────────────────
      // When listing company_code records, restrict to only the company codes the
      // principal has been granted access to (via master.company_code_access).
      // Tenants with no ACL rows configured are treated as unrestricted (backward
      // compatible with simple single-company setups).
      if (entityCode === "company_code" && tenantId) {
        const sub = typeof claims.sub === "string" ? claims.sub : "";
        const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;
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
        const searchableCols = fieldMeta
          .filter((f) => f.is_searchable && queryableColumnNames.has(f.column_name))
          .map((f) => f.column_name);
        if (searchableCols.length > 0) {
          const pattern = `%${searchTerm}%` as never;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const applySearch = (q: any) => q.where((eb: any) =>
            eb.or(searchableCols.map((col: string) => eb(col as never, "ilike", pattern))),
          );
          listQuery  = applySearch(listQuery);
          countQuery = applySearch(countQuery);
          if (groupCountQuery) groupCountQuery = applySearch(groupCountQuery);
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
        const metaSortDir   = typeof displayConfig?.default_sort_dir === "string"
          ? displayConfig.default_sort_dir
          : "desc";

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

      // ── Execute list + count + group counts (parallel) ────────────────────────
      const [rows, countResult, groupCountRows] = await Promise.all([
        listQuery.limit(pageSize).offset(offset).execute(),
        countQuery.executeTakeFirst(),
        groupCountQuery ? (groupCountQuery as { execute(): Promise<{ group_value: string; count: string }[]> }).execute() : Promise.resolve(null),
      ]);

      const total = parseInt(String(countResult?.count ?? "0"), 10);

      const reverseMap = new Map<string, string>();
      for (const [fieldName, columnName] of fieldMap.entries()) {
        reverseMap.set(columnName, fieldName);
      }
      const remappedRows = (rows as Record<string, unknown>[]).map((row) => {
        const out: Record<string, unknown> = {};
        for (const [col, val] of Object.entries(row)) {
          out[reverseMap.get(col) ?? col] = val;
        }
        return out;
      });
      const responseRows = isCertificationBackingTable(listTable)
        ? await enrichCertificationTypeDisplayFields(db, remappedRows)
        : remappedRows;

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

      // Build a reverse map: physical column_name → logical field name
      // so the detail page can access data[field.name] correctly.
      const reverseMap = new Map<string, string>();
      for (const [fieldName, columnName] of fieldMap.entries()) {
        reverseMap.set(columnName, fieldName);
      }

      // Remap DB row keys: column_name → field_name
      const data: Record<string, unknown> = {};
      for (const [col, val] of Object.entries(row)) {
        const fieldName = reverseMap.get(col) ?? col;
        data[fieldName] = val;
      }

      // ── BP identity merge ────────────────────────────────────────────────────
      // When identity_via = 'business_partner', the role table (supplier/customer)
      // holds only commercial fields.  Fetch the linked BP record and merge
      // identity fields (name, legal_name, country, etc.) into data so the detail
      // header can display them without a second client-side request.
      // Role fields (supplier_code, status, etc.) take precedence — BP fields only
      // fill keys that are absent from the role row.
      if (table.feature_flags["identity_via"] === "business_partner") {
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

      const responseData = isCertificationBackingTable(table)
        ? (await enrichCertificationTypeDisplayFields(db, [data]))[0] ?? data
        : data;

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
      const body = req.body as { data?: Record<string, unknown> };
      const inputData = body.data ?? {};
      const mappedData: Record<string, unknown> = {};
      for (const [fieldName, value] of Object.entries(inputData)) {
        const columnName = fieldMap.get(fieldName);
        // Skip undefined/null values so DB column defaults can apply
        if (columnName && value !== undefined && value !== null) {
          mappedData[columnName] = value;
        }
      }
      coerceArrayFields(mappedData, await resolveArrayColumns(db, entityCode));
      serializeJsonFields(mappedData, await resolveJsonColumns(db, entityCode));

      // Inject parent FK when entity is a child (feature_flags.parent_fk + parent_scope).
      // The caller passes parent_id in body.data; we resolve the physical FK column from
      // feature_flags so the form never needs to know the internal column name.
      const createParentFk  = typeof table.feature_flags["parent_fk"] === "string" ? table.feature_flags["parent_fk"] : null;
      const createParentId  = typeof inputData["parent_id"] === "string" ? inputData["parent_id"] : null;
      if (createParentFk && createParentId) {
        mappedData[createParentFk] = createParentId;
        const scopeStr = typeof table.feature_flags["parent_scope"] === "string" ? table.feature_flags["parent_scope"] : null;
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
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
        : SYSTEM_PRINCIPAL_UUID;
      mappedData.created_by = principalId;

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

          // The wizard payment_type field captures instrument modality (bank_transfer/cheque/cash).
          // The DB payment_type column is a settlement classification (standard/advance/etc.) with
          // a CHECK constraint that rejects the wizard values. Extract the modality, store it in
          // metadata for display, then let the DB default handle payment_type = 'standard'.
          const instrumentMode = String(mappedData["payment_type"] ?? "bank_transfer");
          delete mappedData["payment_type"];
          const existingMeta = (typeof mappedData["metadata"] === "object" && mappedData["metadata"] !== null)
            ? (mappedData["metadata"] as Record<string, unknown>)
            : {};
          mappedData["metadata"] = { ...existingMeta, instrument_mode: instrumentMode };

          // supplier_name: denormalized NOT NULL — resolve from master.supplier
          if (!mappedData["supplier_name"] && mappedData["supplier_id"]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const vendor = await (db as any)
              .selectFrom("master.supplier as s")
              .select(["s.name"])
              .where("s.id",        "=", mappedData["supplier_id"])
              .where("s.tenant_id", "=", tenantId)
              .executeTakeFirst() as { name: string } | undefined;
            mappedData["supplier_name"] = vendor?.name ?? "Unknown Supplier";
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

          // payment_method_id: NOT NULL — look up by instrument_mode, fallback to any active
          if (!mappedData["payment_method_id"]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let pm = await (db as any)
              .selectFrom("master.payment_method as pm")
              .select(["pm.id"])
              .where("pm.tenant_id",       "=", tenantId)
              .where("pm.instrument_mode", "=", instrumentMode)
              .where("pm.is_active",       "=", true)
              .orderBy("pm.sort_order",    "asc")
              .executeTakeFirst() as { id: string } | undefined;
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
          mappedData[docNum.col] = `${docNum.prefix}-${yyyymm}-${rand}`;
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
      // lock_token and expected_row_version are top-level concurrency fields alongside data
      const body = req.body as { data?: Record<string, unknown>; lock_token?: string; expected_row_version?: number };
      const inputData = body.data ?? {};
      const mappedData: Record<string, unknown> = {};
      for (const [fieldName, value] of Object.entries(inputData)) {
        const columnName = fieldMap.get(fieldName);
        if (columnName && !IMMUTABLE_COLS.has(columnName)) mappedData[columnName] = value;
      }
      coerceArrayFields(mappedData, await resolveArrayColumns(db, entityCode));
      serializeJsonFields(mappedData, await resolveJsonColumns(db, entityCode));

      // Resolve UUID from business key when caller passes a canonical key
      const physicalId = UUID_RE.test(id)
        ? id
        : String((await resolveRecordRow(db, fullTable, id, table.natural_key_fields, fieldMap, tenantId))?.id ?? "");
      if (!physicalId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;

      // ── Concurrency guard (lease_plus_version) ──────────────────────────────
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

      mappedData.updated_by = principalId ?? undefined;
      mappedData.updated_at = new Date().toISOString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await (db.updateTable(fullTable) as any)
        .set(mappedData)
        .where("id", "=", physicalId)
        .where("tenant_id", "=", tenantId)
        .returningAll()
        .executeTakeFirst();

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
        const oldValue = oldRow?.[colName] ?? null;
        if (String(oldValue ?? "") !== String(newValue ?? "")) {
          diffBefore[fieldName] = oldValue;
          diffAfter[fieldName]  = newValue;
        }
      }
      void logActivityRecord(tenantId, entityCode, physicalId, "document.updated", principalId ?? SYSTEM_PRINCIPAL_UUID, { before: diffBefore, after: diffAfter });

      res.json(row);
    } catch (err) {
      logger?.error("records_update_error", { err: String(err) });
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

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;

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
      const mappedData: Record<string, unknown> = {};
      for (const [fieldName, value] of Object.entries(inputData)) {
        const columnName = fieldMap.get(fieldName) ?? fieldName;
        if (["id", "tenant_id", "created_by", "created_at", "row_version"].includes(columnName)) continue;
        mappedData[columnName] = value;
      }
      coerceArrayFields(mappedData, await resolveArrayColumns(db, entityCode));
      serializeJsonFields(mappedData, await resolveJsonColumns(db, entityCode));

      mappedData.updated_by = principalId ?? undefined;
      mappedData.updated_at = new Date().toISOString();

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;

      // Resolve UUID from business key when caller passes a canonical key
      const physicalId = UUID_RE.test(id)
        ? id
        : String((await resolveRecordRow(db, fullTable, id, table.natural_key_fields, fieldMap, tenantId))?.id ?? "");
      if (!physicalId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      // ── Concurrency guard (lease_plus_version) ──────────────────────────────
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await (db.updateTable(fullTable) as any)
        .set(mappedData)
        .where("id", "=", physicalId)
        .where("tenant_id", "=", tenantId)
        .returningAll()
        .executeTakeFirst();

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
        const oldValue = oldRow?.[colName] ?? null;
        if (String(oldValue ?? "") !== String(newValue ?? "")) {
          diffBefore[fieldName] = oldValue;
          diffAfter[fieldName]  = newValue;
        }
      }
      void logActivityRecord(tenantId, entityCode, physicalId, "document.updated", principalId ?? SYSTEM_PRINCIPAL_UUID, { before: diffBefore, after: diffAfter });

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
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;

      const physicalId = UUID_RE.test(id)
        ? id
        : String((await resolveRecordRow(db, fullTable, id, table.natural_key_fields, new Map(), tenantId))?.id ?? "");
      if (!physicalId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

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

      const sub = typeof claims.sub === "string" ? claims.sub : null;
      const principalId = sub && tenantId ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims) : null;

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
      const principalId = sub ? (await resolvePrincipalIdOrNull(db, sub, tenantId) ?? sub) : null;

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
    if (body["line_number"] != null)           row["line_no"]        = Number(body["line_number"]);
    if (body["description"]   !== undefined)   row["item_description"] = body["description"] ?? "";
    if (body["unit_code"]     !== undefined)   row["uom_code"]       = body["unit_code"]   ?? "EA";
    if (body["quantity"]      !== undefined)   row["quantity"]       = body["quantity"]    ?? 1;
    if (body["unit_price"]    !== undefined)   row["unit_price"]     = body["unit_price"]  ?? 0;
    if (body["line_amount"]   !== undefined)   row["gross_amount"]   = body["line_amount"] ?? 0;
    if (body["tax_group_id"]  !== undefined)   row["tax_group_id"]    = body["tax_group_id"] ?? null;
    if (body["withholding_tax_group_id"] !== undefined) row["withholding_tax_group_id"] = body["withholding_tax_group_id"] ?? null;
    if (body["tax_amount"]    !== undefined)   row["tax_amount"]     = body["tax_amount"]  ?? 0;
    if (body["withholding_tax_amount"] !== undefined) row["withholding_tax_amount"] = body["withholding_tax_amount"] ?? 0;
    if (body["discount_pct"]  !== undefined)   row["discount_pct"]   = body["discount_pct"]  ?? 0;
    if (body["discount_amount"] !== undefined) row["discount_amount"] = body["discount_amount"] ?? 0;
    // item_code and tax_code have no dedicated DB column — persist in metadata
    const existingMeta = (body["data"] as Record<string, unknown> | undefined) ?? {};
    row["metadata"] = {
      ...existingMeta,
      ...(body["item_code"] !== undefined ? { item_code: body["item_code"] } : {}),
      ...(body["tax_code"]  !== undefined ? { tax_code:  body["tax_code"]  } : {}),
    };
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
      discount_pct:            r["discount_pct"]            ?? null,
      discount_amount:         r["discount_amount"]          ?? null,
      retention_pct:           r["retention_pct"]            ?? null,
      retention_amount:        r["retention_amount"]         ?? null,
      withholding_tax_amount:  r["withholding_tax_amount"]   ?? null,
      data:                    meta,
    };
  }

  // ── POST /:entity/:id/lines — create a new line ───────────────────────────────
  const createLineHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { sub } = claims as { sub: string };

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
      if (!insertRow["item_description"]) insertRow["item_description"] = "";
      if (!insertRow["uom_code"])         insertRow["uom_code"]         = "EA";
      if (!insertRow["quantity"])          insertRow["quantity"]         = 1;
      if (insertRow["unit_price"] == null) insertRow["unit_price"]      = 0;
      const principalId = sub && tenantId
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
        : sub;
      insertRow["created_by"] = principalId;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inserted = await (db.insertInto(linesTable) as any)
        .values(insertRow)
        .returningAll()
        .executeTakeFirstOrThrow() as Record<string, unknown>;

      res.status(201).json(normaliseLineRow(inserted, fkCol));
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

      if (rejectNonConventionalLineMutation(res, entityCode)) return;

      const linesTable = `${table.table_schema}.${table.table_name}_line` as `${string}.${string}`;
      const fkCol      = `${table.table_name}_id`;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const patchRow = lineBodyToDb(body, fkCol, id, tenantId);
      // Remove identity columns from patch
      delete patchRow["tenant_id"];
      delete patchRow[fkCol];

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

      res.json(normaliseLineRow(updated, fkCol));
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
        spend_category_id:  body["spend_category_id"]  ?? null,
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

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      const body = req.body as Record<string, unknown>;
      const allowedKeys = [
        "distribution_basis","split_pct","split_amount","split_quantity",
        "distributed_amount","account_source","posting_role_code","account_code",
        "gl_account_id","business_intent_id","spend_category_id",
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
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
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
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
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
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, claims)
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
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;
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
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;
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
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;
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
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;
      const hasPerm = await db
        .selectFrom("master.principal_permission as pp" as never)
        .select("pp.id" as never)
        .where("pp.principal_id" as never, "=", principalId as never)
        .where("pp.permission_code" as never, "=", "records.lock.force_release" as never)
        .where("pp.tenant_id" as never, "=", tenantId as never)
        .executeTakeFirst()
        .catch(() => null);

      if (!hasPerm) {
        res.status(403).json({ error: "FORBIDDEN", message: "records.lock.force_release permission required" });
        return;
      }

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
  router.post("/records/:entity/:id/lines/:lineId/distributions",               createDistributionHandler);
  router.patch("/records/:entity/:id/lines/:lineId/distributions/:distId",      patchDistributionHandler);
  router.delete("/records/:entity/:id/lines/:lineId/distributions/:distId",     deleteDistributionHandler);
  router.get("/records/:entity/filter-presets",            listPresetsHandler);
  router.post("/records/:entity/filter-presets",           createPresetHandler);
  router.delete("/records/:entity/filter-presets/:presetId", deletePresetHandler);
  router.get("/records/:entity/:id/versions",           subResourceStub("versions"));
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

  router.get("/records/:entity/:id", getHandler);
  router.post("/records/:entity", createHandler);
  router.put("/records/:entity/:id", updateHandler);
  router.patch("/records/:entity/:id", patchHandler);
  router.delete("/records/:entity/:id", deleteHandler);

  return router;
}
