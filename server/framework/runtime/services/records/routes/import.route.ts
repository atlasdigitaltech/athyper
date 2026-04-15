/**
 * Import Routes — bulk entity import execution backend
 *
 * Completes the backend behind the EntityImportPage wizard.
 * The frontend (entity-runtime/import/EntityImportPage.tsx) calls these via BFF relay:
 *
 *   POST /api/records/:entity/import/upload   — store file, return uploadToken + preview
 *   POST /api/records/:entity/import          — dry-run validate OR execute (enqueue chunks)
 *   GET  /api/records/:entity/import/:jobId   — poll import_request status
 *   GET  /api/records/:entity/import          — list recent import history for entity
 *
 * The BFF relay at /api/relay/[...path] converts multipart→base64 JSON before forwarding,
 * so upload receives { file: { name, type, data: base64 } } in req.body.
 */

import { sql } from "kysely";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { Queue } from "bullmq";

import { verifyBearer } from "@athyper/svc-shared";

// Local duck-type (avoids cross-package rootDir import for DTS builds)
interface JobLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface ImportObjectStorage {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export interface ImportRouteDeps {
  db:            AnyDb;
  auth:          { verifyToken(token: string): Promise<Record<string, unknown>> };
  importQueue:   Queue;
  objectStorage: ImportObjectStorage;
  logger?:       JobLogger;
}

// ── Tenant resolver ───────────────────────────────────────────────────────────

async function resolveTenantId(db: AnyDb, xOrg: string | undefined): Promise<string | null> {
  if (!xOrg) return null;
  const row = await db
    .selectFrom("master.tenant as t")
    .select("t.id")
    .where("t.code", "=", xOrg)
    .where("t.status", "=", "active")
    .executeTakeFirst() as { id: string } | undefined;
  return row?.id ?? null;
}

// ── Simple CSV header + preview extractor ─────────────────────────────────────

function parseLine(line: string, delim = ","): string[] {
  const fields: string[] = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else { inQ = !inQ; } }
    else if (c === delim[0] && !inQ) { fields.push(cur.trim()); cur = ""; }
    else { cur += c; }
  }
  fields.push(cur.trim());
  return fields;
}

function parseCsvPreview(buf: Buffer, format: string): {
  headers: string[]; previewRows: string[][]; rowCount: number;
} {
  const delim   = format === "tsv" ? "\t" : ",";
  const text    = buf.toString("utf-8");
  const lines   = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headers = parseLine(lines[0] ?? "", delim);
  const preview = lines.slice(1, 11).map((l) => parseLine(l, delim)); // first 10 data rows
  return { headers, previewRows: preview, rowCount: lines.length - 1 };
}

/** Parse XLSX preview using ExcelJS (dynamic import — optional dep). */
async function parseXlsxPreview(buf: Buffer): Promise<{
  headers: string[]; previewRows: string[][]; rowCount: number;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exceljs = await import("exceljs" as any) as any;
  const ExcelJSWorkbook = exceljs.default?.Workbook ?? exceljs.Workbook;
  const wb = new ExcelJSWorkbook();
  await wb.xlsx.load(buf);

  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount === 0) {
    return { headers: [], previewRows: [], rowCount: 0 };
  }

  const allRows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row: { values: unknown[] }) => {
    // row.values is 1-indexed: index 0 is undefined
    const cells = (Array.isArray(row.values) ? row.values.slice(1) : []) as unknown[];
    allRows.push(
      cells.map((v) => {
        if (v == null) return "";
        if (typeof v === "object" && "text" in (v as object)) return String((v as { text: unknown }).text ?? "");
        if (typeof v === "object" && "result" in (v as object)) return String((v as { result: unknown }).result ?? "");
        return String(v);
      }),
    );
  });

  const headers    = allRows[0] ?? [];
  const previewRows = allRows.slice(1, 11);
  const rowCount   = Math.max(0, allRows.length - 1);

  return { headers, previewRows, rowCount };
}

async function parsePreview(buf: Buffer, format: string): Promise<{
  headers: string[]; previewRows: string[][]; rowCount: number;
}> {
  if (format === "xlsx") return parseXlsxPreview(buf);
  return parseCsvPreview(buf, format);
}

// ── Chunk size ────────────────────────────────────────────────────────────────
const DEFAULT_CHUNK_SIZE = 500;

// ── Route registration ────────────────────────────────────────────────────────

