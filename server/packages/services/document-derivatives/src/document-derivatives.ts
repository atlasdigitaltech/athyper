import { createTenantWorkGate } from "@athyper/server-foundation/resilience";
import { createHash, randomUUID } from "node:crypto";
import {
  isDerivativeUsable,
  type AttachmentDerivativeRecord,
  type DerivativeRenderer,
  type DerivativeRepository,
  type DerivativeScheduleRequest,
  type DerivativeScheduler,
} from "@athyper/server-contract-derivatives";
import type {
  JobExecutionResult,
  JobHandler,
  JobPublisher,
} from "@athyper/server-contract-jobs";
import type { MalwareScanner } from "@athyper/server-contract-malware-scanning";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { PlaneKey } from "@athyper/server-foundation/context";
import { sql, type Transaction } from "kysely";

export const DOCUMENT_DERIVATIVES_QUEUE = "documents.derivatives";
export const RENDER_DERIVATIVE_JOB = "documents.render-derivative";

export const SUPPORTED_RENDITIONS = [
  {
    derivativeType: "preview_pdf",
    renditionCode: "preview_default",
    contentType: "application/pdf",
  },
  {
    derivativeType: "thumbnail",
    renditionCode: "thumbnail_sm",
    contentType: "image/webp",
  },
  {
    derivativeType: "thumbnail",
    renditionCode: "thumbnail_md",
    contentType: "image/webp",
  },
  {
    derivativeType: "page_preview",
    renditionCode: "page_preview",
    contentType: "image/webp",
  },
] as const;

export interface DerivativeRenderRequest {
  readonly planeKey: PlaneKey;
  readonly tenantId: string;
  readonly attachmentId: string;
  readonly principalId: string;
  readonly sourceSha256: string;
  readonly derivativeType: string;
  readonly renditionCode: string;
  readonly specificationHash: string;
  readonly expectedContentType: string;
  readonly rebuild?: {
    readonly mode: "missing" | "failed" | "all";
    readonly reason: string;
    readonly requestId: string;
  };
}

export interface DerivativeSourceRepository<Transaction> {
  loadSource(
    tenantId: string,
    attachmentId: string,
    tx: Transaction,
  ): Promise<{
    storageKey: string;
    contentType: string;
    sha256: string;
    sizeBytes: number;
  } | null>;
}

export function createDerivativeScheduler(
  jobs: JobPublisher,
): DerivativeScheduler {
  return {
    async schedule(request: DerivativeScheduleRequest): Promise<void> {
      await Promise.all(
        SUPPORTED_RENDITIONS.map((rendition) =>
          jobs.enqueue(
            DOCUMENT_DERIVATIVES_QUEUE,
            RENDER_DERIVATIVE_JOB,
            {
              planeKey: request.planeKey,
              tenantId: request.tenantId,
              attachmentId: request.attachmentId,
              principalId: request.principalId,
              sourceSha256: request.sourceSha256,
              derivativeType: rendition.derivativeType,
              renditionCode: rendition.renditionCode,
              specificationHash: specHash(rendition.renditionCode),
              expectedContentType: rendition.contentType,
              ...(request.rebuild ? { rebuild: request.rebuild } : {}),
            } satisfies DerivativeRenderRequest,
            {
              jobId: `derivative-${request.planeKey}-${request.tenantId}-${request.attachmentId}-${rendition.renditionCode}-${request.sourceSha256.slice(0, 16)}-${specHash(rendition.renditionCode).slice(0, 12)}${request.rebuild ? `-${request.rebuild.requestId}` : ""}`,
              maxAttempts: 5,
              timeoutMs: 120_000,
              backoff: {kind:"exponential",delayMs:1000,jitter:0.2},
              removeOnComplete: 1000,
              removeOnFail: 5000,
            },
          ),
        ),
      );
    },
  };
}

