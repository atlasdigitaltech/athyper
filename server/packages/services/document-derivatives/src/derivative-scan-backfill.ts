import { createHash } from "node:crypto";
import type {
  JobExecutionResult,
  JobHandler,
  JobPublisher,
} from "@athyper/server-contract-jobs";
import type { MalwareScanner } from "@athyper/server-contract-malware-scanning";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { PlaneKey } from "@athyper/server-foundation/context";
import { sql } from "kysely";
import type { DerivativeTransaction } from "./document-derivatives.js";

export const DERIVATIVE_SCAN_BACKFILL_QUEUE =
  "documents.derivative-scan-backfill";
export const DERIVATIVE_SCAN_BACKFILL_JOB =
  "documents.derivative-scan-backfill.run";

/**
 * Rescans "ready" derivatives that predate the scan-before-store gate (Stage 3) and therefore
 * carry no scan evidence. Ready rows are re-verified in place against their already-stored
 * bytes — this does not re-render, so it never contacts docrender or the source attachment.
 */
export interface DerivativeScanBackfillRequest {
  readonly planeKey: PlaneKey;
  readonly tenantId: string;
  readonly principalId: string;
  readonly requestId: string;
  readonly dryRun: boolean;
  readonly batchSize: number;
  readonly concurrency: number;
  readonly cursor?: string;
}

export interface DerivativeScanBackfillCandidate {
  readonly cursor: string;
  readonly id: string;
  readonly tenantId: string;
  readonly storageKey: string;
  readonly contentType: string;
  /** The row's recorded checksum at load time — the object is re-hashed after download and must match this exactly before the scan result is trusted or written back. */
  readonly expectedSha256: string;
}

export interface DerivativeScanBackfillRepository<Transaction> {
  loadBatch(
    request: DerivativeScanBackfillRequest,
    cursor: string | undefined,
    tx: Transaction,
  ): Promise<readonly DerivativeScanBackfillCandidate[]>;
  /**
   * Stamps clean scan evidence, but only if the row is still `ready` and still names the exact
   * object that was scanned (matched by `expectedStorageKey` and `expectedSha256`). Derivative
   * storage keys are content-addressed (see document-derivatives.ts), so `expectedStorageKey`
   * alone already pins an immutable object — the checksum match is defense in depth against a
   * corrupted or truncated read, not the primary guarantee. Callers must check `updated` and
   * treat `false` as "changed underneath us", not as success.
   */
  recordScanEvidence(
    input: {
      id: string;
      tenantId: string;
      expectedStorageKey: string;
      expectedSha256: string;
      principalId: string;
    },
    tx: Transaction,
  ): Promise<{ updated: boolean }>;
  /**
   * Persists the quarantine decision durably — this must happen before the object is deleted,
   * and must never clear storage_key/storage_bucket: they remain the cleanup reference a sweep
   * (see loadPendingCleanup/confirmDeleted) uses to find and remove the object if deletion here
   * fails or is deferred. Matched by `expectedStorageKey`/`expectedSha256` for the same reason as
   * recordScanEvidence.
   */
  quarantine(
    input: {
      id: string;
      tenantId: string;
      reason: string;
      expectedStorageKey: string;
      expectedSha256: string;
      principalId: string;
    },
    tx: Transaction,
  ): Promise<{ updated: boolean }>;
  /** Rows already quarantined whose object was never confirmed deleted — the deletion retry set. */
  loadPendingCleanup(
    request: DerivativeScanBackfillRequest,
    cursor: string | undefined,
    tx: Transaction,
  ): Promise<readonly DerivativeScanBackfillCandidate[]>;
  /** Clears the cleanup reference once the object is confirmed deleted, so it isn't swept again. */
  confirmDeleted(
    input: {
      id: string;
      tenantId: string;
      expectedStorageKey: string;
      principalId: string;
    },
    tx: Transaction,
  ): Promise<{ updated: boolean }>;
}

