/**
 * Import Chunk Worker
 *
 * Processes one document.import_request_chunk at a time.
 * Each chunk is a BullMQ job carrying { importRequestId, chunkId, tenantId }.
 *
 * Per-chunk flow:
 *   1. Load chunk + parent request from DB
 *   2. Download file from object storage
 *   3. Parse rows [row_start..row_end] from file
 *   4. Apply column mappings → entity field values
 *   5. Resolve entity table from control.entity
 *   6. Bulk-insert (or update) rows via Kysely
 *   7. Write per-row errors to errors_json
 *   8. Update chunk status + roll-up counters on parent import_request
 *
 * Queue: jobs-import   Concurrency: 3 (CPU-bound parsing)
 */

import { Worker } from "bullmq";
import type { Job, ConnectionOptions } from "bullmq";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  QUEUE_NAME, JOB_NAME, SYSTEM_ACTOR_ID,
  type ImportChunkJobData, type JobLogger,
} from "../jobs.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

/** Minimal object storage surface needed by this worker */
export interface ImportObjectStorage {
  get(key: string): Promise<Buffer>;
}

interface RowError {
  row_number: number;
  field:      string | null;
  error_code: string;
  message:    string;
}

// ── Simple CSV parser (no external deps) ──────────────────────────────────────

function parseLine(line: string, delimiter = ","): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else                                { inQuote = !inQuote; }
    } else if (ch === delimiter[0] && !inQuote) {
      fields.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

function parseCSV(buffer: Buffer, delimiter = ","): string[][] {
  const text  = buffer.toString("utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map((l) => parseLine(l, delimiter));
}

function delimiterFor(format: string): string {
  return format === "tsv" ? "\t" : ",";
}

// ── XLSX parser (ExcelJS — dynamic import) ─────────────────────────────────────
// Returns all rows as a 2D string array (row 0 = headers).

async function parseXLSX(buffer: Buffer): Promise<string[][]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exceljs = await import("exceljs" as any) as any;
  const ExcelJSWorkbook = exceljs.default?.Workbook ?? exceljs.Workbook;
  const wb = new ExcelJSWorkbook();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets[0];
  if (!ws) return [];

  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row: { values: unknown[] }) => {
    const cells = (Array.isArray(row.values) ? row.values.slice(1) : []) as unknown[];
    rows.push(
      cells.map((v) => {
        if (v == null) return "";
        if (typeof v === "object" && "text" in (v as object)) return String((v as { text: unknown }).text ?? "");
        if (typeof v === "object" && "result" in (v as object)) return String((v as { result: unknown }).result ?? "");
        return String(v);
      }),
    );
  });
  return rows;
}

/** Parse file bytes → 2D string rows. Row 0 is always the header row. */
async function parseFile(buffer: Buffer, fileFormat: string): Promise<string[][]> {
  if (fileFormat === "xlsx") return parseXLSX(buffer);
  return parseCSV(buffer, delimiterFor(fileFormat));
}

// ── Entity table resolver ─────────────────────────────────────────────────────

async function resolveEntityTable(db: AnyDb, entityName: string): Promise<string | null> {
  const row = await db
    .selectFrom("control.entity as e")
    .select(["e.table_name", "e.schema_name"])
    .where("e.code", "=", entityName)
    .where("e.status", "=", "active")
    .executeTakeFirst() as { table_name: string; schema_name: string } | undefined;
  return row ? `${row.schema_name}.${row.table_name}` : null;
}

// ── Apply mapping to a parsed row ─────────────────────────────────────────────

interface ColumnMapping {
  csvHeader:     string;
  fieldName:     string;
  constantValue?: string | null;
}

function applyMapping(
  headers:  string[],
  row:      string[],
  mappings: ColumnMapping[],
): Record<string, string | null> {
  const obj: Record<string, string | null> = {};
  for (const m of mappings) {
    if (m.constantValue !== undefined && m.constantValue !== null) {
      obj[m.fieldName] = m.constantValue;
      continue;
    }
    const colIdx = headers.indexOf(m.csvHeader);
    obj[m.fieldName] = colIdx >= 0 ? (row[colIdx] ?? null) : null;
  }
  return obj;
}

