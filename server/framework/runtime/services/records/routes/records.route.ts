/**
 * Records Routes — CRUD for master entity records
 *
 * GET    /api/records/:entity           — paginated list
 * GET    /api/records/:entity/:id       — single record
 * POST   /api/records/:entity           — create
 * PUT    /api/records/:entity/:id       — update
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
import {
  verifyBearer,
  resolveTenantId,
  SYSTEM_PRINCIPAL_UUID,
  resolvePrincipalIdOrNull,
  resolvePrincipalIdWithJit,
  resolveFieldMap,
} from "@athyper/svc-shared";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveEntityTable(db: Kysely<any>, entityCode: string): Promise<{ table_schema: string; table_name: string } | null> {
  // Normalise URL slug → DB name (journal-entry → journal_entry)
  const name = entityCode.replace(/-/g, "_");
  const row = await db
    .selectFrom("control.entity as e")
    .select(["e.table_schema", "e.table_name"])
    .where("e.name", "=", name)
    .where("e.tenant_id", "is", null)
    .executeTakeFirst();
  if (!row) return null;
  return { table_schema: String(row.table_schema), table_name: String(row.table_name) };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createRecordsRoute(router: Router, deps: RecordsRouteDeps): Router {
  const { db, auth, logger } = deps;

  // ── LIST ──────────────────────────────────────────────────────────────────────
  const listHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = req.params["entity"] as string;
      const table = await resolveEntityTable(db, entityCode);
      if (!table) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query["page_size"] ?? "20"), 10)));
      const offset = (page - 1) * pageSize;

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;

      // Filter by tenant if X-Org is present
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      let listQuery = db.selectFrom(fullTable).selectAll();
      let countQuery = db.selectFrom(fullTable).select(db.fn.countAll<string>().as("count"));

      if (tenantId) {
        listQuery = listQuery.where("tenant_id" as never, "=", tenantId as never);
        countQuery = countQuery.where("tenant_id" as never, "=", tenantId as never);
      }

      const [rows, countResult, fieldMap] = await Promise.all([
        listQuery.limit(pageSize).offset(offset).execute(),
        countQuery.executeTakeFirst(),
        resolveFieldMap(db, entityCode),
      ]);

      const total = parseInt(String(countResult?.count ?? "0"), 10);

      // Remap each row: physical column_name → logical field name
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

      res.json({
        data: remappedRows,
        pagination: {
          total,
          page,
          page_size: pageSize,
          total_pages: Math.ceil(total / pageSize),
        },
      });
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
      const row = await db.selectFrom(fullTable).selectAll().where("id" as never, "=", id as never).executeTakeFirst();

      if (!row) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      // Build a reverse map: physical column_name → logical field name
      // so the detail page can access data[field.name] correctly.
      const fieldMap = await resolveFieldMap(db, entityCode);
      const reverseMap = new Map<string, string>();
      for (const [fieldName, columnName] of fieldMap.entries()) {
        reverseMap.set(columnName, fieldName);
      }

      // Remap DB row keys: column_name → field_name
      const rowData = row as Record<string, unknown>;
      const data: Record<string, unknown> = {};
      for (const [col, val] of Object.entries(rowData)) {
        const fieldName = reverseMap.get(col) ?? col;
        data[fieldName] = val;
      }

      res.json({
        id: rowData.id,
        entity_code: entityCode,
        tenant_id: rowData.tenant_id,
        status: rowData.status,
        is_active: rowData.is_active,
        created_at: rowData.created_at,
        created_by: rowData.created_by,
        updated_at: rowData.updated_at ?? null,
        updated_by: rowData.updated_by ?? null,
        status_changed_at: rowData.status_changed_at ?? null,
        status_changed_by: rowData.status_changed_by ?? null,
        data,
      });
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
        if (columnName) {
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

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;
      const row = await db.insertInto(fullTable).values(mappedData as never).returningAll().executeTakeFirst();

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

      // Remap form field names → physical column names
      const fieldMap = await resolveFieldMap(db, entityCode);
      const body = req.body as { data?: Record<string, unknown> };
      const inputData = body.data ?? {};
      const mappedData: Record<string, unknown> = {};
      for (const [fieldName, value] of Object.entries(inputData)) {
        const columnName = fieldMap.get(fieldName);
        if (columnName) {
          mappedData[columnName] = value;
        }
      }

      // Resolve tenant + principal for tenant isolation and audit (updated_by FK → master.principal)
      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;

      mappedData.updated_by = principalId ?? undefined;
      mappedData.updated_at = new Date().toISOString();

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await (db.updateTable(fullTable) as any)
        .set(mappedData)
        .where("id", "=", id)
        .where("tenant_id", "=", tenantId)
        .returningAll()
        .executeTakeFirst();

      if (!row) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      res.json(row);
    } catch (err) {
      logger?.error("records_update_error", { err: String(err) });
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

      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${id}' not found` });
        return;
      }

      const fullTable = `${table.table_schema}.${table.table_name}` as `${string}.${string}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db.deleteFrom(fullTable) as any)
        .where("id", "=", id)
        .where("tenant_id", "=", tenantId)
        .execute();

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

      const entityCode = req.params["entity"] as string;
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

  router.get("/records/:entity", listHandler);
  router.get("/records/:entity/_debug", debugHandler);
  router.get("/records/:entity/:id", getHandler);
  router.post("/records/:entity", createHandler);
  router.put("/records/:entity/:id", updateHandler);
  router.delete("/records/:entity/:id", deleteHandler);

  return router;
}
