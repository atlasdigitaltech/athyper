/**
 * Entity Record Export Routes — Sprint 40 (hardened Sprint security review)
 *
 *   POST /api/records/:entity/export
 *     Body: { selectionMode: "ids"|"filter", ids?: string[], format: "csv"|"xlsx", columns?: string[] }
 *     Returns: { downloadUrl, expiresAt, rowCount }
 *     Guards: verifyBearer + RBAC (entity_operation row + permission decision).
 *     Resolves entity table, fetches matching rows (max EXPORT_MAX_ROWS),
 *     encodes parameters into a short-lived HMAC-signed token, returns download URL.
 *
 *   GET /api/records/:entity/export/download?t=TOKEN
 *     Verifies HMAC signature and TTL — no bearer required (token IS the credential).
 *     Re-fetches rows, serialises as CSV or XLSX, streams file as attachment.
 *
 * Token format: base64url(payload) + "." + base64url(HMAC-SHA256(secret, payloadB64))
 * Secret source: deps.tokenSecret → EXPORT_TOKEN_SECRET env var (warn if missing).
 * CSV: RFC 4180 compliant. XLSX: ExcelJS (dynamic import).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
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
import type { CacheClient } from "@athyper/svc-iam";
import {
  resolveParameterSnapshot,
  getIntParam,
} from "@athyper/svc-iam";
import {
  isEntityOperationAllowed,
  type CheckPermissionBatchFn,
} from "./operation-guard.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ─── Deps ─────────────────────────────────────────────────────────────────────

export interface ExportRouteDeps {
  db:    AnyDb;
  auth:  { verifyToken(token: string): Promise<Record<string, unknown>> };
  cache?: CacheClient;
  /** HMAC secret for export download tokens. Falls back to EXPORT_TOKEN_SECRET env var. */
  tokenSecret?: string;
  /** RBAC batch check — if absent, all export requests are denied at the route level. */
  checkPermissionBatch?: CheckPermissionBatchFn;
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    info(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const EXPORT_MAX_ROWS = 10_000;
const TOKEN_TTL_MS    = 15 * 60 * 1_000; // 15 min

// ─── Token helpers ─────────────────────────────────────────────────────────────

interface ExportToken {
  entityCode:  string;
  tenantId:    string;
  principalId: string;
  ids:         string[] | null;  // null = all rows
  format:      "csv" | "xlsx";
  columns:     string[] | null;  // null = all fields
  issuedAt:    number;
}

function resolveSecret(secret: string | undefined, logger: ExportRouteDeps["logger"]): string {
  const s = secret ?? process.env["EXPORT_TOKEN_SECRET"] ?? "";
  if (!s) {
    logger?.warn("export_token_secret_missing", {
      message: "EXPORT_TOKEN_SECRET is not configured — export tokens are insecure. Set this env var in production.",
    });
  }
  return s || "INSECURE_FALLBACK_SET_EXPORT_TOKEN_SECRET";
}

function encodeToken(payload: ExportToken, secret: string): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

function decodeToken(raw: string, secret: string): ExportToken | null {
  try {
    const dot = raw.lastIndexOf(".");
    if (dot === -1) return null;

    const payloadB64 = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);

    const expectedSig = createHmac("sha256", secret).update(payloadB64).digest("base64url");

    // Constant-time comparison to prevent timing attacks.
    const sigBuf      = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

    const p = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as ExportToken;
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

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.commit();

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ─── Row fetcher ──────────────────────────────────────────────────────────────

async function fetchRows(
  db:        AnyDb,
  fullTable: `${string}.${string}`,
  tenantId:  string,
  ids:       string[] | null,
  maxRows:   number = EXPORT_MAX_ROWS,
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
  const entityRow = await db
    .selectFrom("control.entity as e")
    .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
    .select(["ev.id as version_id"])
    .where("e.name", "=", entityCode)
    .where("e.tenant_id", "is", null)
    .where("ev.status", "=", "EFFECTIVE")
    .limit(1)
    .executeTakeFirst() as { version_id: string } | undefined;

  if (!entityRow) return wantColumns ?? [];

  const fieldRows = await db
    .selectFrom("control.entity_field as ef")
    .select(["ef.name", "ef.column_name", "ef.sort_order"])
    .where("ef.entity_version_id", "=", entityRow.version_id)
    .where("ef.is_active", "=", true)
    .orderBy("ef.sort_order", "asc")
    .execute() as { name: string; column_name: string; sort_order: number }[];

  const allColumns = fieldRows.map((f) => f.column_name);

  if (!wantColumns || wantColumns.length === 0) return allColumns;

  const fieldMap = await resolveFieldMap(db, entityCode);
  return wantColumns.map((col) => fieldMap.get(col) ?? col);
}

// ─── Route factory ─────────────────────────────────────────────────────────────

export function createExportRoutes(router: Router, deps: ExportRouteDeps): Router {
  const { db, auth, cache, logger, checkPermissionBatch } = deps;
  const secret = resolveSecret(deps.tokenSecret, logger);

  // ── POST /records/:entity/export — RBAC check → mint signed token ───────────
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

      // ── RBAC guard ────────────────────────────────────────────────────────────
      const principalId = await resolvePrincipalIdOrNull(db, String(claims["sub"] ?? ""), tenantId);
      if (!principalId) {
        res.status(403).json({ error: "PRINCIPAL_NOT_FOUND", message: "Principal not found for this tenant." });
        return;
      }

      const allowed = await isEntityOperationAllowed(
        db, entityCode, "export", tenantId, principalId, checkPermissionBatch,
      );
      if (!allowed) {
        res.status(403).json({ error: "FORBIDDEN", message: "Export is not permitted for this entity." });
        return;
      }

      // ── Validate body ─────────────────────────────────────────────────────────
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

      // ── Verify entity exists ───────────────────────────────────────────────────
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

      // ── Row count (for response metadata) ────────────────────────────────────
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

      // ── Mint signed token ─────────────────────────────────────────────────────
      const token = encodeToken({
        entityCode, tenantId, principalId, ids, format, columns, issuedAt: Date.now(),
      }, secret);

      const expiresAt   = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
      const downloadUrl = `/api/records/${entityCode}/export/download?t=${token}`;

      logger?.info("entity_export_token_issued", { entityCode, tenantId, principalId, rowCount, format });
      res.json({ ok: true, downloadUrl, expiresAt, rowCount });
    } catch (err) {
      logger?.error("entity_export_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /records/:entity/export/download?t=TOKEN — verify sig → stream ───────
  // No bearer required: the HMAC-signed token is the credential.
  // The POST handler already verified RBAC before issuing the token.
  const downloadHandler: RequestHandler = async (req, res, next) => {
    try {
      const raw = String(req.query["t"] ?? "");
      if (!raw) {
        res.status(400).json({ error: "MISSING_TOKEN", message: "?t= query parameter required" });
        return;
      }

      const token = decodeToken(raw, secret);
      if (!token) {
        res.status(401).json({ error: "INVALID_TOKEN", message: "Token expired or invalid" });
        return;
      }

      const entityCode = token.entityCode;

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

      const rows    = await fetchRows(db, fullTable, token.tenantId, token.ids, dlMaxRows);
      const columns = await resolveExportColumns(db, entityCode, token.columns);
      const headers = columns.length > 0 ? columns : (rows[0] ? Object.keys(rows[0]) : []);

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

      logger?.info("entity_export_download", {
        entityCode,
        tenantId:    token.tenantId,
        principalId: token.principalId,
        rows:        rows.length,
        format:      token.format,
      });
    } catch (err) {
      logger?.error("entity_export_download_error", { err: String(err) });
      next(err);
    }
  };

  router.post("/records/:entity/export",          exportHandler);
  router.get("/records/:entity/export/download",  downloadHandler);

  return router;
}
