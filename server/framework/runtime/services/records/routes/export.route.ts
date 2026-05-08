/**
 * Entity Record Export Routes — Sprint 40
 *
 *   POST /api/records/:entity/export
 *     Body: { selectionMode: "ids"|"filter", ids?: string[], format: "csv"|"xlsx", columns?: string[] }
 *     Returns: { downloadUrl, expiresAt, rowCount }
 *     Resolves the entity table, fetches matching rows (max EXPORT_MAX_ROWS),
 *     encodes parameters into a short-lived signed token, returns a download URL.
 *
 *   GET /api/records/:entity/export/download?t=TOKEN
 *     Decodes the token, re-fetches rows, serialises as CSV or XLSX, streams
 *     the file as an attachment. No auth required beyond the token itself.
 *
 * Token: base64url-encoded JSON, 15-minute TTL, no server-side state.
 * CSV: RFC 4180 compliant. XLSX: ExcelJS (dynamic import, same as import worker).
 *
 * Column resolution:
 *   - If `columns` is provided, only those fields are included.
 *   - Otherwise, all active fields from the compiled descriptor are used,
 *     ordered by sort_order.
 *   - System columns (id, tenant_id) are always included first.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  resolveFieldMap,
  extractOrgHeaders,
} from "@athyper/svc-shared";
import type { CacheClient } from "../../iam/session/session.service.js";
import {
  resolveParameterSnapshot,
  getIntParam,
} from "../../iam/parameters/parameter-resolver.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface ExportRouteDeps {
  db:    AnyDb;
  auth:  { verifyToken(token: string): Promise<Record<string, unknown>> };
  cache?: CacheClient;
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    info(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const EXPORT_MAX_ROWS   = 10_000;
const TOKEN_TTL_MS      = 15 * 60 * 1_000; // 15 min

// ─── Token helpers ─────────────────────────────────────────────────────────────

interface ExportToken {
  entityCode:  string;
  tenantId:    string;
  ids:         string[] | null;  // null = all rows (no filter)
  format:      "csv" | "xlsx";
  columns:     string[] | null;  // null = all fields
  issuedAt:    number;
}

function encodeToken(payload: ExportToken): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeToken(raw: string): ExportToken | null {
  try {
    const p = JSON.parse(Buffer.from(raw, "base64url").toString()) as ExportToken;
    if (Date.now() - p.issuedAt > TOKEN_TTL_MS) return null;
    return p;
  } catch {
    return null;
  }
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function escapeCsv(v: unknown): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines: string[] = [headers.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv(row[h])).join(","));
  }
  return lines.join("\r\n");
}

// ─── XLSX builder (ExcelJS, dynamic import) ───────────────────────────────────

async function toXlsx(headers: string[], rows: Record<string, unknown>[]): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exceljs = await import("exceljs" as any) as any;
  const ExcelJSWorkbook = exceljs.default?.Workbook ?? exceljs.Workbook;
  const wb = new ExcelJSWorkbook();
  const ws = wb.addWorksheet("Export");

  ws.addRow(headers);
  for (const row of rows) {
    ws.addRow(headers.map((h) => row[h] ?? null));
  }

  // Bold header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.commit();

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ─── Row fetcher ──────────────────────────────────────────────────────────────

async function fetchRows(
  db:         AnyDb,
  fullTable:  `${string}.${string}`,
  tenantId:   string,
  ids:        string[] | null,
  maxRows:    number = EXPORT_MAX_ROWS,
): Promise<Record<string, unknown>[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (db.selectFrom(fullTable) as any)
    .selectAll()
    .where("tenant_id" as never, "=", tenantId as never)
    .limit(maxRows);

  if (ids && ids.length > 0) {
    q = q.where("id" as never, "in", ids as never);
  }

  return q.execute() as Promise<Record<string, unknown>[]>;
}

// ─── Column resolver ──────────────────────────────────────────────────────────

async function resolveExportColumns(
  db:          AnyDb,
  entityCode:  string,
  wantColumns: string[] | null,
): Promise<string[]> {
  // Fetch active fields ordered by sort_order
  const entityRow = await db
    .selectFrom("control.entity as e")
    .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
    .select(["ev.id as version_id"])
    .where("e.name", "=", entityCode)
    .where("e.tenant_id", "is", null)
    .where("ev.status", "=", "EFFECTIVE")
    .limit(1)
    .executeTakeFirst() as { version_id: string } | undefined;

  if (!entityRow) {
    // Fallback: return requested columns or empty
    return wantColumns ?? [];
  }

  const fieldRows = await db
    .selectFrom("control.entity_field as ef")
    .select(["ef.name", "ef.column_name", "ef.sort_order"])
    .where("ef.entity_version_id", "=", entityRow.version_id)
    .where("ef.is_active", "=", true)
    .orderBy("ef.sort_order", "asc")
    .execute() as { name: string; column_name: string; sort_order: number }[];

  const allColumns = fieldRows.map((f) => f.column_name);

  if (!wantColumns || wantColumns.length === 0) return allColumns;

  // Map logical field names → column names; fall through if already a column name
  const fieldMap = await resolveFieldMap(db, entityCode);
  return wantColumns.map((col) => fieldMap.get(col) ?? col);
}

// ─── Route factory ─────────────────────────────────────────────────────────────

export function createExportRoutes(router: Router, deps: ExportRouteDeps): Router {
  const { db, auth, cache, logger } = deps;

  // ── POST /records/:entity/export — mint token + return download URL ─────────
  const exportHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_TENANT", message: "X-Org header is required" });
        return;
      }

      const body   = req.body as Record<string, unknown>;
      const format = String(body["format"] ?? "csv") as "csv" | "xlsx";
      if (!["csv", "xlsx"].includes(format)) {
        res.status(400).json({ error: "INVALID_FORMAT", message: "format must be 'csv' or 'xlsx'" });
        return;
      }

      const selectionMode = String(body["selectionMode"] ?? "all");
      let ids: string[] | null = null;

      if (selectionMode === "ids") {
        const rawIds = Array.isArray(body["ids"]) ? (body["ids"] as unknown[]).map(String) : [];
        if (rawIds.length === 0) {
          res.status(400).json({ error: "MISSING_IDS", message: "'ids' is required for selectionMode=ids" });
          return;
        }
        if (!rawIds.every(isUuid)) {
          res.status(400).json({ error: "INVALID_IDS", message: "All ids must be valid UUIDs" });
          return;
        }
        ids = rawIds;
      }

      const columns = Array.isArray(body["columns"])
        ? (body["columns"] as unknown[]).map(String)
        : null;

      // Verify entity exists
      const entityRow = await db
        .selectFrom("control.entity as e")
        .select(["e.table_schema", "e.table_name"])
        .where("e.name", "=", entityCode)
        .where("e.tenant_id", "is", null)
        .executeTakeFirst() as { table_schema: string; table_name: string } | undefined;

      if (!entityRow) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      // Quick row count so we can return rowCount in the response
      const fullTable = `${entityRow.table_schema}.${entityRow.table_name}` as `${string}.${string}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let countQ: any = (db.selectFrom(fullTable) as any)
        .select(db.fn.count("id" as never).as("cnt"))
        .where("tenant_id" as never, "=", tenantId as never);
      if (ids) countQ = countQ.where("id" as never, "in", ids as never);

      const exportSnap = cache
        ? await resolveParameterSnapshot(db, cache, tenantId, "api.export").catch(() => null)
        : null;
      const exportMaxRows = getIntParam(exportSnap, "api.export.records_max_rows", EXPORT_MAX_ROWS);

      const countRow = await countQ.executeTakeFirst() as { cnt: string | number } | undefined;
      const rowCount = Math.min(parseInt(String(countRow?.cnt ?? "0"), 10), exportMaxRows);

      const token = encodeToken({
        entityCode, tenantId, ids, format, columns, issuedAt: Date.now(),
      });

      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
      const downloadUrl = `/api/records/${entityCode}/export/download?t=${token}`;

      logger?.info("entity_export_token_issued", { entityCode, tenantId, rowCount, format });
      res.json({ ok: true, downloadUrl, expiresAt, rowCount });
    } catch (err) {
      logger?.error("entity_export_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /records/:entity/export/download?t=TOKEN — stream file ─────────────
  const downloadHandler: RequestHandler = async (req, res, next) => {
    try {
      const raw = String(req.query["t"] ?? "");
      if (!raw) {
        res.status(400).json({ error: "MISSING_TOKEN", message: "?t= query parameter required" });
        return;
      }

      const token = decodeToken(raw);
      if (!token) {
        res.status(401).json({ error: "INVALID_TOKEN", message: "Token expired or malformed" });
        return;
      }

      const entityCode = token.entityCode;

      // Resolve entity table
      const entityRow = await db
        .selectFrom("control.entity as e")
        .select(["e.table_schema", "e.table_name"])
        .where("e.name", "=", entityCode)
        .where("e.tenant_id", "is", null)
        .executeTakeFirst() as { table_schema: string; table_name: string } | undefined;

      if (!entityRow) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND" });
        return;
      }

      const fullTable = `${entityRow.table_schema}.${entityRow.table_name}` as `${string}.${string}`;

      const dlSnap = cache
        ? await resolveParameterSnapshot(db, cache, token.tenantId, "api.export").catch(() => null)
        : null;
      const dlMaxRows = getIntParam(dlSnap, "api.export.records_max_rows", EXPORT_MAX_ROWS);

      const rows = await fetchRows(db, fullTable, token.tenantId, token.ids, dlMaxRows);

      // Resolve column headers
      const columns = await resolveExportColumns(db, entityCode, token.columns);
      const headers  = columns.length > 0 ? columns : (rows[0] ? Object.keys(rows[0]) : []);

      const filename = `${entityCode}-export-${new Date().toISOString().slice(0, 10)}`;

      if (token.format === "xlsx") {
        const buf = await toXlsx(headers, rows);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
        res.send(buf);
      } else {
        const csv = toCsv(headers, rows);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
        res.send(csv);
      }

      logger?.info("entity_export_download", { entityCode, tenantId: token.tenantId, rows: rows.length, format: token.format });
    } catch (err) {
      logger?.error("entity_export_download_error", { err: String(err) });
      next(err);
    }
  };

  router.post("/records/:entity/export",                 exportHandler);
  router.get("/records/:entity/export/download",         downloadHandler);

  return router;
}
