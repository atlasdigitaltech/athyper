/**
 * Tika Extract Worker — attachment text extraction + PII classification
 *
 * Consumes `jobs-tika-extract` jobs. Two job names supported:
 *   - JOB_NAME.EXTRACT_TEXT — process one attachment id (enqueued by uploads
 *     or by the admin reindex endpoint).
 *   - JOB_NAME.SWEEP        — scan master.attachment for rows where
 *     text_extraction_status IS NULL and self-enqueue extract-text jobs. Runs
 *     periodically to catch uploads that missed the inline enqueue (e.g. a
 *     runtime restart between S3 commit and queue add).
 *
 * Per-row flow for extract-text:
 *   1. Load attachment row (tenant-scoped)
 *   2. Skip if already extracted, not supported, or over size cap
 *   3. Download blob from object storage
 *   4. PUT to ${DOCPARSER_URL}/tika with Accept: text/plain — receive extracted text
 *   5. Classify PII in the extracted text (inline, regex-based)
 *   6. UPDATE master.attachment with text + PII columns in a single write
 *
 * Retries are driven by BullMQ; terminal failures land in the DLQ via the
 * standard error handler wired in jobs.service.ts.
 */

import { Worker, type ConnectionOptions, type Queue } from "bullmq";
import { sql, type Kysely } from "kysely";
import {
  QUEUE_NAME,
  JOB_NAME,
  SYSTEM_ACTOR_ID,
  type ExtractTextJobData,
  type SweepJobData,
  type JobLogger,
} from "../jobs.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = Kysely<Record<string, any>>;

/** Minimal object storage surface the worker relies on. */
export interface TikaObjectStorage {
  get(key: string): Promise<Buffer>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MAX_EXTRACT_BYTES = 50 * 1024 * 1024;  // 50 MiB
const DEFAULT_MAX_TEXT_CHARS    = 5_000_000;         // ~5 MB of plain text
const DEFAULT_TIKA_TIMEOUT_MS   = 120_000;
const DEFAULT_SWEEP_BATCH       = 200;

const SUPPORTED_MIME_PREFIXES: ReadonlyArray<string> = [
  "text/",
  "application/pdf",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.oasis.opendocument",
  "application/rtf",
  "application/xml",
  "application/json",
  "application/xhtml+xml",
  "image/",
];

function isSupportedMime(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const lower = contentType.toLowerCase();
  return SUPPORTED_MIME_PREFIXES.some((p) => lower.startsWith(p));
}

// ── PII classifier (regex-only, coarse; labels only) ─────────────────────────
// Raw substrings are NEVER persisted — only the category label. This keeps
// classifier output safe to expose in admin dashboards / audit logs.
//
// Ordered roughly by specificity so boardline matches favour the narrower type.

const PII_PATTERNS: ReadonlyArray<{ type: string; rx: RegExp }> = [
  // US SSN (requires separators to avoid matching arbitrary 9-digit runs)
  { type: "ssn",         rx: /\b\d{3}-\d{2}-\d{4}\b/ },
  // Email
  { type: "email",       rx: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  // IBAN (very broad — 15–34 alnum with country prefix)
  { type: "iban",        rx: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/ },
  // Credit-card-like 13–19 digit run, optionally separated by spaces or dashes
  { type: "credit_card", rx: /\b(?:\d[ -]?){12,18}\d\b/ },
  // US / E.164 phone number, reasonably conservative
  { type: "phone",       rx: /\b(?:\+\d{1,3}[ -]?)?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}\b/ },
  // IPv4
  { type: "ip_address",  rx: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})\b/ },
];

function classifyPii(text: string): string[] {
  if (!text) return [];
  const hits = new Set<string>();
  for (const { type, rx } of PII_PATTERNS) {
    if (rx.test(text)) hits.add(type);
  }
  return Array.from(hits).sort();
}

// ── Tika HTTP client (fetch-based, no external deps) ─────────────────────────

