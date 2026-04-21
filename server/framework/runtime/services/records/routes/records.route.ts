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

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  resolveTenantId,
  SYSTEM_PRINCIPAL_UUID,
  resolvePrincipalIdOrNull,
  resolvePrincipalIdWithJit,
  resolveFieldMap,
  emitOutboxEvent,
} from "@athyper/svc-shared";
import { applyFieldSecurityMask } from "../../policy/field-security.middleware.js";

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
}

// ── Entity table resolver ─────────────────────────────────────────────────────

interface EntityTableInfo {
  table_schema:       string;
  table_name:         string;
  natural_key_fields: string[];
  entity_class:       string;
  feature_flags:      Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveEntityTable(db: Kysely<any>, entityCode: string): Promise<EntityTableInfo | null> {
  // Normalise URL slug → DB name (journal-entry → journal_entry)
  const name = entityCode.replace(/-/g, "_");
  const row = await db
    .selectFrom("control.entity as e")
    .select(["e.table_schema", "e.table_name", "e.natural_key_fields", "e.entity_class", "e.feature_flags"])
    .where("e.name", "=", name)
    .where("e.tenant_id", "is", null)
    .executeTakeFirst();
  if (!row) return null;
  return {
    table_schema:       String(row.table_schema),
    table_name:         String(row.table_name),
    natural_key_fields: Array.isArray(row.natural_key_fields) ? (row.natural_key_fields as string[]) : [],
    entity_class:       String(row.entity_class ?? ""),
    feature_flags:      (row.feature_flags && typeof row.feature_flags === "object") ? (row.feature_flags as Record<string, unknown>) : {},
  };
}

// ── Business-key / UUID dual resolver ────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// ── Route factory ─────────────────────────────────────────────────────────────

export function createRecordsRoute(router: Router, deps: RecordsRouteDeps): Router {
  const { db, auth, logger } = deps;

  // ── LIST ──────────────────────────────────────────────────────────────────────
  //
  // Query params (canonical — matches EntityListQueryState URL serialization):
  //   ?page=<n>          current page (1-based, default 1)
  //   ?page_size=<n>     records per page (default 20, max 100)
  //   ?q=<term>          free-text ILIKE search on is_searchable fields
  //   ?filters=<json>    JSON map: { field: value | value[] }
  //                      arrays → WHERE column IN (...); single → WHERE col = val
  //   ?sort=<field>:<dir>  field = logical field name; dir = asc | desc
  //   ?facets=cheap|all  return value-count map for enum/boolean fields
  //
  const listHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      // Normalise URL slug → DB entity name (journal-entry → journal_entry).
      // resolveEntityTable and resolveFieldMap do this internally; the direct
      // control.entity queries below must use the same normalised form.
      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const page     = Math.max(1, parseInt(String(req.query["page"]      ?? "1"),  10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query["page_size"] ?? "20"), 10) || 20));
      const offset   = (page - 1) * pageSize;

      // Full-text search term
      const searchTerm = typeof req.query["q"] === "string" && req.query["q"].trim()
        ? req.query["q"].trim()
        : null;

      // Column filters — JSON-encoded map: { field: value | value[] }
      let columnFilters: Record<string, unknown> = {};
      if (typeof req.query["filters"] === "string") {
        try {
          columnFilters = JSON.parse(req.query["filters"]) as Record<string, unknown>;
        } catch { /* ignore malformed */ }
      }

      // Sort — canonical: "field_name:asc" or "field_name:desc"
      const sortRaw = typeof req.query["sort"] === "string" ? req.query["sort"].trim() : null;
      let sortFieldName: string | null = null;
      let sortDir: "asc" | "desc" = "asc";
      if (sortRaw) {
        const colonIdx = sortRaw.lastIndexOf(":");
        if (colonIdx > 0) {
          sortFieldName = sortRaw.slice(0, colonIdx);
          sortDir = sortRaw.slice(colonIdx + 1) === "desc" ? "desc" : "asc";
        }
      }

      // Facets — "cheap" = enum + boolean fields; "all" = + any field
      const facetsParam = typeof req.query["facets"] === "string" ? req.query["facets"] : null;
      const includeFacets = facetsParam === "cheap" || facetsParam === "all";

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      // ── Resolve field map once (used for filters + sort + remap) ────────────
      const fieldMap = await resolveFieldMap(db, entityCode);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let listQuery: any  = db.selectFrom(fullTable).selectAll();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let countQuery: any = db.selectFrom(fullTable).select(db.fn.countAll<string>().as("count"));

      if (tenantId) {
        listQuery  = listQuery.where("tenant_id"  as never, "=", tenantId as never);
        countQuery = countQuery.where("tenant_id" as never, "=", tenantId as never);
      }

      // ── Column filters ───────────────────────────────────────────────────────
      // Supports: { field: "value" } (equality) or { field: ["v1","v2"] } (IN)
      if (Object.keys(columnFilters).length > 0) {
        for (const [fieldName, value] of Object.entries(columnFilters)) {
          if (value === undefined || value === null || fieldName.startsWith("_")) continue;
          const colName = fieldMap.get(fieldName) ?? fieldName;

          if (Array.isArray(value) && value.length > 0) {
            // Multi-value → IN(...)
            listQuery  = listQuery.where(colName  as never, "in", value as never);
            countQuery = countQuery.where(colName as never, "in", value as never);
          } else if (Array.isArray(value) && value.length === 0) {
            // Empty array → no results for this filter
            listQuery  = listQuery.where(sql<boolean>`false` as never);
            countQuery = countQuery.where(sql<boolean>`false` as never);
          } else {
            listQuery  = listQuery.where(colName  as never, "=", value as never);
            countQuery = countQuery.where(colName as never, "=", value as never);
          }
        }
      }

      // ── Full-text search (ILIKE on is_searchable fields) ────────────────────
      if (searchTerm) {
        const searchableFields = await db
          .selectFrom("control.entity_field as ef")
          .innerJoin("control.entity_version as ev", "ev.id", "ef.entity_version_id")
          .innerJoin("control.entity as e",          "e.id",  "ev.entity_id")
          .select(["ef.column_name"])
          .where("e.name",           "=",  entityCode)
          .where("e.tenant_id",      "is", null)
          .where("ef.is_searchable", "=",  true)
          .where("ef.is_active",     "=",  true)
          .where("ev.status",        "=",  "EFFECTIVE")
          .execute() as { column_name: string }[];

        if (searchableFields.length > 0) {
          const pattern = `%${searchTerm}%`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const applySearch = (q: any) => q.where((eb: any) =>
            eb.or(searchableFields.map(({ column_name }) =>
              eb(column_name as never, "ilike", pattern as never),
            )),
          );
          listQuery  = applySearch(listQuery);
          countQuery = applySearch(countQuery);
        } else {
          logger?.warn("records_search_no_searchable_fields", { entityCode, searchTerm });
        }
      }

      // ── Sort ─────────────────────────────────────────────────────────────────
      if (sortFieldName) {
        const sortColumn = fieldMap.get(sortFieldName) ?? sortFieldName;
        listQuery = listQuery.orderBy(sortColumn as never, sortDir as never);
      } else {
        // Default: newest first when no sort requested
        listQuery = listQuery.orderBy("created_at" as never, "desc" as never);
      }

      // ── Execute list + count (parallel) ──────────────────────────────────────
      const [rows, countResult] = await Promise.all([
        listQuery.limit(pageSize).offset(offset).execute(),
        countQuery.executeTakeFirst(),
      ]);

      const total = parseInt(String(countResult?.count ?? "0"), 10);

      // Remap: physical column_name → logical field name
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

      // ── Cheap facets (enum + boolean fields only) ─────────────────────────────
      let facets: Record<string, { value: string; count: number }[]> | undefined;
      if (includeFacets && tenantId) {
        const facetFields = await db
          .selectFrom("control.entity_field as ef")
          .innerJoin("control.entity_version as ev", "ev.id", "ef.entity_version_id")
          .innerJoin("control.entity as e",          "e.id",  "ev.entity_id")
          .select(["ef.name", "ef.column_name"])
          .where("e.name",       "=",  entityCode)
          .where("e.tenant_id",  "is", null)
          .where("ev.status",    "=",  "EFFECTIVE")
          .where("ef.is_active", "=",  true)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .where((eb: any) => eb.or([
            eb("ef.data_type", "=", "enum"),
            eb("ef.data_type", "=", "boolean"),
          ]))
          .execute() as { name: string; column_name: string }[];

        facets = {};
        await Promise.all(
          facetFields.map(async ({ name, column_name }) => {
            const counts = await db
              .selectFrom(fullTable)
              .select([
                column_name   as never,
                db.fn.countAll<string>().as("count") as never,
              ])
              .where("tenant_id" as never, "=", tenantId as never)
              .groupBy(column_name as never)
              .orderBy(db.fn.countAll<string>() as never, "desc" as never)
              .limit(100)
              .execute() as Record<string, string>[];

            facets![name] = counts.map((row) => ({
              value: String(row[column_name] ?? ""),
              count: parseInt(row["count"] ?? "0", 10),
            }));
          }),
        );
      }

      const responseBody: Record<string, unknown> = {
        data: remappedRows,
        pagination: {
          total,
          page,
          page_size: pageSize,
          total_pages: Math.ceil(total / pageSize),
        },
        ...(facets ? { facets } : {}),
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
        data,
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
        // supplier_invoice_number is NOT NULL; default to '' when not provided
        // (entity_field vendor_invoice_ref is optional so the form may omit it)
        if (mappedData["supplier_invoice_number"] === undefined) {
          mappedData["supplier_invoice_number"] = "";
        }
      }

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;
      const row = await db.insertInto(fullTable).values(mappedData as never).returningAll().executeTakeFirst();

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
      }

      res.status(201).json(row);
    } catch (err) {
      logger?.error("records_create_error", { err: String(err) });
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

      // Remap form field names → physical column names
      const fieldMap = await resolveFieldMap(db, entityCode);
      const body = req.body as { data?: Record<string, unknown> };
      const inputData = body.data ?? {};
      const mappedData: Record<string, unknown> = {};
      for (const [fieldName, value] of Object.entries(inputData)) {
        const columnName = fieldMap.get(fieldName);
        if (columnName) mappedData[columnName] = value;
      }

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
        if (["id", "tenant_id", "created_by", "created_at"].includes(columnName)) continue;
        mappedData[columnName] = value;
      }

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
        document_id: r[fkCol]                             ?? r["document_id"],
        line_number: r["line_no"]                         ?? r["line_number"],
        description: r["item_description"]                ?? r["description"],
        unit_code:   r["uom_code"]                        ?? r["unit_code"],
        line_amount: r["gross_amount"] ?? r["net_amount"] ?? r["line_amount"],
        item_code:   r["item_code"]    ?? null,
        tax_code:    r["tax_code"]     ?? null,
        data:        r["metadata"]     ?? r["data"]        ?? {},
      }));

      res.json({ data });
    } catch (err) {
      logger?.error("records_lines_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/records/:entity", listHandler);
  router.get("/records/:entity/_debug", debugHandler);
  // Sub-resource routes must be registered before /:id to avoid shadowing
  router.get("/records/:entity/:id/lines",              linesHandler);
  router.get("/records/:entity/:id/versions",           subResourceStub("versions"));
  router.get("/records/:entity/:id/workflow",           subResourceStub("workflow"));
  router.get("/records/:entity/:id/attachments",        subResourceStub("attachments"));
  router.get("/records/:entity/:id/distributions",      subResourceStub("distributions"));
  router.get("/records/:entity/:id/approvals",          subResourceStub("approvals"));
  router.get("/records/:entity/:id/tasks",              subResourceStub("tasks"));
  router.get("/records/:entity/:id/watchers",           subResourceStub("watchers"));
  router.get("/records/:entity/:id/rules",              subResourceStub("rules"));
  router.get("/records/:entity/:id/integration-events", subResourceStub("integration-events"));
  router.get("/records/:entity/:id/quality",            subResourceStub("quality"));
  router.get("/records/:entity/:id/reports",            subResourceStub("reports"));
  router.get("/records/:entity/:id", getHandler);
  router.post("/records/:entity", createHandler);
  router.put("/records/:entity/:id", updateHandler);
  router.patch("/records/:entity/:id", patchHandler);
  router.delete("/records/:entity/:id", deleteHandler);

  return router;
}