export function createImportRoutes(router: Router, deps: ImportRouteDeps): void {
  const { db, auth, importQueue, objectStorage, logger } = deps;

  // ── POST /api/records/:entity/import/upload ──────────────────────────────
  // Receives { file: { name, type, data: base64 } } from BFF relay.
  // Stores file in object storage, creates an import_request with status='uploaded',
  // and returns { uploadToken, headers, rowCount, previewRows }.
  router.post("/records/:entity/import/upload", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = await resolveTenantId(db, xOrg);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org is required" });
        return;
      }

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const sub = typeof claims.sub === "string" ? claims.sub : tenantId;

      // Resolve principal for submitted_by
      const principal = await db
        .selectFrom("master.principal as p")
        .select("p.id")
        .where("p.subject_id", "=", sub)
        .where("p.tenant_id", "=", tenantId)
        .executeTakeFirst() as { id: string } | undefined;
      const principalId = principal?.id ?? sub;

      // Extract uploaded file from BFF relay format
      const body = req.body as { file?: { name?: string; type?: string; data?: string } };
      if (!body.file?.data) {
        res.status(400).json({ error: "MISSING_FILE", message: "No file in request body" });
        return;
      }

      const fileName   = body.file.name ?? "import.csv";
      const fileFormat = fileName.endsWith(".xlsx") ? "xlsx"
                       : fileName.endsWith(".tsv")  ? "tsv"
                       : "csv";

      const buffer    = Buffer.from(body.file.data, "base64");
      const sizeBytes = buffer.byteLength;

      // Parse headers + preview rows
      const { headers, previewRows, rowCount } = await parsePreview(buffer, fileFormat);

      // Create import_request row first to get the UUID for S3 key
      const request = await db
        .insertInto("document.import_request")
        .values({
          tenant_id:       tenantId,
          entity_name:     entityCode,
          file_ref:        "", // filled below after S3 put
          file_name:       fileName,
          file_size_bytes: sizeBytes,
          file_format:     fileFormat,
          mapping_config:  JSON.stringify([]),
          import_mode:     "create",
          options:         JSON.stringify({}),
          total_rows:      rowCount,
          status:          "uploaded",
          submitted_by:    principalId,
          created_by:      principalId,
        })
        .returning(["id"])
        .executeTakeFirstOrThrow() as { id: string };

      const fileRef = `imports/${tenantId}/${request.id}.${fileFormat}`;
      await objectStorage.put(fileRef, buffer);

      // Update file_ref now that we have the S3 key
      await db
        .updateTable("document.import_request")
        .set({ file_ref: fileRef })
        .where("id", "=", request.id)
        .execute();

      res.json({
        uploadToken: request.id,
        headers,
        rowCount,
        previewRows,
      });
    } catch (err) {
      logger?.error("import_upload_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /api/records/:entity/import ────────────────────────────────────
  // Body: { uploadToken, mappings, mode, dryRun }
  //
  // dryRun = true  → validate all rows, return ImportResult synchronously (no DB changes)
  // dryRun = false → create chunks, enqueue, return { jobId }
  router.post("/records/:entity/import", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = await resolveTenantId(db, xOrg);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org is required" });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : tenantId;
      const principal = await db
        .selectFrom("master.principal as p")
        .select("p.id")
        .where("p.subject_id", "=", sub)
        .where("p.tenant_id", "=", tenantId)
        .executeTakeFirst() as { id: string } | undefined;
      const principalId = principal?.id ?? sub;

      interface ImportBody {
        uploadToken: string;
        mappings:    Array<{ csvHeader: string; fieldName: string; constantValue?: string | null }>;
        mode:        "create" | "update" | "upsert";
        dryRun:      boolean;
      }
      const body = req.body as ImportBody;
      if (!body.uploadToken) {
        res.status(400).json({ error: "MISSING_FIELD", message: "'uploadToken' is required" });
        return;
      }

      // Load the upload record
      const request = await db
        .selectFrom("document.import_request as r")
        .selectAll("r")
        .where("r.id", "=", body.uploadToken)
        .where("r.tenant_id", "=", tenantId)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!request) {
        res.status(404).json({ error: "UPLOAD_NOT_FOUND", message: "uploadToken not found or expired" });
        return;
      }

      const fileRef    = request["file_ref"]    as string;
      const fileFormat = (request["file_format"] as string) ?? "csv";
      const totalRows  = (request["total_rows"]  as number) ?? 0;

      // ── Dry-run: validate without persisting ────────────────────────────────
      if (body.dryRun) {
        const buffer  = await objectStorage.get(fileRef);
        const delim   = fileFormat === "tsv" ? "\t" : ",";
        const text    = buffer.toString("utf-8");
        const lines   = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        const headers = lines.length > 0 ? parseLine(lines[0]!, delim) : [];

        const errors: Array<{ rowNumber: number; field: string | null; errorCode: string; message: string }> = [];
        const requiredFields = body.mappings
          .filter((m) => !m.constantValue)
          .map((m) => m.fieldName);

        let validated = 0;
        for (let i = 1; i < Math.min(lines.length, 10_001); i++) {
          const row    = parseLine(lines[i]!, delim);
          const values: Record<string, string | null> = {};
          for (const m of body.mappings) {
            if (m.constantValue !== undefined && m.constantValue !== null) {
              values[m.fieldName] = m.constantValue;
            } else {
              const idx = headers.indexOf(m.csvHeader);
              values[m.fieldName] = idx >= 0 ? (row[idx] ?? null) : null;
            }
          }

          for (const f of requiredFields) {
            if (!values[f]) {
              errors.push({ rowNumber: i, field: f, errorCode: "REQUIRED", message: `'${f}' is required` });
            }
          }
          validated++;
        }

        res.json({
          dryRun:  true,
          created: validated - errors.length,
          updated: 0, skipped: 0,
          failed:  errors.length,
          errors:  errors.slice(0, 100), // cap error list in response
          errorReportUrl: null,
        });
        return;
      }

      // ── Execute: persist mapping, create chunks, enqueue ────────────────────
      await db
        .updateTable("document.import_request")
        .set({
          mapping_config: JSON.stringify(body.mappings),
          import_mode:    body.mode ?? "create",
          status:         "processing",
          started_at:     sql`now()`,
          updated_at:     sql`now()`,
          updated_by:     principalId,
        })
        .where("id", "=", body.uploadToken)
        .execute();

      const chunkSize = DEFAULT_CHUNK_SIZE;
      const numChunks = Math.max(1, Math.ceil(totalRows / chunkSize));

      for (let i = 0; i < numChunks; i++) {
        const rowStart = i * chunkSize + 2;      // +2: 1-indexed + skip header
        const rowEnd   = Math.min(rowStart + chunkSize - 1, totalRows + 1);

        const chunk = await db
          .insertInto("document.import_request_chunk")
          .values({
            tenant_id:         tenantId,
            import_request_id: body.uploadToken,
            chunk_index:       i,
            row_start:         rowStart,
            row_end:           rowEnd,
            status:            "pending",
            created_by:        principalId,
          })
          .returning(["id"])
          .executeTakeFirstOrThrow() as { id: string };

        await importQueue.add("process-chunk", {
          importRequestId: body.uploadToken,
          chunkId:         chunk.id,
          tenantId,
        }, { attempts: 3, backoff: { type: "exponential", delay: 5_000 } });
      }

      res.status(202).json({ jobId: body.uploadToken });
    } catch (err) {
      logger?.error("import_execute_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/records/:entity/import/:jobId — poll status ─────────────────
  router.get("/records/:entity/import/:jobId", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = await resolveTenantId(db, xOrg);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org is required" });
        return;
      }

      const jobId = req.params["jobId"] as string;
      const request = await db
        .selectFrom("document.import_request as r")
        .select([
          "r.id", "r.status", "r.total_rows", "r.processed_rows",
          "r.success_count", "r.error_count", "r.error_summary",
          "r.started_at", "r.completed_at",
        ])
        .where("r.id", "=", jobId)
        .where("r.tenant_id", "=", tenantId)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!request) {
        res.status(404).json({ error: "JOB_NOT_FOUND" });
        return;
      }

      // On completed/failed, gather chunk error summary
      let result = null;
      if (request["status"] === "completed" || request["status"] === "failed") {
        const failedChunks = await db
          .selectFrom("document.import_request_chunk as c")
          .select(["c.chunk_index", "c.errors_json", "c.row_start", "c.row_end"])
          .where("c.import_request_id", "=", jobId)
          .where("c.error_count", ">", 0)
          .orderBy("c.chunk_index")
          .limit(20)
          .execute() as Array<Record<string, unknown>>;

        const allErrors = failedChunks.flatMap((fc) => {
          try { return JSON.parse(fc["errors_json"] as string ?? "[]") as unknown[]; }
          catch { return []; }
        });

        result = {
          created:        request["success_count"],
          updated:        0,
          skipped:        0,
          failed:         request["error_count"],
          errors:         allErrors.slice(0, 100),
          errorReportUrl: null,
        };
      }

      res.json({
        jobId:        request["id"],
        status:       request["status"],
        processedRows: request["processed_rows"],
        totalRows:    request["total_rows"],
        result,
      });
    } catch (err) {
      logger?.error("import_status_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/records/:entity/import — recent import history ──────────────
  router.get("/records/:entity/import", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const tenantId = await resolveTenantId(db, xOrg);
      if (!tenantId) {
        res.status(400).json({ error: "MISSING_HEADER", message: "X-Org is required" });
        return;
      }

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 100);

      const rows = await db
        .selectFrom("document.import_request as r")
        .select([
          "r.id", "r.file_name", "r.file_format", "r.import_mode",
          "r.status", "r.total_rows", "r.success_count", "r.error_count",
          "r.started_at", "r.completed_at", "r.submitted_by", "r.created_at",
        ])
        .where("r.tenant_id", "=", tenantId)
        .where("r.entity_name", "=", entityCode)
        .orderBy("r.created_at", "desc")
        .limit(limit)
        .execute();

      res.json({ items: rows });
    } catch (err) {
      logger?.error("import_history_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);
}
