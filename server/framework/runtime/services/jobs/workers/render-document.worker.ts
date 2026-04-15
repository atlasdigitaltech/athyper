/**
 * Render Document Worker — Sprint 37
 *
 * Queue: jobs-render-document
 *
 * Two job names:
 *
 *   JOB_NAME.SWEEP — runs every RENDER_SWEEP_MS (default 30 s).
 *     Finds document.render_output WHERE status='QUEUED' (up to SWEEP_BATCH rows).
 *     Enqueues one RENDER job per output row.
 *     Idempotent — the RENDER job id is `render:{outputId}` so duplicate sweeps
 *     do not create duplicate jobs.
 *
 *   JOB_NAME.RENDER — processes one render_output row:
 *     1. Claim: update render_output → RENDERING, render_job → PROCESSING.
 *     2. Fetch snapshot.template_version via output.template_version_id.
 *     3. Substitute {{variable}} placeholders from output.manifest_json.
 *     4. Attempt PDF generation via @sparticuz/chromium-min + puppeteer-core
 *        (dynamic import — graceful HTML fallback if packages are absent).
 *     5. Compute SHA-256 checksum of result bytes.
 *     6. Upload to object storage: renders/{tenantId}/{outputId}.{ext}.
 *     7. Update render_output: status=RENDERED, storage_key, size_bytes, checksum.
 *     8. Update render_job:   status=COMPLETED, completed_at, duration_ms.
 *
 * On permanent failure (attempts exhausted or unrecoverable error):
 *     • render_output → FAILED
 *     • render_job    → FAILED  with error_detail
 *     • insertDlq()  → log.render_dlq
 *
 * Concurrency: SWEEP = 1 (singleton), RENDER = 3 (Puppeteer is CPU-bound).
 *
 * PDF generation dependencies (optional):
 *   npm install @sparticuz/chromium-min puppeteer-core
 * If absent the worker falls back to storing the substituted HTML. The
 * render_output.storage_key will end in .html and output_format is set to
 * 'html'. All downstream infrastructure (presigned URLs, revoke, archive) works
 * identically for both formats.
 */

import { Worker, Queue, type Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { createHash } from "node:crypto";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  QUEUE_NAME,
  JOB_NAME,
  SYSTEM_ACTOR_ID,
  type RenderDocumentJobData,
  type SweepJobData,
  type JobLogger,
} from "../jobs.types.js";
import { insertDlq, DLQ_TABLE } from "../dlq.middleware.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ─── Object storage interface (subset of ObjectStorageAdapter) ───────────────

export interface RenderObjectStorage {
  put(key: string, body: Buffer, opts?: { contentType?: string }): Promise<void>;
  getPresignedUrl(key: string, expirySeconds?: number): Promise<string>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SWEEP_BATCH     = 20;
const RENDER_TIMEOUT  = 30_000;   // 30 s per PDF — hard timeout for Puppeteer
const PRESIGN_TTL_SEC = 3_600;    // 1 h for download URL

// ─── Template variable substitution ─────────────────────────────────────────

/**
 * Replace all {{variableName}} placeholders in the HTML template with values
 * from a flat key-value object. Unresolved placeholders are left as-is.
 */
function substituteVars(
  html:      string,
  vars:      Record<string, unknown>,
): string {
  return html.replace(/\{\{(\w[\w.]*)\}\}/g, (_match, key: string) => {
    const val = key.split(".").reduce(
      (obj: unknown, k) => (obj != null && typeof obj === "object" ? (obj as Record<string, unknown>)[k] : undefined),
      vars as unknown,
    );
    return val != null ? String(val) : `{{${key}}}`;
  });
}

// ─── PDF generation (Puppeteer — optional) ────────────────────────────────────

/**
 * Attempt to render HTML → PDF buffer using @sparticuz/chromium-min + puppeteer-core.
 * Returns null if either package is not installed or Puppeteer fails to launch.
 * The caller falls back to storing the HTML string directly.
 */
async function tryPuppeteerPdf(html: string): Promise<Buffer | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromiumMod = await import("@sparticuz/chromium-min" as any) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const puppeteerMod = await import("puppeteer-core" as any) as any;

    const chromium  = chromiumMod.default ?? chromiumMod;
    const puppeteer = puppeteerMod.default ?? puppeteerMod;