export interface DerivativeHandlerOptions<T> {
  readonly repository: DerivativeRepository<T>;
  readonly sourceRepository: DerivativeSourceRepository<T>;
  readonly transactions: PlaneTransactionCoordinator<T>;
  readonly storage: ObjectStorage;
  readonly renderer: DerivativeRenderer;
  readonly scanner: MalwareScanner;
}

export function createDerivativeRenderHandler<T>(
  options: DerivativeHandlerOptions<T>,
): JobHandler<typeof RENDER_DERIVATIVE_JOB, DerivativeRenderRequest> {
  const admit = createTenantWorkGate();
  const handler: JobHandler<typeof RENDER_DERIVATIVE_JOB, DerivativeRenderRequest> = {
    async handle(job, context): Promise<JobExecutionResult> {
      const request = validateRequest(job.data);
      throwIfAborted(context.signal);
      const actor = {
        tenantId: request.tenantId,
        principalId: request.principalId,
      };

      const existing = await options.transactions.run(
        request.planeKey,
        actor,
        (tx) =>
          options.repository.loadBySpec(
            request.tenantId,
            request.attachmentId,
            request.derivativeType,
            request.renditionCode,
            request.sourceSha256,
            request.specificationHash,
            tx,
          ),
      );

      if (isDerivativeUsable(existing) && request.rebuild?.mode !== "all") {
        return {
          status: "completed",
          output: { skipped: true, reason: "already_ready" },
        };
      }
      if (
        request.rebuild?.mode === "failed" &&
        existing &&
        existing.status !== "failed"
      ) {
        return {
          status: "completed",
          output: { skipped: true, reason: "not_failed" },
        };
      }

      const record = await options.transactions.run(
        request.planeKey,
        actor,
        (tx) =>
          options.repository.upsertPending(
            {
              tenantId: request.tenantId,
              attachmentId: request.attachmentId,
              derivativeType: request.derivativeType,
              renditionCode: request.renditionCode,
              sourceSha256: request.sourceSha256,
              specificationHash: request.specificationHash,
              contentType: request.expectedContentType,
              principalId: request.principalId,
              forceRebuild: request.rebuild?.mode === "all",
            },
            tx,
          ),
      );

      if (isDerivativeUsable(record)) {
        return {
          status: "completed",
          output: { skipped: true, reason: "already_ready" },
        };
      }

      await options.transactions.run(request.planeKey, actor, (tx) =>
        options.repository.markProcessing(
          record.id,
          request.tenantId,
          request.principalId,
          tx,
        ),
      );

      await context.reportProgress({ stage: "download" });
      throwIfAborted(context.signal);

      const source = await options.transactions.run(
        request.planeKey,
        actor,
        (tx) =>
          options.sourceRepository.loadSource(
            request.tenantId,
            request.attachmentId,
            tx,
          ),
      );

      if (!source) {
        await options.transactions.run(request.planeKey, actor, (tx) =>
          options.repository.markFailed(
            record.id,
            request.tenantId,
            "source_not_found",
            "Source attachment not found",
            request.principalId,
            tx,
          ),
        );
        return { status: "discarded", reason: "source_not_found" };
      }

      const maxSourceBytes = 20 * 1024 * 1024;
      if (source.sizeBytes > maxSourceBytes) {
        await options.transactions.run(request.planeKey,actor,tx => options.repository.markSkipped(record.id,request.tenantId,"size_limit",request.principalId,tx));
        return {status:"discarded",reason:"size_limit"};
      }
      const bytes = await readBoundedSource(options.storage,source.storageKey,maxSourceBytes,context.signal);

      const actualSha256 = createHash("sha256").update(bytes).digest("hex");
      if (actualSha256 !== request.sourceSha256) {
        throw new Error("Source attachment checksum mismatch before rendering");
      }

      await context.reportProgress({ stage: "render" });
      throwIfAborted(context.signal);

      let output;
      try {
        output = await options.renderer.render({
          content: bytes,
          sourceContentType: source.contentType,
          renditionCode: request.renditionCode,
          specificationHash: request.specificationHash,
          signal: context.signal,
        });
      } catch (error) {
        if (isUnsupportedMediaType(error)) {
          await options.transactions.run(request.planeKey, actor, (tx) =>
            options.repository.markSkipped(
              record.id,
              request.tenantId,
              "unsupported_media_type",
              request.principalId,
              tx,
            ),
          );
          return { status: "discarded", reason: "unsupported_media_type" };
        }
        await options.transactions
          .run(request.planeKey, actor, (tx) =>
            options.repository.markFailed(
              record.id,
              request.tenantId,
              "render_failed",
              error instanceof Error ? error.message : "render failed",
              request.principalId,
              tx,
            ),
          )
          .catch(() => undefined);
        throw error;
      }

      await context.reportProgress({ stage: "scan" });
      throwIfAborted(context.signal);
      const scan = await options.scanner.scan({
        content: output.bytes,
        contentType: output.contentType,
        fileName: `${request.attachmentId}-${request.renditionCode}`,
        sizeBytes: output.bytes.byteLength,
        signal: context.signal,
      });
      throwIfAborted(context.signal);
      if (scan.status !== "clean") {
        await options.transactions.run(request.planeKey, actor, (tx) =>
          options.repository.markQuarantined(
            {
              id: record.id,
              tenantId: request.tenantId,
              reason: "malware_detected",
              principalId: request.principalId,
            },
            tx,
          ),
        );
        // Nothing was ever written to object storage — the infected bytes never leave this job.
        return { status: "discarded", reason: "malware_detected" };
      }

      const currentSource = await options.transactions.run(request.planeKey, actor, tx => options.sourceRepository.loadSource(request.tenantId,request.attachmentId,tx));
      if (!currentSource || currentSource.sha256 !== request.sourceSha256) {
        await options.transactions.run(request.planeKey,actor,tx => options.repository.markFailed(record.id,request.tenantId,"source_changed","Source is no longer eligible",request.principalId,tx));
        return {status:"discarded",reason:"source_changed_during_render"};
      }
      const outputSha256 = createHash("sha256")
        .update(output.bytes)
        .digest("hex");
      // Content hash in the path for observability/debugging, but the key is made unique to this
      // attempt with a fresh UUID — not purely content-addressed. Two renders producing different
      // bytes were already guaranteed never to collide (different hash); the UUID additionally
      // guarantees that two renders producing byte-identical output (a retried or duplicate job
      // for the same source) never share a key either. That sharing was the actual bug: whichever
      // attempt's markReady() failed would unconditionally delete the key, and a concurrent
      // attempt's successful commit could depend on that exact key — no read-before-delete check
      // closes that race completely, since the check-then-act window (and a failed check) can
      // still get it wrong. Giving every attempt an exclusively-owned key removes the shared
      // ownership itself, so this attempt's own cleanup can never touch another attempt's object.
      const storageKey = `derivatives/${request.planeKey}/${request.tenantId}/${request.attachmentId}/${request.renditionCode}/${outputSha256}-${randomUUID()}`;

      await context.reportProgress({ stage: "store" });
      throwIfAborted(context.signal);
      await options.storage.put(storageKey, output.bytes, {
        contentType: output.contentType,
      });

      try {
        await options.transactions.run(request.planeKey, actor, (tx) =>
          options.repository.markReady(
            {
              id: record.id,
              tenantId: request.tenantId,
              storageBucket: "",
              storageKey,
              sizeBytes: output.bytes.byteLength,
              sha256: outputSha256,
              width: output.width,
              height: output.height,
              pageNumber: output.pageNumber,
              provider: output.provider,
              providerVersion: output.providerVersion,
              principalId: request.principalId,
            },
            tx,
          ),
        );
      } catch (error) {
        // Safe unconditionally: storageKey is exclusively this attempt's own (see above), so no
        // other row or attempt can ever be depending on it — no read-before-delete check needed,
        // and none of its failure modes (a stale read, a failed lookup) can misfire here.
        try { await options.storage.delete(storageKey); }
        catch {
          await options.transactions.run(request.planeKey,actor,async tx=>{ await options.repository.recordPendingCleanup?.({id:record.id,tenantId:request.tenantId,storageKey,sha256:outputSha256,principalId:request.principalId},tx); });
        }
        throw error;
      }

      return {
        status: "completed",
        output: {
          attachmentId: request.attachmentId,
          renditionCode: request.renditionCode,
          storageKey,
          sizeBytes: output.bytes.byteLength,
          provider: output.provider,
        },
      };
    },
  };
  return {handle: (job,context) => admit(`${job.data.planeKey}:${job.data.tenantId}`,context.signal,() => handler.handle(job,context))};
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Derivative job aborted");
}

