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

        // Auto-generate the system document number when the wizard doesn't supply one.
        // Each document type has its own NOT NULL number column; a short random suffix
        // keeps it unique within the tenant without a DB sequence.
        const DOC_NUMBER_COLS: Record<string, { col: string; prefix: string }> = {
          purchase_invoice: { col: "invoice_number",    prefix: "PI"  },
          journal_entry:    { col: "je_number",         prefix: "JE"  },
          purchase_order:   { col: "commitment_number", prefix: "PO"  },
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

  // ── Helpers shared by line mutation handlers ─────────────────────────────────

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
  router.get("/records/:entity/:id/versions",           subResourceStub("versions"));
  router.get("/records/:entity/:id/workflow",           subResourceStub("workflow"));
  router.get("/records/:entity/:id/attachments",        subResourceStub("attachments"));
  router.get("/records/:entity/:id/distributions",      distributionsHandler);
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