async function extractViaTika(
  tikaUrl: string,
  body: Buffer,
  contentType: string,
  timeoutMs: number,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${tikaUrl.replace(/\/+$/, "")}/tika`, {
      method:  "PUT",
      body:    new Uint8Array(body),
      headers: {
        "Accept":       "text/plain; charset=UTF-8",
        "Content-Type": contentType || "application/octet-stream",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const snippet = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`tika_http_${res.status}: ${snippet}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ── Worker factory ────────────────────────────────────────────────────────────

export interface TikaExtractWorkerDeps {
  db:              DB;
  connection:      ConnectionOptions;
  objectStorage:   TikaObjectStorage;
  /** Base URL (no trailing slash required). Example: http://docparser:9998 */
  tikaUrl:         string;
  /** Queue handle — required so sweep jobs can self-enqueue extract-text jobs. */
  queue:           Queue<ExtractTextJobData | SweepJobData>;
  logger?:         JobLogger;
  /** Overrides (mainly for tests). */
  maxExtractBytes?: number;
  maxTextChars?:    number;
  tikaTimeoutMs?:   number;
  concurrency?:     number;
  /** Max rows enqueued per sweep run. Prevents flooding the queue. */
  sweepBatchSize?:  number;
}

export function createTikaExtractWorker(
  deps: TikaExtractWorkerDeps,
): Worker<ExtractTextJobData | SweepJobData> {
  const {
    db, connection, objectStorage, tikaUrl, queue, logger,
    maxExtractBytes = DEFAULT_MAX_EXTRACT_BYTES,
    maxTextChars    = DEFAULT_MAX_TEXT_CHARS,
    tikaTimeoutMs   = DEFAULT_TIKA_TIMEOUT_MS,
    concurrency     = 2,
    sweepBatchSize  = DEFAULT_SWEEP_BATCH,
  } = deps;

  return new Worker<ExtractTextJobData | SweepJobData>(
    QUEUE_NAME.TIKA_EXTRACT,
    async (job) => {
      if (job.name === JOB_NAME.SWEEP) {
        await runSweep({ db, queue, logger, sweepBatchSize });
        return;
      }
      if (job.name !== JOB_NAME.EXTRACT_TEXT) return;

      await processOne({
        db, objectStorage, tikaUrl, logger,
        maxExtractBytes, maxTextChars, tikaTimeoutMs,
        data: job.data as ExtractTextJobData,
      });
    },
    {
      connection,
      concurrency,
    },
  );
}

// ── Per-attachment processing ────────────────────────────────────────────────

async function processOne(args: {
  db:               DB;
  objectStorage:    TikaObjectStorage;
  tikaUrl:          string;
  logger?:          JobLogger;
  maxExtractBytes:  number;
  maxTextChars:     number;
  tikaTimeoutMs:    number;
  data:             ExtractTextJobData;
}): Promise<void> {
  const {
    db, objectStorage, tikaUrl, logger,
    maxExtractBytes, maxTextChars, tikaTimeoutMs, data,
  } = args;
  const { attachmentId, tenantId } = data;

  const row = await db
    .selectFrom("master.attachment" as never)
    .select([
      "id" as never,
      "content_type" as never,
      "size_bytes" as never,
      "storage_key" as never,
      "text_extraction_status" as never,
    ])
    .where("id" as never, "=", attachmentId as never)
    .where("tenant_id" as never, "=", tenantId as never)
    .executeTakeFirst() as
      | { id: string; content_type: string | null; size_bytes: number | null; storage_key: string; text_extraction_status: string | null }
      | undefined;

  if (!row) {
    logger?.warn("tika_attachment_not_found", { attachmentId, tenantId });
    return;
  }

  if (row.text_extraction_status === "extracted") {
    return;  // idempotent no-op
  }

  const contentType = row.content_type ?? "";
  const sizeBytes   = Number(row.size_bytes ?? 0);

  if (!isSupportedMime(contentType)) {
    await markStatus(db, attachmentId, tenantId, "skipped", `unsupported_mime:${contentType}`);
    logger?.info("tika_skip_mime", { attachmentId, tenantId, contentType });
    return;
  }
  if (sizeBytes > maxExtractBytes) {
    await markStatus(db, attachmentId, tenantId, "skipped", `size_exceeds_cap:${sizeBytes}`);
    logger?.info("tika_skip_size", { attachmentId, tenantId, sizeBytes, cap: maxExtractBytes });
    return;
  }

  let blob: Buffer;
  try {
    blob = await objectStorage.get(row.storage_key);
  } catch (err) {
    logger?.error("tika_blob_fetch_failed", {
      attachmentId, tenantId, storageKey: row.storage_key,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;  // transient — let BullMQ retry
  }

  if (blob.byteLength > maxExtractBytes) {
    await markStatus(db, attachmentId, tenantId, "skipped", `size_exceeds_cap_actual:${blob.byteLength}`);
    return;
  }

  let text: string;
  try {
    text = await extractViaTika(tikaUrl, blob, contentType, tikaTimeoutMs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger?.error("tika_extract_http_failed", { attachmentId, tenantId, err: msg });
    await markStatus(db, attachmentId, tenantId, "failed", msg.slice(0, 1000));
    throw err;
  }

  const normalised = text.replace(/\u0000/g, "").trim();
  const truncated  = normalised.length > maxTextChars
    ? normalised.slice(0, maxTextChars)
    : normalised;

  const piiTypes = classifyPii(truncated);

  await db
    .updateTable("master.attachment" as never)
    .set({
      extracted_text:         truncated || null,
      extracted_text_chars:   truncated.length,
      text_extracted_at:      new Date(),
      text_extraction_status: "extracted",
      text_extraction_error:  null,
      pii_detected:           piiTypes.length > 0,
      pii_types:              JSON.stringify(piiTypes),
      pii_scanned_at:         new Date(),
      updated_at:             new Date(),
      updated_by:             SYSTEM_ACTOR_ID,
    } as never)
    .where("id" as never, "=", attachmentId as never)
    .where("tenant_id" as never, "=", tenantId as never)
    .execute();

  logger?.info("tika_extract_ok", {
    attachmentId, tenantId,
    chars:      truncated.length,
    sizeBytes,
    piiTypes,
    piiCount:   piiTypes.length,
  });
}

// ── Sweep: scan for rows missing extraction ──────────────────────────────────

async function runSweep(args: {
  db:              DB;
  queue:           Queue<ExtractTextJobData | SweepJobData>;
  logger?:         JobLogger;
  sweepBatchSize:  number;
}): Promise<void> {
  const { db, queue, logger, sweepBatchSize } = args;

  const rows = await db
    .selectFrom("master.attachment" as never)
    .select(["id" as never, "tenant_id" as never])
    .where(sql<boolean>`text_extraction_status IS NULL`)
    .where("is_active" as never, "=", true as never)
    .where("status" as never, "=", "active" as never)
    .where(sql<boolean>`content_type IS NOT NULL`)
    .orderBy("created_at" as never, "asc")
    .limit(sweepBatchSize)
    .execute() as Array<{ id: string; tenant_id: string }>;

  if (rows.length === 0) {
    logger?.info("tika_sweep_noop", {});
    return;
  }

  const jobs = rows.map((r) => ({
    name: JOB_NAME.EXTRACT_TEXT,
    data: { attachmentId: r.id, tenantId: r.tenant_id } satisfies ExtractTextJobData,
    opts: {
      // Same dedup key as the inline enqueue — ensures a sweep never races
      // a still-pending job for the same attachment.
      jobId:       `tika:${r.id}`,
      attempts:    3,
      backoff:     { type: "exponential" as const, delay: 30_000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail:     { age: 86_400 },
    },
  }));

  await queue.addBulk(jobs);
  logger?.info("tika_sweep_enqueued", { count: rows.length });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function markStatus(
  db:            DB,
  attachmentId:  string,
  tenantId:      string,
  status:        "skipped" | "failed",
  reason:        string,
): Promise<void> {
  await db
    .updateTable("master.attachment" as never)
    .set({
      text_extraction_status: status,
      text_extraction_error:  reason.slice(0, 1000),
      text_extracted_at:      new Date(),
      updated_at:             new Date(),
      updated_by:             SYSTEM_ACTOR_ID,
    } as never)
    .where("id" as never, "=", attachmentId as never)
    .where("tenant_id" as never, "=", tenantId as never)
    .execute();
}
