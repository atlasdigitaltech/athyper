/**
 * Documents Routes — CRUD + lifecycle for document entities (invoices, POs, etc.)
 *
 * GET    /api/documents/:docType           — paginated list
 * GET    /api/documents/:docType/:id       — document detail (header + lines)
 * POST   /api/documents/:docType           — create document
 * POST   /api/documents/:docType/:id/transition — status transition
 *
 * Document entities are resolved from control.entity WHERE entity_class = 'DOCUMENT'.
 * Tries exact name match first, then common P2P prefixes (purchase_, sales_, etc.)
 * so that URL slug "invoice" resolves to entity name "purchase_invoice".
 *
 * Line items are read from the convention table: {table_name}_line
 * (e.g. document.purchase_invoice → document.purchase_invoice_line)
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { Queue } from "bullmq";
import type { ObjectStorageAdapter } from "@athyper/adapter-object-storage";
import type { ExtractTextJobData, SweepJobData } from "@athyper/svc-jobs";
import { registerAttachmentRoutes } from "./attachments.route.js";
import { registerFolderRoutes } from "./folder.route.js";
import { resolveDocumentEntity } from "./entity-resolver.js";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  SYSTEM_PRINCIPAL_UUID,
  resolvePrincipalIdWithJit,
  resolvePrincipalIdOrNull,
  resolveFieldMap,
  emitOutboxEvent,
} from "@athyper/svc-shared";

export interface DocumentsRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  /** Reads the tenant identity established by the authenticated host boundary. */
  readAuthenticatedContext?: (req: Parameters<RequestHandler>[0]) => {
    tenantId?: string;
  } | undefined;
  objectStorage?: {
    adapter: ObjectStorageAdapter;
    bucket:  string;
  };
  /** BullMQ queue for Tika text extraction; forwarded to attachment routes. */
  tikaQueue?: Queue<ExtractTextJobData | SweepJobData>;
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Company code resolver ─────────────────────────────────────────────────────