export interface DerivativeScanBackfillOptions<T> {
  readonly repository: DerivativeScanBackfillRepository<T>;
  readonly transactions: PlaneTransactionCoordinator<T>;
  readonly storage: Pick<ObjectStorage, "get" | "delete">;
  readonly scanner: MalwareScanner;
}

export function createDerivativeScanBackfillHandler<T>(
  options: DerivativeScanBackfillOptions<T>,
): JobHandler<
  typeof DERIVATIVE_SCAN_BACKFILL_JOB,
  DerivativeScanBackfillRequest
> {
  return {
    async handle(job, context): Promise<JobExecutionResult> {
      const request = validateBackfillRequest(job.data);
      const actor = {
        tenantId: request.tenantId,
        principalId: request.principalId,
      };
      let cursor = request.cursor;
      let processed = 0;
      let clean = 0;
      let quarantined = 0;
      let changed = 0;
      let failed = 0;

      for (;;) {
        abortIfCancelled(context.signal);
        const batch = await options.transactions.run(
          request.planeKey,
          actor,
          (tx) => options.repository.loadBatch(request, cursor, tx),
        );
        if (!batch.length) break;

        for (
          let offset = 0;
          offset < batch.length;
          offset += request.concurrency
        ) {
          abortIfCancelled(context.signal);
          const window = batch.slice(offset, offset + request.concurrency);
          await Promise.all(
            window.map(async (candidate) => {
              processed += 1;
              try {
                const bytes = await options.storage.get(candidate.storageKey);

                // The object at this key may have been replaced by a concurrent render between
                // loadBatch and this read (derivative storage keys are deterministic per
                // rendition, not content-addressed). A checksum mismatch means we would be
                // scanning and certifying bytes that no longer correspond to this row's evidence
                // trail — skip rather than risk stamping clean evidence on the wrong object, or
                // deleting a legitimately rebuilt one.
                const actualSha256 = createHash("sha256")
                  .update(bytes)
                  .digest("hex");
                if (actualSha256 !== candidate.expectedSha256) {
                  changed += 1;
                  return;
                }

                const scan = await options.scanner.scan({
                  content: bytes,
                  contentType: candidate.contentType,
                  fileName: candidate.id,
                  sizeBytes: bytes.byteLength,
                  signal: context.signal,
                });
                abortIfCancelled(context.signal);

                if (request.dryRun) {
                  if (scan.status === "clean") clean += 1;
                  else quarantined += 1;
                  return;
                }

                if (scan.status === "clean") {
                  const { updated } = await options.transactions.run(
                    request.planeKey,
                    actor,
                    (tx) =>
                      options.repository.recordScanEvidence(
                        {
                          id: candidate.id,
                          tenantId: candidate.tenantId,
                          expectedStorageKey: candidate.storageKey,
                          expectedSha256: candidate.expectedSha256,
                          principalId: request.principalId,
                        },
                        tx,
                      ),
                  );
                  if (updated) clean += 1;
                  else changed += 1;
                } else {
                  // Persist the quarantine decision before touching storage: if deletion below
                  // fails or the process dies, the row is already durably quarantined (unusable)
                  // and still names the object via storage_key, so the cleanup sweep below (or a
                  // later run of it) can retry the delete instead of losing track of it.
                  const { updated } = await options.transactions.run(
                    request.planeKey,
                    actor,
                    (tx) =>
                      options.repository.quarantine(
                        {
                          id: candidate.id,
                          tenantId: candidate.tenantId,
                          reason: "malware_detected",
                          expectedStorageKey: candidate.storageKey,
                          expectedSha256: candidate.expectedSha256,
                          principalId: request.principalId,
                        },
                        tx,
                      ),
                  );
                  if (!updated) {
                    changed += 1;
                    return;
                  }
                  quarantined += 1;
                  try {
                    await options.storage.delete(candidate.storageKey);
                    await options.transactions.run(
                      request.planeKey,
                      actor,
                      (tx) =>
                        options.repository.confirmDeleted(
                          {
                            id: candidate.id,
                            tenantId: candidate.tenantId,
                            expectedStorageKey: candidate.storageKey,
                            principalId: request.principalId,
                          },
                          tx,
                        ),
                    );
                  } catch (error) {
                    // The row is already safely quarantined; the cleanup sweep below (and this
                    // job's future runs) will retry the delete from the still-present
                    // storage_key. Surface the failure rather than swallowing it.
                    failed += 1;
                    void error;
                  }
                }
              } catch (error) {
                if (context.signal.aborted) throw error;
                failed += 1;
              }
            }),
          );
        }

        cursor = batch[batch.length - 1]!.cursor;
        await context.reportProgress({
          stage: "rescan",
          cursor,
          processed,
          clean,
          quarantined,
          changed,
          failed,
        });
        if (batch.length < request.batchSize) break;
      }

      // Retry cleanup for rows this run (or an earlier one) quarantined but never confirmed
      // deleted — loadBatch only ever selects "ready" rows, so a quarantined row with a lingering
      // storage_key would otherwise never be revisited and the object would leak indefinitely.
      let cleaned = 0;
      if (!request.dryRun) {
        let cleanupCursor: string | undefined;
        for (;;) {
          abortIfCancelled(context.signal);
          const pending = await options.transactions.run(
            request.planeKey,
            actor,
            (tx) =>
              options.repository.loadPendingCleanup(request, cleanupCursor, tx),
          );
          if (!pending.length) break;

          for (
            let offset = 0;
            offset < pending.length;
            offset += request.concurrency
          ) {
            abortIfCancelled(context.signal);
            const window = pending.slice(offset, offset + request.concurrency);
            await Promise.all(
              window.map(async (candidate) => {
                try {
                  await options.storage.delete(candidate.storageKey);
                  const { updated } = await options.transactions.run(
                    request.planeKey,
                    actor,
                    (tx) =>
                      options.repository.confirmDeleted(
                        {
                          id: candidate.id,
                          tenantId: candidate.tenantId,
                          expectedStorageKey: candidate.storageKey,
                          principalId: request.principalId,
                        },
                        tx,
                      ),
                  );
                  if (updated) cleaned += 1;
                } catch (error) {
                  if (context.signal.aborted) throw error;
                  failed += 1;
                }
              }),
            );
          }

          cleanupCursor = pending[pending.length - 1]!.cursor;
          await context.reportProgress({
            stage: "cleanup",
            cursor: cleanupCursor,
            cleaned,
            failed,
          });
          if (pending.length < request.batchSize) break;
        }
      }

      if (failed > 0)
        throw new Error(
          `Derivative scan backfill completed with ${failed} failed candidates`,
        );
      return {
        status: "completed",
        output: {
          processed,
          clean,
          quarantined,
          changed,
          cleaned,
          dryRun: request.dryRun,
        },
      };
    },
  };
}

