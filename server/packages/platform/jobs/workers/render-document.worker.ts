/**
 * Render Document Worker
 *
 * Queue: jobs-render-document
 *
 * Two job names:
 *
 *   JOB_NAME.SWEEP — runs every RENDER_SWEEP_MS (default 30 s).
 *     Finds document.render_output WHERE status='QUEUED' (up to SWEEP_BATCH).
 *     Enqueues one RENDER job per output row. Idempotent — RENDER job id
 *     is `render:{outputId}` so duplicate sweeps do not double-enqueue.
 *
 *   JOB_NAME.RENDER — processes one render_output row:
 *     1. Claim: render_output → RENDERING.
 *     2. Fetch snapshot.template_version, substitute {{vars}} from manifest_json.
 *     3. POST to Gotenberg /forms/chromium/convert/html with manifest-derived
 *        paper/margin/header/footer overrides (master.print_profile defaults
 *        should already be merged into manifest_json by the producer — this
 *        worker treats manifest_json as authoritative).
 *     4. Upload PDF to object storage at renders/{tenantId}/{outputId}.pdf.
 *     5. Mark render_output RENDERED.
 *
 * Failure mapping (stack/compose/render/README.md — binding contract):
 *   transient → status reset to QUEUED, throw to let BullMQ retry
 *   timeout   → first attempt: same as transient; subsequent: DLQ + FAILED
 *   permanent → DLQ + FAILED immediately (no retry)
 *   crash     → DLQ + FAILED + event.outbox(ops_alert) immediately
 *
 *   Errors that are not GotenbergError are treated as `crash`.
 *
 * Concurrency: SWEEP = singleton via job id; RENDER = 3.
 *
 * Configuration error semantics:
 *   • No SyncPdfRenderer injected and DOCRENDER_BASE_URL unset → DLQ
 *     'permanent' with code MISSING_RENDERER. The render_output is FAILED
 *     and an ops_alert event is emitted once.
 *   • No object storage adapter → DLQ 'permanent' with code MISSING_STORAGE.
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
import type {
  PdfRenderOptions,
  SyncPdfRenderer,
} from "../sync-pdf-renderer.js";

// Duck-typed view of GotenbergError. The server/packages/foundation/render/SyncPdfRenderer
// implementation throws GotenbergError instances whose .category field is one
// of the four enum values; we read it structurally so this package never
// imports concrete classes from the runtime foundation render package (layering rule —
// svc-jobs is a leaf package built independently).
interface GotenbergErrorLike {
  category: RenderDlqCategory;
  message:  string;
  responseBody?: string | null;
}
type RenderDlqCategory = "transient" | "timeout" | "permanent" | "crash";
const VALID_CATEGORIES: ReadonlySet<RenderDlqCategory> = new Set([
  "transient", "timeout", "permanent", "crash",
]);
function isGotenbergError(err: unknown): err is GotenbergErrorLike {
  if (err == null || typeof err !== "object") return false;
  const cat = (err as { category?: unknown }).category;
  return typeof cat === "string" && VALID_CATEGORIES.has(cat as RenderDlqCategory);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ─── Object storage interface (subset of ObjectStorageAdapter) ───────────────

export interface RenderObjectStorage {
  put(key: string, body: Buffer, opts?: { contentType?: string }): Promise<void>;
  getPresignedUrl(key: string, expirySeconds?: number): Promise<string>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SWEEP_BATCH = 20;
// Maximum BullMQ attempts per render. Mirrored at sweep enqueue time. The
// worker also treats job.attemptsMade to decide when timeout should give up.
const MAX_ATTEMPTS = 3;

// ─── Template variable substitution ───────────────────────────────────────────

function substituteVars(
  html: string,
  vars: Record<string, unknown>,
): string {
  return html.replace(/\{\{(\w[\w.]*)\}\}/g, (_match, key: string) => {
    const val = key.split(".").reduce(
      (obj: unknown, k) =>
        obj != null && typeof obj === "object"
          ? (obj as Record<string, unknown>)[k]
          : undefined,
      vars as unknown,
    );
    return val != null ? String(val) : `{{${key}}}`;
  });
}

// ─── Manifest → PdfRenderOptions ─────────────────────────────────────────────

const PAPER_FORMATS: ReadonlySet<PdfRenderOptions["format"]> = new Set([
  "A4",
  "A3",
  "Letter",
  "Legal",
]);

function mapManifestToOptions(
  manifest: Record<string, unknown> | null,
): PdfRenderOptions {
  const m = manifest ?? {};
  const opts: PdfRenderOptions = {};

  const fmt = typeof m["paper_size"] === "string" ? (m["paper_size"] as string) : undefined;
  if (fmt && PAPER_FORMATS.has(fmt as PdfRenderOptions["format"])) {
    opts.format = fmt as PdfRenderOptions["format"];
  }

  if (typeof m["orientation"] === "string") {
    opts.landscape = (m["orientation"] as string).toLowerCase() === "landscape";
  }

  if (typeof m["scale"] === "number") {
    opts.scale = m["scale"] as number;
  }

  if (typeof m["print_background"] === "boolean") {
    opts.printBackground = m["print_background"] as boolean;
  }

  const margin = m["margin"];
  if (margin && typeof margin === "object") {
    const mm = margin as Record<string, unknown>;
    opts.margin = {
      top:    typeof mm["top"]    === "string" ? mm["top"]    as string : undefined,
      bottom: typeof mm["bottom"] === "string" ? mm["bottom"] as string : undefined,
      left:   typeof mm["left"]   === "string" ? mm["left"]   as string : undefined,
      right:  typeof mm["right"]  === "string" ? mm["right"]  as string : undefined,
    };
  }

  const header = typeof m["header_template"] === "string" ? (m["header_template"] as string) : undefined;
  const footer = typeof m["footer_template"] === "string" ? (m["footer_template"] as string) : undefined;
  if (header || footer) {
    opts.displayHeaderFooter = true;
    if (header) opts.headerTemplate = header;
    if (footer) opts.footerTemplate = footer;
  }

  return opts;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function classifyError(err: unknown): { category: RenderDlqCategory; code: string; detail: string } {
  if (isGotenbergError(err)) {
    return {
      category: err.category,
      code:     `GOTENBERG_${err.category.toUpperCase()}`,
      detail:   err.responseBody ? `${err.message}\n${err.responseBody}` : err.message,
    };
  }
  return {
    category: "crash",
    code:     "RENDER_INTERNAL_ERROR",
    detail:   err instanceof Error ? (err.stack ?? err.message) : String(err),
  };
}

async function emitOpsAlert(
  db:       AnyDb,
  tenantId: string,
  outputId: string,
  category: RenderDlqCategory,
  code:     string,
  detail:   string,
): Promise<void> {
  await sql`
    INSERT INTO event.outbox
      (tenant_id, topic,        event_type,
       entity_type, entity_id,
       payload,    created_by)
    VALUES
      (${tenantId}::uuid,
       'ops_alert',
       'render.failed',
       'render_output',
       ${outputId}::uuid,
       ${JSON.stringify({
         outputId,
         category,
         code,
         detail: detail.slice(0, 1024),
       })}::jsonb,
       ${SYSTEM_ACTOR_ID}::uuid)
  `.execute(db).catch(() => undefined);
}

// ─── Sweep ────────────────────────────────────────────────────────────────────

async function sweep(
  db:     AnyDb,
  queue:  Queue<RenderDocumentJobData | SweepJobData>,
  logger?: JobLogger,
): Promise<void> {
  const rows = await sql<{ id: string; tenant_id: string }>`
    SELECT ro.id, ro.tenant_id
    FROM   document.render_output ro
    WHERE  ro.status = 'QUEUED'
    ORDER  BY ro.created_at ASC
    LIMIT  ${SWEEP_BATCH}
    FOR UPDATE SKIP LOCKED
  `.execute(db);

  if (rows.rows.length === 0) return;

  await queue.addBulk(
    rows.rows.map((r) => ({
      name: JOB_NAME.RENDER,
      data: { outputId: r.id, tenantId: r.tenant_id } satisfies RenderDocumentJobData,
      opts: {
        jobId:            `render:${r.id}`,
        attempts:         MAX_ATTEMPTS,
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
  id:           string;
  content_html: string | null;
  content_json: unknown | null;
  locale_code:  string;
}

interface RenderDeps {
  db:            AnyDb;
  data:          RenderDocumentJobData;
  attemptsMade:  number;
  gotenberg:     SyncPdfRenderer | null;
  objectStorage: RenderObjectStorage | undefined;
  logger?:       JobLogger;
}

async function markFinalFailure(
  db:           AnyDb,
  tenantId:     string,
  outputId:     string,
  errorCode:    string,
  errorDetail:  string,
  category:     RenderDlqCategory,
): Promise<void> {
  await sql`
    UPDATE document.render_output
    SET    status       = 'FAILED',
           error_code   = ${errorCode},
           error_message = ${errorDetail.slice(0, 4096)},
           failure_category = ${category},
           updated_at   = now(),
           updated_by   = ${SYSTEM_ACTOR_ID}::uuid
    WHERE  id = ${outputId}::uuid AND tenant_id = ${tenantId}::uuid
  `.execute(db).catch(() => undefined);
}

async function markRetryable(
  db:           AnyDb,
  tenantId:     string,
  outputId:     string,
  errorCode:    string,
  errorDetail:  string,
  category:     RenderDlqCategory,
): Promise<void> {
  // Reset render_output → QUEUED so the retried BullMQ job's claim succeeds.
  await sql`
    UPDATE document.render_output
    SET    status           = 'QUEUED',
           error_code       = ${errorCode},
           error_message    = ${errorDetail.slice(0, 4096)},
           failure_category = ${category},
           updated_at       = now(),
           updated_by       = ${SYSTEM_ACTOR_ID}::uuid
    WHERE  id = ${outputId}::uuid AND tenant_id = ${tenantId}::uuid
  `.execute(db).catch(() => undefined);
}

async function render(deps: RenderDeps): Promise<void> {
  const { db, data, attemptsMade, gotenberg, objectStorage, logger } = deps;
  const startedAt = Date.now();
  const { outputId, tenantId } = data;

  // ── 1. Claim render_output ─────────────────────────────────────────────────
  const claimResult = await sql<RenderOutputRow>`
    UPDATE document.render_output
    SET    status = 'RENDERING',
           attempt_count = attempt_count + 1,
           last_attempt_at = now(),
           updated_at = now(),
           updated_by = ${SYSTEM_ACTOR_ID}::uuid
    WHERE  id        = ${outputId}::uuid
      AND  tenant_id = ${tenantId}::uuid
      AND  status    = 'QUEUED'
    RETURNING id, tenant_id, template_version_id, entity_name, entity_id,
              manifest_json, locale, status
  `.execute(db);

  const output = claimResult.rows[0];
  if (!output) {
    logger?.warn("render_skip_already_claimed", { outputId, tenantId, attemptsMade });
    return;
  }

  // ── 2. Claim render_output ─────────────────────────────────────────────────
  // ── Configuration guards (permanent failure, alert ops) ────────────────────
  if (!gotenberg) {
    const detail = "DOCRENDER_BASE_URL is unset; no Gotenberg client available";
    logger?.error("render_no_gotenberg", { outputId, tenantId });
    await markFinalFailure(db, tenantId, outputId, "MISSING_RENDERER", detail, "permanent");
    await emitOpsAlert(db, tenantId, outputId, "permanent", "MISSING_RENDERER", detail);
    return;
  }

  if (!objectStorage) {
    const detail = "Object storage adapter not configured; cannot persist rendered PDF";
    logger?.error("render_no_storage", { outputId, tenantId });
    await markFinalFailure(db, tenantId, outputId, "MISSING_STORAGE", detail, "permanent");
    await emitOpsAlert(db, tenantId, outputId, "permanent", "MISSING_STORAGE", detail);
    return;
  }

  try {
    // ── 3. Fetch template version ────────────────────────────────────────────
    let htmlTemplate = "";

    if (output.template_version_id) {
      const tvResult = await sql<TemplateVersionRow>`
        SELECT id, content_html, content_json, locale_code
        FROM   snapshot.template_version
        WHERE  tenant_id = ${output.tenant_id}::uuid
          AND  id = ${output.template_version_id}::uuid
        LIMIT 1
      `.execute(db);

      const tv = tvResult.rows[0];
      if (tv) {
        if (tv.content_html) {
          htmlTemplate = tv.content_html;
        } else if (tv.content_json) {
          const content = typeof tv.content_json === "string" ? tv.content_json : JSON.stringify(tv.content_json, null, 2);
          htmlTemplate = `<!DOCTYPE html><html><body><pre>${content}</pre></body></html>`;
        }
      }
    }

    if (!htmlTemplate) {
      htmlTemplate = `<!DOCTYPE html><html><body>
        <h1>Document</h1>
        <p>Entity: ${output.entity_name ?? "—"} / ${output.entity_id ?? "—"}</p>
        <pre>${JSON.stringify(output.manifest_json ?? {}, null, 2)}</pre>
      </body></html>`;
    }

    // ── 4. Substitute variables ──────────────────────────────────────────────
    const vars: Record<string, unknown> = {
      ...(output.manifest_json ?? {}),
      entity_name: output.entity_name ?? "",
      entity_id:   output.entity_id   ?? "",
      tenant_id:   tenantId,
      locale:      output.locale      ?? "en",
    };

    const renderedHtml = substituteVars(htmlTemplate, vars);

    // ── 5. Render PDF via Gotenberg ──────────────────────────────────────────
    const pdfOptions = mapManifestToOptions(output.manifest_json);
    const pdfBuffer  = await gotenberg.renderSync(renderedHtml, pdfOptions);

    // ── 6. Compute checksum + upload ─────────────────────────────────────────
    const checksum  = sha256Hex(pdfBuffer);
    const sizeBytes = pdfBuffer.length;
    const storageKey = `renders/${tenantId}/${outputId}.pdf`;
    await objectStorage.put(storageKey, pdfBuffer, { contentType: "application/pdf" });

    // ── 7. Mark RENDERED + COMPLETED ────────────────────────────────────────
    await sql`
      UPDATE document.render_output
      SET    status       = 'RENDERED',
             storage_key  = ${storageKey},
             mime_type    = 'application/pdf',
             size_bytes   = ${sizeBytes},
             checksum     = ${checksum},
             error_code   = NULL,
             error_message = NULL,
             failure_category = NULL,
             rendered_at  = now(),
             updated_at   = now(),
             updated_by   = ${SYSTEM_ACTOR_ID}::uuid
      WHERE  id        = ${outputId}::uuid
        AND  tenant_id = ${tenantId}::uuid
    `.execute(db);

    const durationMs = Date.now() - startedAt;

    logger?.info("render_complete", {
      outputId, tenantId, sizeBytes, durationMs, attemptsMade,
    });

  } catch (err) {
    const { category, code, detail } = classifyError(err);
    const attemptCount = attemptsMade + 1;

    logger?.error("render_failed", {
      outputId, tenantId, attemptCount, category, code,
      err: err instanceof Error ? err.message : String(err),
    });

    // Decide retry vs. terminal based on category + attempts.
    // BullMQ wraps worker throws and retries until job.opts.attempts is hit.
    const remainingAttempts = MAX_ATTEMPTS - attemptCount;

    let terminal = false;
    switch (category) {
      case "transient":
        terminal = remainingAttempts <= 0;
        break;
      case "timeout":
        // One retry only (regardless of MAX_ATTEMPTS). Conversions that
        // took 504 once are likely to do so again — fail fast on the second.
        terminal = attemptCount >= 2;
        break;
      case "permanent":
      case "crash":
        terminal = true;
        break;
    }

    if (terminal) {
      await markFinalFailure(db, tenantId, outputId, code, detail, category);
      if (category === "crash") {
        await emitOpsAlert(db, tenantId, outputId, category, code, detail);
      }
      // Do NOT rethrow — BullMQ would otherwise schedule another retry.
      return;
    }

    // Retryable: reset state for next attempt and rethrow so BullMQ retries.
    await markRetryable(db, tenantId, outputId, code, detail, category);
    throw err;
  }
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export interface RenderDocumentWorkerDeps {
  db:              AnyDb;
  queue:           Queue<RenderDocumentJobData | SweepJobData>;
  connection:      ConnectionOptions;
  /** Gotenberg HTTP client. When null, every render fails with a permanent
   *  MISSING_RENDERER DLQ entry — the worker stays running so configuration
   *  errors surface immediately rather than silently swallowing jobs. */
  gotenberg?:      SyncPdfRenderer | null;
  objectStorage?:  RenderObjectStorage;
  logger?:         JobLogger;
}

export function createRenderDocumentWorker(
  deps: RenderDocumentWorkerDeps,
): Worker<RenderDocumentJobData | SweepJobData> {
  const { db, queue, connection, gotenberg = null, objectStorage, logger } = deps;

  return new Worker<RenderDocumentJobData | SweepJobData>(
    QUEUE_NAME.RENDER_DOCUMENT,
    async (job: Job) => {
      if (job.name === JOB_NAME.SWEEP) {
        await sweep(db, queue, logger);
      } else if (job.name === JOB_NAME.RENDER) {
        await render({
          db,
          data:         job.data as RenderDocumentJobData,
          attemptsMade: job.attemptsMade,
          gotenberg,
          objectStorage,
          logger,
        });
      } else {
        logger?.warn("render_unknown_job", { name: job.name });
      }
    },
    {
      connection,
      // SWEEP runs as singleton via its job id; RENDER is bounded by
      // Gotenberg's per-replica throughput. Three concurrent HTTP posts
      // is comfortable for one Gotenberg instance and cheap on memory
      // since rendering happens out-of-process.
      concurrency: 3,
    },
  );
}