// ── Chunk processor ───────────────────────────────────────────────────────────

export function createImportWorker(deps: {
  db:             AnyDb;
  objectStorage:  ImportObjectStorage;
  connection:     ConnectionOptions;
  logger?:        JobLogger;
}): Worker {
  const { db, objectStorage, connection, logger } = deps;

  const worker = new Worker<ImportChunkJobData>(
    QUEUE_NAME.IMPORT,
    async (job: Job<ImportChunkJobData>) => {
      if (job.name !== JOB_NAME.PROCESS_CHUNK) return;

      const { importRequestId, chunkId, tenantId } = job.data;

      // ── 1. Load chunk + parent ──────────────────────────────────────────────
      const [chunk, request] = await Promise.all([
        db
          .selectFrom("document.import_request_chunk as c")
          .selectAll("c")
          .where("c.id", "=", chunkId)
          .where("c.tenant_id", "=", tenantId)
          .executeTakeFirst() as Promise<Record<string, unknown> | undefined>,
        db
          .selectFrom("document.import_request as r")
          .selectAll("r")
          .where("r.id", "=", importRequestId)
          .where("r.tenant_id", "=", tenantId)
          .executeTakeFirst() as Promise<Record<string, unknown> | undefined>,
      ]);

      if (!chunk || !request) {
        logger?.warn("import_worker_chunk_not_found", { importRequestId, chunkId });
        return;
      }

      // Skip if already processed (idempotency)
      if (chunk["status"] === "completed" || chunk["status"] === "failed") return;

      // ── 2. Mark chunk as processing ─────────────────────────────────────────
      await db
        .updateTable("document.import_request_chunk")
        .set({ status: "processing", started_at: sql`now()`, job_id: job.id ?? null })
        .where("id", "=", chunkId)
        .execute();

      const rowStart   = (chunk["row_start"] as number) - 1; // 0-indexed (skip header row 1)
      const rowEnd     = (chunk["row_end"]   as number) - 1;
      const fileRef    = request["file_ref"]    as string;
      const fileFormat = (request["file_format"] as string) ?? "csv";
      const entityName = request["entity_name"] as string;
      const mappings   = (request["mapping_config"] as ColumnMapping[]) ?? [];
      const importMode = (request["import_mode"] as string) ?? "create";

      let successCount = 0;
      const rowErrors: RowError[] = [];

      try {
        // ── 3. Download + parse file ──────────────────────────────────────────
        const buffer = await objectStorage.get(fileRef);
        const rows   = await parseFile(buffer, fileFormat);

        if (rows.length < 2) {
          throw new Error("File has no data rows");
        }

        const headers  = rows[0]!; // first row = headers
        const dataRows = rows.slice(rowStart, rowEnd + 1); // rows for this chunk

        // ── 4. Resolve entity table ───────────────────────────────────────────
        const tableName = await resolveEntityTable(db, entityName);
        if (!tableName) throw new Error(`Entity '${entityName}' not found or inactive`);

        // ── 5. Process rows ───────────────────────────────────────────────────
        for (let i = 0; i < dataRows.length; i++) {
          const rawRow    = dataRows[i]!;
          const rowNumber = rowStart + i + 1; // 1-based spreadsheet row (including header)
          const values    = applyMapping(headers, rawRow, mappings);

          // Skip empty rows
          if (Object.values(values).every((v) => !v)) continue;

          try {
            if (importMode === "create") {
              await db
                .insertInto(tableName as never)
                .values({
                  ...(values as Record<string, unknown>),
                  tenant_id:  tenantId,
                  created_by: SYSTEM_ACTOR_ID,
                  created_at: sql`now()`,
                } as never)
                .execute();
            } else if (importMode === "update" || importMode === "upsert") {
              // For update/upsert, the natural key must be in mappings
              // Simplification: treat as insert with ON CONFLICT DO UPDATE
              await db
                .insertInto(tableName as never)
                .values({
                  ...(values as Record<string, unknown>),
                  tenant_id:  tenantId,
                  created_by: SYSTEM_ACTOR_ID,
                  created_at: sql`now()`,
                  updated_by: SYSTEM_ACTOR_ID,
                  updated_at: sql`now()`,
                } as never)
                .onConflict((oc) =>
                  oc.column("id" as never).doUpdateSet({
                    ...(values as Record<string, unknown>),
                    updated_by: SYSTEM_ACTOR_ID,
                    updated_at: sql`now()`,
                  } as never),
                )
                .execute();
            }
            successCount++;
          } catch (rowErr) {
            rowErrors.push({
              row_number: rowNumber,
              field:      null,
              error_code: "INSERT_FAILED",
              message:    rowErr instanceof Error ? rowErr.message.substring(0, 500) : String(rowErr),
            });
          }
        }

        // ── 6. Mark chunk completed ───────────────────────────────────────────
        await db
          .updateTable("document.import_request_chunk")
          .set({
            status:        rowErrors.length > 0 && successCount === 0 ? "failed" : "completed",
            success_count: successCount,
            error_count:   rowErrors.length,
            errors_json:   JSON.stringify(rowErrors),
            completed_at:  sql`now()`,
            duration_ms:   sql`EXTRACT(EPOCH FROM (now() - started_at)) * 1000`,
          })
          .where("id", "=", chunkId)
          .execute();

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger?.error("import_worker_chunk_error", { chunkId, importRequestId, err: msg });

        await db
          .updateTable("document.import_request_chunk")
          .set({
            status:       "failed",
            error_count:  rowErrors.length + 1,
            errors_json:  JSON.stringify([
              ...rowErrors,
              { row_number: 0, field: null, error_code: "CHUNK_ERROR", message: msg },
            ]),
            completed_at: sql`now()`,
          })
          .where("id", "=", chunkId)
          .execute();
      }

      // ── 7. Roll up counters on parent import_request ──────────────────────
      // Re-aggregate from all chunks (safe under concurrent chunk processing)
      await db
        .updateTable("document.import_request as r")
        .set({
          processed_rows: db
            .selectFrom("document.import_request_chunk as c")
            .select(sql<number>`COALESCE(SUM(c.success_count + c.error_count), 0)`.as("v"))
            .where("c.import_request_id", "=", importRequestId)
            .as("v" as never),
          success_count: db
            .selectFrom("document.import_request_chunk as c")
            .select(sql<number>`COALESCE(SUM(c.success_count), 0)`.as("v"))
            .where("c.import_request_id", "=", importRequestId)
            .as("v" as never),
          error_count: db
            .selectFrom("document.import_request_chunk as c")
            .select(sql<number>`COALESCE(SUM(c.error_count), 0)`.as("v"))
            .where("c.import_request_id", "=", importRequestId)
            .as("v" as never),
          updated_at: sql`now()`,
        } as never)
        .where("r.id", "=", importRequestId)
        .execute()
        .catch(() => undefined); // best-effort

      // ── 8. Check if all chunks done → finalize import_request ─────────────
      const pending = await db
        .selectFrom("document.import_request_chunk as c")
        .select(sql<number>`COUNT(*)`.as("cnt"))
        .where("c.import_request_id", "=", importRequestId)
        .where("c.status", "in", ["pending", "processing"])
        .executeTakeFirst() as { cnt: string | number } | undefined;

      const remaining = parseInt(String(pending?.cnt ?? "1"), 10);
      if (remaining === 0) {
        const hasFailedChunk = await db
          .selectFrom("document.import_request_chunk as c")
          .select(sql<number>`COUNT(*)`.as("cnt"))
          .where("c.import_request_id", "=", importRequestId)
          .where("c.status", "=", "failed")
          .executeTakeFirst() as { cnt: string | number } | undefined;

        const finalStatus = parseInt(String(hasFailedChunk?.cnt ?? "0"), 10) > 0
          ? "failed" : "completed";

        await db
          .updateTable("document.import_request")
          .set({ status: finalStatus, completed_at: sql`now()`, updated_at: sql`now()` })
          .where("id", "=", importRequestId)
          .execute()
          .catch(() => undefined);

        logger?.info("import_worker_request_finalized", { importRequestId, finalStatus });
      }
    },
    { connection, concurrency: 3 },
  );

  worker.on("error", (err) => {
    logger?.error("import_worker_error", { err: err instanceof Error ? err.message : String(err) });
  });

  return worker;
}