export async function submitDerivativeScanBackfill(
  jobs: JobPublisher,
  request: DerivativeScanBackfillRequest,
): Promise<string> {
  const value = validateBackfillRequest(request);
  return jobs.enqueue(
    DERIVATIVE_SCAN_BACKFILL_QUEUE,
    DERIVATIVE_SCAN_BACKFILL_JOB,
    value,
    {
      jobId: `derivative-scan-backfill-${value.planeKey}-${value.tenantId}-${value.requestId}`,
      maxAttempts: 3,
      timeoutMs: 24 * 60 * 60 * 1_000,
      execution: {
        planeKey: value.planeKey,
        scope: "tenant",
        tenantId: value.tenantId,
        principalId: value.principalId,
      },
      payloadSchema: { name: DERIVATIVE_SCAN_BACKFILL_JOB, version: 1 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    },
  );
}

function abortIfCancelled(signal: AbortSignal): void {
  if (signal.aborted)
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Derivative scan backfill cancelled");
}

function validateBackfillRequest(
  value: DerivativeScanBackfillRequest,
): DerivativeScanBackfillRequest {
  if (
    !["studio", "neon", "mesh"].includes(value.planeKey) ||
    !uuid(value.tenantId) ||
    !uuid(value.principalId) ||
    !value.requestId.trim()
  ) {
    throw new TypeError("Invalid derivative scan backfill scope");
  }
  if (typeof value.dryRun !== "boolean") {
    throw new TypeError("dryRun must be a boolean");
  }
  if (
    !Number.isInteger(value.batchSize) ||
    value.batchSize < 1 ||
    value.batchSize > 1000
  ) {
    throw new TypeError("batchSize must be 1-1000");
  }
  if (
    !Number.isInteger(value.concurrency) ||
    value.concurrency < 1 ||
    value.concurrency > 20
  ) {
    throw new TypeError("concurrency must be 1-20");
  }
  return value;
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

// --- Kysely implementation ---

export function createKyselyDerivativeScanBackfillRepository(): DerivativeScanBackfillRepository<DerivativeTransaction> {
  return {
    async loadBatch(request, cursor, tx) {
      const result = await sql<Record<string, unknown>>`
        SELECT id, tenant_id, storage_key, content_type, sha256
        FROM document.attachment_derivative
        WHERE tenant_id = ${request.tenantId}::uuid
          AND status = 'ready'
          AND scanned_at IS NULL
          AND storage_key IS NOT NULL
          AND sha256 IS NOT NULL
          AND (${cursor ?? null}::uuid IS NULL OR id > ${cursor ?? null}::uuid)
        ORDER BY id
        LIMIT ${request.batchSize}
      `.execute(tx);
      return result.rows.map((row) => ({
        cursor: String(row["id"]),
        id: String(row["id"]),
        tenantId: String(row["tenant_id"]),
        storageKey: String(row["storage_key"]),
        contentType: String(row["content_type"] ?? "application/octet-stream"),
        expectedSha256: String(row["sha256"]),
      }));
    },

    async recordScanEvidence(input, tx) {
      const result = await sql`
        UPDATE document.attachment_derivative
        SET scanned_at = now(), scan_status = 'clean', updated_at = now(), updated_by = ${input.principalId}::uuid
        WHERE id = ${input.id}::uuid AND tenant_id = ${input.tenantId}::uuid
          AND status = 'ready'
          AND storage_key = ${input.expectedStorageKey}
          AND sha256 = ${input.expectedSha256}
      `.execute(tx);
      return { updated: Number(result.numAffectedRows ?? 0n) > 0 };
    },

    async quarantine(input, tx) {
      const result = await sql`
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
          AND status = 'ready'
          AND storage_key = ${input.expectedStorageKey}
          AND sha256 = ${input.expectedSha256}
      `.execute(tx);
      return { updated: Number(result.numAffectedRows ?? 0n) > 0 };
    },

    async loadPendingCleanup(request, cursor, tx) {
      const result = await sql<Record<string, unknown>>`
        SELECT id, tenant_id, storage_key, content_type, sha256
        FROM document.attachment_derivative
        WHERE tenant_id = ${request.tenantId}::uuid
          AND status = 'quarantined'
          AND storage_key IS NOT NULL
          AND (${cursor ?? null}::uuid IS NULL OR id > ${cursor ?? null}::uuid)
        ORDER BY id
        LIMIT ${request.batchSize}
      `.execute(tx);
      return result.rows.map((row) => ({
        cursor: String(row["id"]),
        id: String(row["id"]),
        tenantId: String(row["tenant_id"]),
        storageKey: String(row["storage_key"]),
        contentType: String(row["content_type"] ?? "application/octet-stream"),
        expectedSha256: String(row["sha256"] ?? ""),
      }));
    },

    async confirmDeleted(input, tx) {
      const result = await sql`
        UPDATE document.attachment_derivative
        SET storage_bucket = NULL, storage_key = NULL, updated_at = now(), updated_by = ${input.principalId}::uuid
        WHERE id = ${input.id}::uuid AND tenant_id = ${input.tenantId}::uuid
          AND status = 'quarantined'
          AND storage_key = ${input.expectedStorageKey}
      `.execute(tx);
      return { updated: Number(result.numAffectedRows ?? 0n) > 0 };
    },
  };
}