// --- Kysely implementations ---

export type DerivativeTransaction = Transaction<Record<string, never>>;

export function createKyselyDerivativeRepository(): DerivativeRepository<DerivativeTransaction> {
  return {
    async upsertPending(input, tx) {
      const result = await sql<Record<string, unknown>>`
        INSERT INTO document.attachment_derivative
          (tenant_id, attachment_id, derivative_type, rendition_code, source_sha256,
           specification_hash, content_type, status, attempt_count, created_at,
           created_by)
        VALUES
          (${input.tenantId}::uuid, ${input.attachmentId}::uuid, ${input.derivativeType},
           ${input.renditionCode}, ${input.sourceSha256}, ${input.specificationHash},
           ${input.contentType}, 'pending', 0, now(), ${input.principalId}::uuid)
        ON CONFLICT (tenant_id, attachment_id, derivative_type, rendition_code, source_sha256, specification_hash)
        DO UPDATE SET
          status = CASE
            WHEN document.attachment_derivative.status = 'ready'
             AND document.attachment_derivative.scan_status = 'clean'
             AND NOT ${input.forceRebuild ?? false}
            THEN 'ready'
            ELSE 'pending'
          END,
          updated_at = now(),
          updated_by = ${input.principalId}::uuid
        RETURNING *
      `.execute(tx);
      return mapRow(result.rows[0]!);
    },

    async markProcessing(id, tenantId, principalId, tx) {
      await sql`
        UPDATE document.attachment_derivative
        SET status = 'processing', attempt_count = attempt_count + 1, updated_at = now(), updated_by = ${principalId}::uuid
        WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
      `.execute(tx);
    },

    async markReady(input, tx) {
      const eligible = await sql`
        SELECT a.id FROM document.attachment a
        JOIN document.attachment_derivative d ON d.tenant_id=a.tenant_id AND d.attachment_id=a.id AND d.source_sha256=a.sha256
        JOIN document.attachment_series s ON s.tenant_id=a.tenant_id AND s.id=a.series_id
        WHERE d.id=${input.id}::uuid AND d.tenant_id=${input.tenantId}::uuid
          AND a.status='active' AND a.is_active AND a.is_virus_scanned
          AND (EXISTS (SELECT 1 FROM document.attachment_link l WHERE l.tenant_id=a.tenant_id AND l.attachment_series_id=a.series_id
            AND (l.pinned_attachment_id=a.id OR (l.pinned_attachment_id IS NULL AND s.current_attachment_id=a.id)))
            OR EXISTS (SELECT 1 FROM document.comment_draft draft WHERE draft.tenant_id=a.tenant_id AND draft.id=a.draft_id
              AND draft.principal_id=a.uploaded_by AND draft.expires_at>clock_timestamp()))
        FOR SHARE OF a`.execute(tx);
      if (!eligible.rows.length) throw new Error("Derivative source is no longer eligible");
      await sql`
        UPDATE document.attachment_derivative
        SET
          status = 'ready',
          storage_bucket = ${input.storageBucket || null},
          storage_key = ${input.storageKey},
          size_bytes = ${input.sizeBytes},
          sha256 = ${input.sha256},
          width = ${input.width},
          height = ${input.height},
          page_number = ${input.pageNumber},
          provider = ${input.provider},
          provider_version = ${input.providerVersion},
          generated_at = now(),
          scanned_at = now(),
          scan_status = 'clean',
          last_error_code = NULL,
          last_error_message = NULL,
          updated_at = now(),
          updated_by = ${input.principalId}::uuid
        WHERE id = ${input.id}::uuid AND tenant_id = ${input.tenantId}::uuid
      `.execute(tx);
    },

    async markQuarantined(input, tx) {
      // Deliberately leaves storage_bucket/storage_key untouched: this call only ever follows a
      // scan of freshly rendered bytes that were never written to storage (scan runs before
      // put()), so any existing reference belongs to a prior, unrelated ready render (e.g. a
      // rejected `rebuild.mode: "all"` attempt) and must not be clobbered.
      await sql`
        UPDATE document.attachment_derivative
        SET
          status = 'quarantined',
          scanned_at = now(),
          scan_status = 'quarantined',
          last_error_code = ${input.reason},
          last_error_message = ${input.reason.slice(0, 1000)},
          updated_at = now(),
          updated_by = ${input.principalId}::uuid
        WHERE id = ${input.id}::uuid AND tenant_id = ${input.tenantId}::uuid
      `.execute(tx);
    },

    async markSkipped(id, tenantId, reason, principalId, tx) {
      await sql`
        UPDATE document.attachment_derivative
        SET
          status = 'skipped',
          last_error_code = 'skipped',
          last_error_message = ${reason.slice(0, 1000)},
          updated_at = now(),
          updated_by = ${principalId}::uuid
        WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
      `.execute(tx);
    },

    async markFailed(id, tenantId, errorCode, errorMessage, principalId, tx) {
      await sql`
        UPDATE document.attachment_derivative
        SET
          status = 'failed',
          last_error_code = ${errorCode},
          last_error_message = ${errorMessage.slice(0, 1000)},
          updated_at = now(),
          updated_by = ${principalId}::uuid
        WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
      `.execute(tx);
    },

    async recordPendingCleanup(input,tx) {
      await sql`UPDATE document.attachment_derivative SET status='failed',storage_key=${input.storageKey},sha256=${input.sha256},last_error_code='ready_commit_failed',last_error_message='Rendered object awaits cleanup after ready commit failure',updated_at=clock_timestamp(),updated_by=${input.principalId}::uuid WHERE id=${input.id}::uuid AND tenant_id=${input.tenantId}::uuid`.execute(tx);
    },

    async load(id, tenantId, tx) {
      const result = await sql<Record<string, unknown>>`
        SELECT * FROM document.attachment_derivative
        WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
        LIMIT 1
      `.execute(tx);
      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },

    async loadBySpec(
      tenantId,
      attachmentId,
      derivativeType,
      renditionCode,
      sourceSha256,
      specificationHash,
      tx,
    ) {
      const result = await sql<Record<string, unknown>>`
        SELECT * FROM document.attachment_derivative
        WHERE tenant_id = ${tenantId}::uuid
          AND attachment_id = ${attachmentId}::uuid
          AND derivative_type = ${derivativeType}
          AND rendition_code = ${renditionCode}
          AND source_sha256 = ${sourceSha256}
          AND specification_hash = ${specificationHash}
        LIMIT 1
      `.execute(tx);
      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
  };
}

export function createKyselyDerivativeSourceRepository(): DerivativeSourceRepository<DerivativeTransaction> {
  return {
    async loadSource(tenantId, attachmentId, tx) {
      const result = await sql<Record<string, unknown>>`
        SELECT storage_key, content_type, sha256, size_bytes
        FROM document.attachment AS attachment
        JOIN document.attachment_series AS series
          ON series.tenant_id = attachment.tenant_id
         AND series.id = attachment.series_id
        WHERE attachment.tenant_id = ${tenantId}::uuid
          AND attachment.id = ${attachmentId}::uuid
          AND attachment.status = 'active'
          AND attachment.is_active AND attachment.is_virus_scanned
          AND (EXISTS (SELECT 1 FROM document.attachment_link link WHERE link.tenant_id=attachment.tenant_id AND link.attachment_series_id=attachment.series_id
            AND (link.pinned_attachment_id=attachment.id OR (link.pinned_attachment_id IS NULL AND series.current_attachment_id=attachment.id)))
            OR EXISTS (SELECT 1 FROM document.comment_draft draft WHERE draft.tenant_id=attachment.tenant_id AND draft.id=attachment.draft_id
              AND draft.principal_id=attachment.uploaded_by AND draft.expires_at>clock_timestamp()))
        LIMIT 1
      `.execute(tx);
      const row = result.rows[0];
      if (!row) return null;
      return {
        storageKey: String(row["storage_key"]),
        contentType: String(row["content_type"] ?? "application/octet-stream"),
        sha256: String(row["sha256"] ?? ""),
        sizeBytes: Number(row["size_bytes"] ?? 0),
      };
    },
  };
}

function mapRow(row: Record<string, unknown>): AttachmentDerivativeRecord {
  return {
    id: String(row["id"]),
    tenantId: String(row["tenant_id"]),
    attachmentId: String(row["attachment_id"]),
    derivativeType: String(row["derivative_type"]),
    renditionCode: String(row["rendition_code"]),
    sourceSha256: String(row["source_sha256"]),
    specificationHash: String(row["specification_hash"]),
    contentType: String(row["content_type"] ?? ""),
    storageBucket: nullable(row["storage_bucket"]),
    storageKey: nullable(row["storage_key"]),
    sizeBytes: row["size_bytes"] != null ? Number(row["size_bytes"]) : null,
    sha256: nullable(row["sha256"]),
    width: row["width"] != null ? Number(row["width"]) : null,
    height: row["height"] != null ? Number(row["height"]) : null,
    pageNumber: row["page_number"] != null ? Number(row["page_number"]) : null,
    status: String(row["status"]) as AttachmentDerivativeRecord["status"],
    provider: nullable(row["provider"]),
    providerVersion: nullable(row["provider_version"]),
    attemptCount: Number(row["attempt_count"] ?? 0),
    lastErrorCode: nullable(row["last_error_code"]),
    lastErrorMessage: nullable(row["last_error_message"]),
    generatedAt:
      row["generated_at"] != null ? dateTime(row["generated_at"]) : null,
    scannedAt: row["scanned_at"] != null ? dateTime(row["scanned_at"]) : null,
    scanStatus: nullable(
      row["scan_status"],
    ) as AttachmentDerivativeRecord["scanStatus"],
    createdAt: dateTime(row["created_at"]),
    updatedAt: row["updated_at"] != null ? dateTime(row["updated_at"]) : null,
  };
}

function validateRequest(
  value: DerivativeRenderRequest,
): DerivativeRenderRequest {
  if (
    !["studio", "neon", "mesh"].includes(value.planeKey) ||
    !uuid(value.tenantId) ||
    !uuid(value.attachmentId) ||
    !uuid(value.principalId)
  ) {
    throw new Error("Invalid derivative render job payload");
  }
  return value;
}

function isUnsupportedMediaType(error: unknown): boolean {
  return (
    error != null &&
    typeof error === "object" &&
    "code" in error &&
    (error as Record<string, unknown>)["code"] === "unsupported_media_type"
  );
}

function specHash(renditionCode: string): string {
  return createHash("sha256").update(`v1:${renditionCode}`).digest("hex");
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function nullable(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function dateTime(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();
}

async function readBoundedSource(storage: ObjectStorage, key: string, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  if (!storage.getStream) {
    // Compatibility for in-memory adapters; production S3 uses the bounded stream below.
    const bytes = await storage.get(key);
    if (bytes.byteLength > limit) throw new Error("Derivative source exceeds size limit");
    return bytes;
  }
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const chunk of await storage.getStream(key,{signal})) {
    throwIfAborted(signal); size += chunk.byteLength;
    if (size > limit) throw new Error("Derivative source exceeds size limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}