    const browser = await puppeteer.launch({
      args:           chromium.args,
      executablePath: await chromium.executablePath(),
      headless:       chromium.headless ?? true,
      defaultViewport: { width: 1280, height: 1800 },
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: RENDER_TIMEOUT });
      const pdfBuffer = await page.pdf({
        format:          "A4",
        printBackground: true,
        margin:          { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
      });
      return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer as Uint8Array);
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// ─── Sweep ────────────────────────────────────────────────────────────────────

async function sweep(
  db:     AnyDb,
  queue:  Queue<RenderDocumentJobData | SweepJobData>,
  logger?: JobLogger,
): Promise<void> {
  const rows = await sql<{ id: string; tenant_id: string; job_id: string }>`
    SELECT ro.id, ro.tenant_id, rj.id AS job_id
    FROM   document.render_output ro
    JOIN   document.render_job    rj
           ON  rj.output_id  = ro.id
           AND rj.tenant_id  = ro.tenant_id
           AND rj.status     = 'PENDING'
    WHERE  ro.status = 'QUEUED'
    ORDER  BY ro.created_at ASC
    LIMIT  ${SWEEP_BATCH}
    FOR UPDATE SKIP LOCKED
  `.execute(db);

  if (rows.rows.length === 0) return;

  await queue.addBulk(
    rows.rows.map((r) => ({
      name: JOB_NAME.RENDER,
      data: { outputId: r.id, tenantId: r.tenant_id, jobId: r.job_id } satisfies RenderDocumentJobData,
      opts: {
        jobId:            `render:${r.id}`,
        attempts:         3,
        backoff:          { type: "exponential", delay: 10_000 },
        removeOnComplete: { count: 200 },
        removeOnFail:     { count: 100 },
      },
    })),
  );

  logger?.info("render_sweep", { queued: rows.rows.length });
}

// ─── Render ───────────────────────────────────────────────────────────────────

interface RenderOutputRow {
  id:                   string;
  tenant_id:            string;
  template_version_id:  string | null;
  entity_name:          string | null;
  entity_id:            string | null;
  manifest_json:        Record<string, unknown> | null;
  locale:               string | null;
  status:               string;
}

interface TemplateVersionRow {
  id:          string;
  body_html:   string | null;
  body_json:   string | null;
  body_format: string | null;
  locale:      string | null;
}

async function render(
  db:             AnyDb,
  data:           RenderDocumentJobData,
  objectStorage?: RenderObjectStorage,
  logger?:        JobLogger,
): Promise<void> {
  const startedAt = Date.now();
  const { outputId, tenantId, jobId } = data;

  // ── 1. Claim render_output ────────────────────────────────────────────────
  const claimResult = await sql<RenderOutputRow>`
    UPDATE document.render_output
    SET    status = 'RENDERING', updated_at = now(), updated_by = ${SYSTEM_ACTOR_ID}::uuid
    WHERE  id        = ${outputId}::uuid
      AND  tenant_id = ${tenantId}::uuid
      AND  status    = 'QUEUED'
    RETURNING id, tenant_id, template_version_id, entity_name, entity_id,
              manifest_json, locale, status
  `.execute(db);

  const output = claimResult.rows[0];
  if (!output) {
    logger?.warn("render_skip_already_claimed", { outputId, tenantId });
    return;
  }

  // ── 2. Claim render_job ───────────────────────────────────────────────────
  await sql`
    UPDATE document.render_job
    SET    status     = 'PROCESSING',
           started_at = now(),
           updated_at = now()
    WHERE  id        = ${jobId}::uuid
      AND  tenant_id = ${tenantId}::uuid
  `.execute(db);

  try {
    // ── 3. Fetch template version ───────────────────────────────────────────
    let htmlTemplate = "";

    if (output.template_version_id) {
      const tvResult = await sql<TemplateVersionRow>`
        SELECT id, body_html, body_json, body_format, locale
        FROM   snapshot.template_version
        WHERE  id = ${output.template_version_id}::uuid
        LIMIT 1
      `.execute(db);

      const tv = tvResult.rows[0];
      if (tv) {
        if (tv.body_html) {
          htmlTemplate = tv.body_html;
        } else if (tv.body_json) {
          // body_json for structured templates — wrap in basic HTML
          const content = typeof tv.body_json === "string" ? tv.body_json : JSON.stringify(tv.body_json, null, 2);
          htmlTemplate = `<!DOCTYPE html><html><body><pre>${content}</pre></body></html>`;
        }
      }
    }

    if (!htmlTemplate) {
      // Fallback: minimal HTML envelope when no template is configured
      htmlTemplate = `<!DOCTYPE html><html><body>
        <h1>Document</h1>
        <p>Entity: ${output.entity_name ?? "—"} / ${output.entity_id ?? "—"}</p>
        <pre>${JSON.stringify(output.manifest_json ?? {}, null, 2)}</pre>
      </body></html>`;
    }

    // ── 4. Substitute variables ─────────────────────────────────────────────
    const vars: Record<string, unknown> = {
      ...(output.manifest_json ?? {}),
      entity_name: output.entity_name ?? "",
      entity_id:   output.entity_id   ?? "",
      tenant_id:   tenantId,
      locale:      output.locale      ?? "en",
    };

    const renderedHtml = substituteVars(htmlTemplate, vars);
    const htmlBuffer   = Buffer.from(renderedHtml, "utf-8");

    // ── 5. Generate PDF (or fall back to HTML) ──────────────────────────────
    let outputBuffer: Buffer;
    let outputFormat: string;
    let contentType:  string;

    if (objectStorage) {
      const pdfBuffer = await tryPuppeteerPdf(renderedHtml);
      if (pdfBuffer) {
        outputBuffer = pdfBuffer;
        outputFormat = "pdf";
        contentType  = "application/pdf";
      } else {
        // Puppeteer not available — store HTML
        outputBuffer = htmlBuffer;
        outputFormat = "html";
        contentType  = "text/html; charset=utf-8";
        logger?.warn("render_puppeteer_unavailable", { outputId, fallback: "html" });
      }
    } else {
      // No storage configured — still compute hash, no upload
      outputBuffer = htmlBuffer;
      outputFormat = "html";
      contentType  = "text/html; charset=utf-8";
    }

    // ── 6. Compute checksum ─────────────────────────────────────────────────
    const checksum   = sha256Hex(outputBuffer);
    const sizeBytes  = outputBuffer.length;

    // ── 7. Upload to object storage ─────────────────────────────────────────
    let storageKey: string | null = null;

    if (objectStorage) {
      storageKey = `renders/${tenantId}/${outputId}.${outputFormat}`;
      await objectStorage.put(storageKey, outputBuffer, { contentType });
    }

    // ── 8. Mark render_output RENDERED ─────────────────────────────────────
    await sql`
      UPDATE document.render_output
      SET    status       = 'RENDERED',
             storage_key  = ${storageKey},
             size_bytes   = ${sizeBytes},
             checksum     = ${checksum},
             rendered_at  = now(),
             updated_at   = now(),
             updated_by   = ${SYSTEM_ACTOR_ID}::uuid
      WHERE  id        = ${outputId}::uuid
        AND  tenant_id = ${tenantId}::uuid
    `.execute(db);

    // ── 9. Mark render_job COMPLETED ────────────────────────────────────────
    const durationMs = Date.now() - startedAt;
    await sql`
      UPDATE document.render_job
      SET    status       = 'COMPLETED',
             completed_at = now(),
             duration_ms  = ${durationMs},
             updated_at   = now()
      WHERE  id        = ${jobId}::uuid
        AND  tenant_id = ${tenantId}::uuid
    `.execute(db);

    logger?.info("render_complete", {
      outputId, tenantId, outputFormat, sizeBytes, durationMs,
      stored: storageKey != null,
    });

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger?.error("render_failed", { outputId, tenantId, err: errMsg });

    // Mark both rows FAILED
    await sql`
      UPDATE document.render_output
      SET    status = 'FAILED', updated_at = now(), updated_by = ${SYSTEM_ACTOR_ID}::uuid
      WHERE  id = ${outputId}::uuid AND tenant_id = ${tenantId}::uuid
    `.execute(db).catch(() => undefined);

    await sql`
      UPDATE document.render_job
      SET    status       = 'FAILED',
             error_code   = 'RENDER_ERROR',
             error_detail = ${errMsg.slice(0, 1024)},
             completed_at = now(),
             updated_at   = now()
      WHERE  id = ${jobId}::uuid AND tenant_id = ${tenantId}::uuid
    `.execute(db).catch(() => undefined);

    // Push to DLQ — best effort
    await insertDlq(db, DLQ_TABLE.RENDER, {
      tenantId,
      queueName:       QUEUE_NAME.RENDER_DOCUMENT,
      jobName:         JOB_NAME.RENDER,
      payload:         data,
      errorMessage:    errMsg,
      retryCount:      0,
      lastAttemptedAt: new Date().toISOString(),
    });

    throw err; // let BullMQ retry up to max_attempts
  }
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export interface RenderDocumentWorkerDeps {
  db:              AnyDb;
  queue:           Queue<RenderDocumentJobData | SweepJobData>;
  connection:      ConnectionOptions;
  objectStorage?:  RenderObjectStorage;
  logger?:         JobLogger;
}

export function createRenderDocumentWorker(
  deps: RenderDocumentWorkerDeps,
): Worker<RenderDocumentJobData | SweepJobData> {
  const { db, queue, connection, objectStorage, logger } = deps;

  return new Worker<RenderDocumentJobData | SweepJobData>(
    QUEUE_NAME.RENDER_DOCUMENT,
    async (job: Job) => {
      if      (job.name === JOB_NAME.SWEEP)  await sweep(db, queue, logger);
      else if (job.name === JOB_NAME.RENDER)  await render(db, job.data as RenderDocumentJobData, objectStorage, logger);
      else logger?.warn("render_unknown_job", { name: job.name });
    },
    {
      connection,
      // Concurrency: SWEEP effectively runs as singleton (jobId `sweep:render`
      // prevents queuing more than one at a time); RENDER is CPU-bound via
      // Puppeteer so cap at 3 to avoid OOM under load.
      concurrency: 3,
    },
  );
}