/**
 * Resolves master.company_code.id from the X-Org header second segment.
 * X-Org format: "{tenantCode}--{companyCode}" (e.g. "athyper--ACFB").
 * Falls back to the first active company code for the tenant.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveCompanyCodeId(db: Kysely<any>, xOrg: string, tenantId: string): Promise<string | null> {
  const companyCodeHint = xOrg.split("--")[1] ?? null;

  if (companyCodeHint) {
    const row = await db
      .selectFrom("master.company_code as cc")
      .select("cc.id")
      .where("cc.code", "=", companyCodeHint)
      .where("cc.tenant_id", "=", tenantId)
      .executeTakeFirst();
    if (row) return row.id as string;
  }

  // Fallback: first active company code for the tenant
  const fallback = await db
    .selectFrom("master.company_code as cc")
    .select("cc.id")
    .where("cc.tenant_id", "=", tenantId)
    .where("cc.status" as never, "=", "active" as never)
    .orderBy("cc.code" as never, "asc")
    .executeTakeFirst();

  return fallback ? (fallback.id as string) : null;
}

// ── Build canonical DocumentHeader from a remapped row ────────────────────────

// Logical field name patterns → canonical DocumentHeader fields
const DOCUMENT_NUMBER_KEYS = new Set(["document_number", "document_no", "invoice_number", "order_number", "receipt_number", "requisition_number"]);
const PARTY_ID_KEYS        = new Set(["party_id", "supplier_id", "vendor_id", "customer_id", "requestor_id"]);
const PARTY_NAME_KEYS      = new Set(["party_name", "supplier_name", "vendor_name", "customer_name"]);
const DOCUMENT_DATE_KEYS   = new Set(["document_date", "invoice_date", "order_date", "receipt_date", "request_date"]);
const TOTAL_AMOUNT_KEYS    = new Set(["total_amount", "gross_amount", "document_amount", "net_payable"]);
const TAX_AMOUNT_KEYS      = new Set(["tax_amount"]);

// System columns excluded from data{}
const SYSTEM_COLS = new Set([
  "id", "tenant_id", "status", "is_active",
  "status_changed_at", "status_changed_by",
  "created_at", "created_by", "updated_at", "updated_by",
]);

function exposeDocumentIdentityAliases(
  row: Record<string, unknown>,
  primaryKey: string,
  tenantColumn: string | null,
): Record<string, unknown> {
  const out = { ...row };
  if (out["id"] === undefined && out[primaryKey] !== undefined) out["id"] = out[primaryKey];
  if (tenantColumn && out["tenant_id"] === undefined && out[tenantColumn] !== undefined) {
    out["tenant_id"] = out[tenantColumn];
  }
  return out;
}

function buildDocumentHeader(
  row: Record<string, unknown>,
  reverseMap: Map<string, string>,
  entityName: string,
  primaryKey = "id",
  tenantColumn: string | null = "tenant_id",
) {
  let document_number = "";
  let party_id: string | null = null;
  let party_name: string | null = null;
  let document_date: string = new Date().toISOString();
  let posting_date: string | null = null;
  let due_date: string | null = null;
  let currency_code = "USD";
  let total_amount_num: number | null = null;
  let tax_amount_num: number | null = null;
  const data: Record<string, unknown> = {};

  for (const [col, val] of Object.entries(row)) {
    const fieldName = reverseMap.get(col) ?? col;

    if (SYSTEM_COLS.has(fieldName) || SYSTEM_COLS.has(col) || fieldName === primaryKey || col === primaryKey) continue;

    if (DOCUMENT_NUMBER_KEYS.has(fieldName)) {
      document_number = String(val ?? "");
    } else if (PARTY_ID_KEYS.has(fieldName)) {
      party_id = (val as string) ?? null;
    } else if (PARTY_NAME_KEYS.has(fieldName)) {
      party_name = (val as string) ?? null;
    } else if (DOCUMENT_DATE_KEYS.has(fieldName)) {
      document_date = val ? new Date(String(val)).toISOString() : document_date;
    } else if (fieldName === "posting_date") {
      posting_date = val ? new Date(String(val)).toISOString() : null;
    } else if (fieldName === "due_date") {
      due_date = val ? new Date(String(val)).toISOString() : null;
    } else if (fieldName === "currency_code") {
      currency_code = String(val ?? "USD");
    } else if (TOTAL_AMOUNT_KEYS.has(fieldName) && val != null) {
      total_amount_num = Number(val);
    } else if (TAX_AMOUNT_KEYS.has(fieldName) && val != null) {
      tax_amount_num = Number(val);
    } else {
      data[fieldName] = val;
    }
  }

  return {
    id:              row[primaryKey] as string,
    tenant_id:       tenantColumn ? (row[tenantColumn] as string) : null,
    document_type:   entityName,
    document_number,
    status:          String(row.status ?? "draft"),
    is_active:       Boolean(row.is_active ?? true),
    document_date,
    posting_date,
    due_date,
    party_id,
    party_name,
    currency_code,
    total_amount:    total_amount_num != null ? { amount: total_amount_num, currency_code } : null,
    tax_amount:      tax_amount_num   != null ? { amount: tax_amount_num,   currency_code } : null,
    data,
    created_at:        row.created_at as string,
    created_by:        row.created_by as string,
    updated_at:        (row.updated_at  ?? null) as string | null,
    updated_by:        (row.updated_by  ?? null) as string | null,
    status_changed_at: (row.status_changed_at ?? null) as string | null,
    status_changed_by: (row.status_changed_by ?? null) as string | null,
  };
}

// ── Build canonical DocumentLine from a raw DB row ────────────────────────────

const LINE_NUMBER_KEYS  = ["line_no", "line_number", "seq_no", "sequence_no"];
const DESCRIPTION_KEYS  = ["description", "item_description", "line_description", "goods_description"];
const QUANTITY_KEYS     = ["quantity", "qty", "ordered_quantity", "received_quantity"];
const UNIT_CODE_KEYS    = ["uom_code", "unit_code", "unit_of_measure", "uom"];
const UNIT_PRICE_KEYS   = ["unit_price", "price_per_unit"];
const LINE_AMOUNT_KEYS  = ["net_amount", "line_amount", "extended_amount", "gross_amount"];
const TAX_CODE_KEYS     = ["tax_group_id", "tax_code", "tax_group_code"];
const LINE_TAX_KEYS     = ["tax_amount"];

function firstValue(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
  }
  return null;
}

// Known columns consumed by canonical mapping — rest go into data{}
const LINE_KNOWN = new Set([
  "id", "tenant_id", "created_at", "created_by", "updated_at", "updated_by",
  "status", "is_active", "item_id",
  ...LINE_NUMBER_KEYS, ...DESCRIPTION_KEYS, ...QUANTITY_KEYS, ...UNIT_CODE_KEYS,
  ...UNIT_PRICE_KEYS, ...LINE_AMOUNT_KEYS, ...TAX_CODE_KEYS, ...LINE_TAX_KEYS,
]);

function buildDocumentLine(row: Record<string, unknown>, documentId: string) {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!LINE_KNOWN.has(k) && !k.endsWith("_id")) data[k] = v;
  }

  return {
    id:          row.id as string,
    document_id: documentId,
    line_number: Number(firstValue(row, LINE_NUMBER_KEYS) ?? 0),
    item_code:   (row.item_id as string) ?? null,
    description: (firstValue(row, DESCRIPTION_KEYS) as string) ?? null,
    quantity:    firstValue(row, QUANTITY_KEYS) != null ? Number(firstValue(row, QUANTITY_KEYS)) : null,
    unit_code:   (firstValue(row, UNIT_CODE_KEYS) as string) ?? null,
    unit_price:  firstValue(row, UNIT_PRICE_KEYS) != null ? Number(firstValue(row, UNIT_PRICE_KEYS)) : null,
    line_amount: firstValue(row, LINE_AMOUNT_KEYS) != null ? Number(firstValue(row, LINE_AMOUNT_KEYS)) : null,
    tax_code:    (firstValue(row, TAX_CODE_KEYS) as string) ?? null,
    tax_amount:  firstValue(row, LINE_TAX_KEYS) != null ? Number(firstValue(row, LINE_TAX_KEYS)) : null,
    data,
    created_at:  row.created_at as string,
    created_by:  row.created_by as string,
    updated_at:  (row.updated_at ?? null) as string | null,
    updated_by:  (row.updated_by ?? null) as string | null,
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createDocumentsRoute(router: Router, deps: DocumentsRouteDeps): Router {
  const { db, auth, logger } = deps;

  // ── LIST ──────────────────────────────────────────────────────────────────────
  const listHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const docType = req.params["docType"] as string;
      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Document type '${docType}' not found` });
        return;
      }

      const page     = Math.max(1, parseInt(String(req.query["page"]      ?? "1"),  10));
      const pageSize = Math.min(500, Math.max(1, parseInt(String(req.query["page_size"] ?? "20"), 10)));
      const offset   = (page - 1) * pageSize;

      const fullTable = `${entity.table_schema as string}.${entity.table_name as string}` as `${string}.${string}`;
      const tenantColumn = (entity.tenant_column as string | null) ?? null;

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      let listQuery  = db.selectFrom(fullTable).selectAll();
      let countQuery = db.selectFrom(fullTable).select(db.fn.countAll<string>().as("count"));

      if (tenantId && tenantColumn) {
        listQuery  = listQuery.where(tenantColumn as never, "=", tenantId as never);
        countQuery = countQuery.where(tenantColumn as never, "=", tenantId as never);
      }

      const [rows, countResult, fieldMap] = await Promise.all([
        listQuery.limit(pageSize).offset(offset).execute(),
        countQuery.executeTakeFirst(),
        resolveFieldMap(db, entity.name as string),
      ]);

      const total = parseInt(String(countResult?.count ?? "0"), 10);

      // Remap physical → logical names for list rows
      const reverseMap = new Map<string, string>();
      for (const [fieldName, columnName] of fieldMap.entries()) {
        reverseMap.set(columnName, fieldName);
      }
      const remappedRows = (rows as Record<string, unknown>[]).map((row) => {
        const out: Record<string, unknown> = {};
        for (const [col, val] of Object.entries(row)) {
          out[reverseMap.get(col) ?? col] = val;
        }
        return exposeDocumentIdentityAliases(
          out,
          String(entity.primary_key ?? "id"),
          (entity.tenant_column as string | null) ?? null,
        );
      });

      res.json({
        data: remappedRows,
        pagination: { total, page, page_size: pageSize, total_pages: Math.ceil(total / pageSize) },
      });
    } catch (err) {
      logger?.error("documents_list_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET DETAIL ────────────────────────────────────────────────────────────────
  const getHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const docType = req.params["docType"] as string;
      const id      = req.params["id"]      as string;

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Document type '${docType}' not found` });
        return;
      }

      const primaryKey = String(entity.primary_key ?? "id");
      if (!id || (primaryKey === "id" && !isUuid(id))) {
        res.status(404).json({ error: "DOCUMENT_NOT_FOUND", message: `Document '${id}' not found` });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      const tenantColumn = (entity.tenant_column as string | null) ?? null;
      if (tenantColumn && !tenantId) {
        res.status(404).json({ error: "DOCUMENT_NOT_FOUND", message: `Document '${id}' not found` });
        return;
      }

      const fullTable  = `${entity.table_schema as string}.${entity.table_name as string}`  as `${string}.${string}`;
      const linesTable = `${entity.table_schema as string}.${entity.table_name as string}_line` as `${string}.${string}`;

      const [row, fieldMap] = await Promise.all([
        db.selectFrom(fullTable).selectAll()
          .where(primaryKey as never, "=", id as never)
          .$if(Boolean(tenantColumn && tenantId), (query) => query.where(tenantColumn as never, "=", tenantId as never))
          .executeTakeFirst(),
        resolveFieldMap(db, entity.name as string),
      ]);

      if (!row) {
        res.status(404).json({ error: "DOCUMENT_NOT_FOUND", message: `Document '${id}' not found` });
        return;
      }

      // Build reverse map: physical column_name → logical field name
      const reverseMap = new Map<string, string>();
      for (const [fieldName, columnName] of fieldMap.entries()) {
        reverseMap.set(columnName, fieldName);
      }

      const header = buildDocumentHeader(row as Record<string, unknown>, reverseMap, entity.name as string, primaryKey, tenantColumn);

      // Query lines (table by convention: {table_name}_line, FK: {table_name}_id)
      const linesFkCol = `${entity.table_name as string}_id`;
      let lineRows: Record<string, unknown>[] = [];
      try {
        lineRows = await db
          .selectFrom(linesTable)
          .selectAll()
          .where(linesFkCol as never, "=", id as never)
          .$if(Boolean(tenantColumn && tenantId), (query) => query.where(tenantColumn as never, "=", tenantId as never))
          .orderBy("line_no" as never, "asc")
          .execute() as Record<string, unknown>[];
      } catch (e) {
        // Lines table may not exist for this document type — silently skip
        // Rethrow if it's not a "relation does not exist" error (42P01)
        if ((e as { code?: string }).code !== "42P01") throw e;
      }

      const lines = lineRows.map((lr) => buildDocumentLine(lr, id));

      res.json({ header, lines, line_count: lines.length });
    } catch (err) {
      logger?.error("documents_get_error", { err: String(err) });
      next(err);
    }
  };

  // ── CREATE ────────────────────────────────────────────────────────────────────
  const createHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const docType = req.params["docType"] as string;
      const entity  = await resolveDocumentEntity(db, docType);
      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Document type '${docType}' not found` });
        return;
      }
      if (["none", "append_only"].includes(String(entity.write_capability ?? "none"))) {
        res.status(405).json({ error: "ENTITY_NOT_WRITABLE", message: `Entity '${entity.name as string}' does not allow document creation.` });
        return;
      }

      const fieldMap  = await resolveFieldMap(db, entity.name as string);
      const body      = req.body as { data?: Record<string, unknown> };
      const inputData = body.data ?? {};
      const mappedData: Record<string, unknown> = {};

      for (const [fieldName, value] of Object.entries(inputData)) {
        const columnName = fieldMap.get(fieldName);
        if (columnName) mappedData[columnName] = value;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      const tenantColumn = (entity.tenant_column as string | null) ?? null;
      if (tenantColumn && !tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "Could not resolve tenant from session" });
        return;
      }
      if (tenantColumn && tenantId) mappedData[tenantColumn] = tenantId;

      // ── Auto-inject system columns not captured in the form ───────────────

      // company_code_id — from X-Org second segment (e.g. "athyper--ACFB")
      if (!mappedData.company_code_id && tenantId) {
        const companyCodeId = await resolveCompanyCodeId(db, xOrg, tenantId);
        if (companyCodeId) {
          mappedData.company_code_id = companyCodeId;

          // base_currency_code — functional currency of the company code
          if (!mappedData.base_currency_code) {
            const cc = await db
              .selectFrom("master.company_code as cc")
              .select("cc.functional_currency")
              .where("cc.id", "=", companyCodeId)
              .executeTakeFirst();
            mappedData.base_currency_code = (cc as Record<string, unknown> | undefined)?.functional_currency ?? mappedData.currency_code ?? "USD";
          }
        }
      }

      // invoice_source — default to non_po; normalise to lowercase (all DB check constraints
      // and lookup domain codes use lowercase: 'po_based', 'contract_based', 'non_po', etc.)
      if (!mappedData.invoice_source) {
        mappedData.invoice_source = "non_po";
      } else {
        mappedData.invoice_source = String(mappedData.invoice_source).toLowerCase();
      }

      // invoice_type — normalize to lowercase to match pi_invoice_type_chk constraint.
      if (mappedData.invoice_type) {
        mappedData.invoice_type = String(mappedData.invoice_type).toLowerCase();
      }

      // supplier_invoice_date — default to document_date if not provided
      if (!mappedData.supplier_invoice_date) {
        mappedData.supplier_invoice_date = mappedData.document_date ?? new Date().toISOString().slice(0, 10);
      }

      // supplier_invoice_number — required for non-proforma invoices.
      // Return 422 instead of letting the DB constraint bubble up as a raw error.
      if (!mappedData.supplier_invoice_number || String(mappedData.supplier_invoice_number).trim() === "") {
        if (mappedData.status !== "proforma") {
          res.status(422).json({
            error: "VALIDATION_ERROR",
            errors: [{ field: "supplier_invoice_number", message: "Supplier Invoice Number is required" }],
          });
          return;
        }
        delete mappedData.supplier_invoice_number;
      }

      // fiscal_year + period_number — derived from document_date
      if (!mappedData.fiscal_year || !mappedData.period_number) {
        const docDate = mappedData.document_date
          ? new Date(String(mappedData.document_date))
          : new Date();
        if (!mappedData.fiscal_year)    mappedData.fiscal_year    = docDate.getFullYear();
        if (!mappedData.period_number)  mappedData.period_number  = docDate.getMonth() + 1;
      }

      // created_by — resolve principal from JWT sub
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub && tenantId
        ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims)
        : SYSTEM_PRINCIPAL_UUID;
      if (!mappedData.created_by) mappedData.created_by = principalId;

      const fullTable = `${entity.table_schema as string}.${entity.table_name as string}` as `${string}.${string}`;
      const row = await db.insertInto(fullTable).values(mappedData as never).returningAll().executeTakeFirst();

      // Emit search-topic outbox event — best-effort; must not fail the request.
      // The generic search outbox handler routes this to Meilisearch via
      // control.entity lookup → defaultRowToSearchDocument → optional override.
      if (row && tenantId) {
        try {
          await emitOutboxEvent(db, {
            tenantId,
            topic:      "search",
            eventType:  `${entity.name as string}.created`,
            entityType: entity.name as string,
            entityId:   String((row as Record<string, unknown>)[String(entity.primary_key ?? "id")]),
            actorId:    principalId,
          });
        } catch (emitErr) {
          logger?.warn("documents_emit_search_failed", {
            entity: entity.name as string,
            err:    emitErr instanceof Error ? emitErr.message : String(emitErr),
          });
        }
      }

      res.status(201).json(exposeDocumentIdentityAliases(
        row as Record<string, unknown>,
        String(entity.primary_key ?? "id"),
        (entity.tenant_column as string | null) ?? null,
      ));
    } catch (err) {
      logger?.error("documents_create_error", { err: String(err) });
      next(err);
    }
  };

  // ── STATUS TRANSITION ─────────────────────────────────────────────────────────
  const transitionHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const docType = req.params["docType"] as string;
      const id      = req.params["id"]      as string;

      const entity = await resolveDocumentEntity(db, docType);
      if (!entity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Document type '${docType}' not found` });
        return;
      }
      const primaryKey = String(entity.primary_key ?? "id");
      if (!id || (primaryKey === "id" && !isUuid(id))) {
        res.status(404).json({ error: "DOCUMENT_NOT_FOUND", message: `Document '${id}' not found` });
        return;
      }
      if (["none", "append_only"].includes(String(entity.write_capability ?? "none"))) {
        res.status(405).json({ error: "ENTITY_NOT_WRITABLE", message: `Entity '${entity.name as string}' does not allow status transitions.` });
        return;
      }

      const body = req.body as { to_status?: string; remarks?: string };
      if (!body.to_status) {
        res.status(400).json({ error: "MISSING_STATUS", message: "to_status is required" });
        return;
      }

      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      const tenantColumn = (entity.tenant_column as string | null) ?? null;
      if (tenantColumn && !tenantId) {
        res.status(404).json({ error: "DOCUMENT_NOT_FOUND", message: `Document '${id}' not found` });
        return;
      }

      const fullTable = `${entity.table_schema as string}.${entity.table_name as string}` as `${string}.${string}`;
      const row = await db
        .updateTable(fullTable)
        .set({ status: body.to_status, updated_at: new Date().toISOString() } as never)
        .where(String(entity.primary_key ?? "id") as never, "=", id as never)
        .$if(Boolean(tenantColumn && tenantId), (query) => query.where(tenantColumn as never, "=", tenantId as never))
        .returningAll()
        .executeTakeFirst();

      if (!row) {
        res.status(404).json({ error: "DOCUMENT_NOT_FOUND", message: `Document '${id}' not found` });
        return;
      }

      // Resolve principal for emission audit — transition handler doesn't
      // record updated_by on the row today, but the outbox event still
      // captures who triggered the change.
      const transSub = typeof claims.sub === "string" ? claims.sub : "";
      const transPrincipalId = transSub && tenantId
        ? await resolvePrincipalIdOrNull(db, transSub, tenantId, xRealm)
        : null;

      if (tenantId) try {
        await emitOutboxEvent(db, {
          tenantId,
          topic:      "search",
          eventType:  `${entity.name as string}.updated`,
          entityType: entity.name as string,
          entityId:   id,
          actorId:    transPrincipalId ?? SYSTEM_PRINCIPAL_UUID,
          payload:    { to_status: body.to_status },
        });
      } catch (emitErr) {
        logger?.warn("documents_emit_search_failed", {
          entity: entity.name as string,
          err:    emitErr instanceof Error ? emitErr.message : String(emitErr),
        });
      }

      res.status(200).json({ ok: true, status: (row as Record<string, unknown>).status });
    } catch (err) {
      // Detect DB-level workflow gate (trg_je_workflow_gate raises P0001 with
      // 'WORKFLOW_GATE:' prefix). Surface as 409 instead of 500.
      const pgErr = err as { code?: string; message?: string };
      if (pgErr.code === "P0001" && pgErr.message?.startsWith("WORKFLOW_GATE")) {
        res.status(409).json({
          error:   "WORKFLOW_GATE",
          message: pgErr.message,
          hint:    "Submit the document for approval first using the /submit endpoint, then post once the workflow is approved.",
        });
        return;
      }
      logger?.error("documents_transition_error", { err: String(err) });
      next(err);
    }
  };

  // Folder + attachment routes — more specific paths registered first
  registerFolderRoutes(router, { db, auth, logger });
  registerAttachmentRoutes(router, deps);

  router.get("/documents/:docType",                 listHandler);
  router.get("/documents/:docType/:id",             getHandler);
  router.post("/documents/:docType",                createHandler);
  router.post("/documents/:docType/:id/transition", transitionHandler);

  return router;
}
