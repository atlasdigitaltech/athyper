import { parseInstant } from "@athyper/platform-temporal";
import { createHash, randomUUID } from "node:crypto";
import type {
  AttachmentIdentity,
  AttachmentLifecycleScheduler,
  AttachmentProvenance,
  AttachmentStatus,
  AttachmentUploadIntent,
  DerivativeRebuildControl,
  LegalHoldRepository,
  SeriesRepository,
  StagedUpload,
} from "@athyper/server-contract-attachments";
import type { OutboxWriter } from "@athyper/server-contract-events";
import type { MalwareScanner } from "@athyper/server-contract-malware-scanning";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type {
  AttachmentQuotaLedger,
  AttachmentQuotaPolicyResolver,
} from "./quota.js";

export interface AttachmentRecord {
  readonly id: string;
  readonly status: AttachmentStatus;
  readonly fileName?: string;
  readonly contentType?: string;
  readonly textExtractionStatus?: string | null;
  readonly storageKey: string;
  readonly sizeBytes?: number;
  readonly sha256?: string;
  readonly provenance?: AttachmentProvenance;
  readonly quarantineKey?: string;
  readonly isCurrent: boolean;
  readonly isActive: boolean;
  readonly hasLegalHold: boolean;
  readonly expiresAt?: string;
  readonly retentionUntil?: string;
  readonly seriesId?: string;
  readonly entityType?: string;
  readonly entityId?: string;
}

export interface AttachmentRepository<T> {
  /** Serializes staging retries for one tenant-scoped attachment identity when supported. */
  lockForStaging?(identity: AttachmentIdentity, tx: T): Promise<void>;
  createStaged(
    input: AttachmentUploadIntent & { storageKey: string; expiresAt: string },
    tx: T,
  ): Promise<AttachmentRecord>;
  load(identity: AttachmentIdentity, tx: T): Promise<AttachmentRecord | null>;
  /** Tenant-scoped read used only after the owning attachment authorization command succeeds. */
  loadForDownload?(
    identity: AttachmentIdentity,
    tx: T,
  ): Promise<AttachmentRecord | null>;
  /** Privileged maintenance path; implementations must authorize a service principal and remain tenant-scoped. */
  loadForMaintenance?(
    identity: AttachmentIdentity,
    tx: T,
  ): Promise<AttachmentRecord | null>;
  finalizeClean(
    identity: AttachmentIdentity,
    input: {
      storageKey: string;
      sha256: string;
      sizeBytes: number;
      contentType: string;
    },
    tx: T,
  ): Promise<AttachmentRecord>;
  quarantine(
    identity: AttachmentIdentity,
    reason: string,
    tx: T,
  ): Promise<void>;
  deactivate(
    identity: AttachmentIdentity,
    reason: string,
    tx: T,
  ): Promise<void>;
  expire(identity: AttachmentIdentity, tx: T): Promise<void>;
  markPurged(identity: AttachmentIdentity, tx: T): Promise<void>;
  markPurgedForMaintenance?(identity: AttachmentIdentity, tx: T): Promise<void>;
  listRetentionCandidates?(
    input: { tenantId: string; before: string; limit: number },
    tx: T,
  ): Promise<readonly string[]>;
}

export interface AttachmentLifecycleOptions<T> {
  readonly transactions: PlaneTransactionCoordinator<T>;
  readonly repository: AttachmentRepository<T>;
  readonly storage: ObjectStorage;
  readonly scanner: MalwareScanner;
  readonly quota: AttachmentQuotaLedger<T>;
  readonly quotaPolicies: AttachmentQuotaPolicyResolver;
  readonly outbox: OutboxWriter<T>;
  readonly scheduler?: AttachmentLifecycleScheduler;
  readonly uploadUrlTtlSeconds?: number;
  readonly seriesRepository?: SeriesRepository<T>;
  readonly legalHoldRepository?: LegalHoldRepository<T>;
  readonly now?: () => Date;
  /** Overall deadline for downloading and scanning one attachment during finalize(). Default 5 minutes. */
  readonly scanStreamTimeoutMs?: number;
}

export interface AttachmentFinalizeOptions {
  /** Aborting releases the in-flight download/scan stream instead of leaving it to idle out. */
  readonly signal?: AbortSignal;
}

export interface AttachmentLifecycle {
  stage(input: AttachmentUploadIntent): Promise<StagedUpload>;
  finalize(
    identity: AttachmentIdentity,
    contentType: string,
    options?: AttachmentFinalizeOptions,
  ): Promise<AttachmentRecord>;
  status(identity: AttachmentIdentity): Promise<AttachmentRecord>;
  createAuthorizedDownload(
    identity: AttachmentIdentity,
    expirySeconds?: number,
  ): Promise<{
    readonly attachmentId: string;
    readonly url: string;
    readonly expiresAt: string;
  }>;
  deactivate(identity: AttachmentIdentity, reason?: string): Promise<void>;
  expire(identity: AttachmentIdentity): Promise<void>;
  purge(identity: AttachmentIdentity): Promise<boolean>;
  cleanupRetention(
    input: Pick<AttachmentIdentity, "planeKey" | "tenantId" | "principalId"> & {
      limit?: number;
      before?: string;
    },
  ): Promise<{ examined: number; purged: number; deferred: number }>;
  rebuildDerivatives(
    identity: AttachmentIdentity,
    control: DerivativeRebuildControl,
  ): Promise<void>;
  /** Releases any in-flight finalize() download/scan streams (e.g. on process shutdown). */
  close(): void;
}

export function createAttachmentLifecycle<T>(
  options: AttachmentLifecycleOptions<T>,
): AttachmentLifecycle {
  const uploadTtl = options.uploadUrlTtlSeconds ?? 900;
  const now = options.now ?? (() => new Date());
  const scanStreamTimeoutMs = options.scanStreamTimeoutMs ?? 5 * 60 * 1_000;
  const activeScanOperations = new Set<AbortController>();
  return {
    async stage(input) {
      validUpload(input);
      if (!input.sizeBytes || input.sizeBytes < 1)
        throw new TypeError("Attachment size is required");
      const policy = await options.quotaPolicies.resolve(input);
      const key = stagingKey(input);
      const expiresAt = new Date(
        now().getTime() + policy.reservationTtlSeconds * 1000,
      ).toISOString();
      await options.transactions.run(input.planeKey, input, async (tx) => {
        await options.repository.lockForStaging?.(input, tx);
        if (await options.repository.load(input, tx)) return;

        // The quota reservation has a database foreign key to this resource. Keep both
        // writes in one transaction, but persist the parent attachment first so the FK
        // is valid. A quota failure rolls the staged row back with the transaction.
        await options.repository.createStaged(
          {
            ...input,
            provenance: provenance(input),
            storageKey: key,
            expiresAt,
          },
          tx,
        );
        const reserved = await options.quota.reserve(
          { ...input, bytes: input.sizeBytes!, policy, expiresAt },
          tx,
        );
        if (reserved !== "created")
          throw new Error(
            "Attachment quota reservation already exists without a staged resource",
          );
        await appendLifecycleEvent(
          options.outbox,
          input,
          "attachments.staged",
          `attachment:${input.attachmentId}:staged`,
          { storageKey: key, expiresAt, provenance: provenance(input) },
          tx,
        );
      });
      const current = await options.transactions.run(
        input.planeKey,
        input,
        (tx) => options.repository.load(input, tx),
      );
      if (!current)
        throw new Error(
          "Attachment reservation exists without staged resource",
        );
      awaitingUpload(current, now());
      if (
        (current.fileName !== undefined &&
          current.fileName !== input.fileName) ||
        (current.contentType !== undefined &&
          current.contentType !== input.contentType) ||
        (current.sizeBytes !== undefined &&
          current.sizeBytes !== input.sizeBytes) ||
        current.entityType !== input.entityType ||
        current.entityId !== input.entityId
      ) {
        throw new AttachmentConflictError(
          "Attachment staging parameters do not match the existing upload",
        );
      }
      const ttl = Math.min(
        uploadTtl,
        Math.floor(
          (parseInstant(current.expiresAt ?? expiresAt) - now().getTime()) /
            1000,
        ),
      );
      if (ttl < 1)
        throw new AttachmentConflictError("Attachment upload has expired");
      return {
        attachmentId: input.attachmentId,
        storageKey: current.storageKey,
        uploadUrl: await options.storage.createUploadUrl(
          current.storageKey,
          ttl,
        ),
        expiresAt: new Date(now().getTime() + ttl * 1000).toISOString(),
      };
    },

    async finalize(identity, contentType, finalizeOptions) {
      const current = await options.transactions.run(
        identity.planeKey,
        identity,
        (tx) => options.repository.load(identity, tx),
      );
      if (!current) throw new Error("Attachment not found");
      if (current.status === "active" && current.isActive) return current;
      awaitingUpload(current, now());
      if (
        current.contentType !== undefined &&
        current.contentType !== contentType
      )
        throw new AttachmentConflictError(
          "Content type does not match the staged upload",
        );
      if (!options.storage.getStream)
        throw new Error(
          "Streaming object reads are required to finalize attachments",
        );

      // Each attempt scans its own immutable copy. Upload URLs can still overwrite
      // the staging object, but cannot change this copy or another attempt's result.
      const destinationKey = activeKey(identity);
      let saved: AttachmentRecord;
      let integrity: { sizeBytes: number; sha256: string };
      // Bounds the download+scan phase to timeout / caller abort / process shutdown, and — via
      // this signal reaching storage.getStream() — releases the underlying S3 stream on any of
      // those, rather than leaving it idling on a connection nobody is still waiting on.
      const deadline = createStreamDeadline(
        scanStreamTimeoutMs,
        finalizeOptions?.signal,
        activeScanOperations,
      );
      try {
        if (!(await options.storage.exists(current.storageKey)))
          throw new AttachmentConflictError(
            "Attachment upload is not available",
          );
        await options.storage.copy(current.storageKey, destinationKey);
        const source = await options.storage.getStream(destinationKey, {
          signal: deadline.signal,
        });
        const measured = measure(source, current.sizeBytes);
        const scan = await options.scanner.scan({
          content: measured.content,
          contentType,
          fileName: current.fileName ?? current.id,
          sizeBytes: current.sizeBytes,
          signal: deadline.signal,
        });
        if (scan.status !== "clean") {
          await options.transactions.run(
            identity.planeKey,
            identity,
            async (tx) => {
              await options.repository.lockForStaging?.(identity, tx);
              const latest = await options.repository.load(identity, tx);
              if (!latest) throw new Error("Attachment not found");
              awaitingUpload(latest, now());
              await options.repository.quarantine(
                identity,
                "malware_detected",
                tx,
              );
              await options.quota.release(identity, tx);
              await appendLifecycleEvent(
                options.outbox,
                identity,
                "attachments.quarantined",
                `attachment:${identity.attachmentId}:quarantined`,
                { reason: "malware_detected", scan },
                tx,
              );
            },
          );
          throw new Error("Attachment was quarantined");
        }
        integrity = measured.result();
        if (
          integrity.sizeBytes < 1 ||
          (current.sizeBytes !== undefined &&
            integrity.sizeBytes !== current.sizeBytes)
        )
          throw new AttachmentConflictError(
            "Uploaded size does not match the staged upload",
          );
        const policy = await options.quotaPolicies.resolve(identity);
        saved = await options.transactions.run(
          identity.planeKey,
          identity,
          async (tx) => {
            await options.repository.lockForStaging?.(identity, tx);
            const latest = await options.repository.load(identity, tx);
            if (!latest) throw new Error("Attachment not found");
            if (latest.status === "active" && latest.isActive) return latest;
            awaitingUpload(latest, now());
            await options.quota.commit(
              { ...identity, actualBytes: integrity.sizeBytes, policy },
              tx,
            );
            const finalized = await options.repository.finalizeClean(
              identity,
              { storageKey: destinationKey, ...integrity, contentType },
              tx,
            );
            await appendLifecycleEvent(
              options.outbox,
              identity,
              "attachments.finalized",
              `attachment:${identity.attachmentId}:finalized:${integrity.sha256}`,
              {
                storageKey: destinationKey,
                ...integrity,
                contentType,
                provenance: current.provenance,
              },
              tx,
            );
            await appendFinalizationRequests(
              options.outbox,
              identity,
              integrity.sha256,
              tx,
            );
            return finalized;
          },
        );
      } catch (error) {
        // Dispose before awaiting cleanup: dispose() aborts this call's deadline signal, which is
        // the same signal getStream() was given, so it releases the S3 stream immediately. If
        // storage.delete() were awaited first, a stalled delete (or the failure having nothing to
        // do with the deadline at all, e.g. quarantine) would leave the stream open until the
        // timeout separately fires later.
        deadline.dispose();
        await options.storage.delete(destinationKey).catch(() => undefined);
        throw error;
      } finally {
        deadline.dispose();
      }
      if (saved.storageKey !== destinationKey) {
        await options.storage.delete(destinationKey).catch(() => undefined);
        return saved;
      }
      await options.storage.delete(current.storageKey).catch(() => undefined);
      await dispatchFinalization(options.scheduler, identity, integrity.sha256);
      return saved;
    },

    async status(identity) {
      const current = await options.transactions.run(
        identity.planeKey,
        identity,
        (tx) => options.repository.load(identity, tx),
      );
      if (!current) throw new Error("Attachment not found");
      return current;
    },

    async createAuthorizedDownload(identity, expirySeconds = 120) {
      if (!Number.isSafeInteger(expirySeconds))
        throw new TypeError("Download expiry must be an integer");
      let ttl = Math.min(Math.max(expirySeconds, 30), 300);
      const current = await options.transactions.run(
        identity.planeKey,
        identity,
        (tx) =>
          (options.repository.loadForDownload ?? options.repository.load)(
            identity,
            tx,
          ),
      );
      if (!current) throw new Error("Attachment not found");
      if (current.status !== "active" || !current.isActive || !current.sha256)
        throw new AttachmentDownloadError(
          "ATTACHMENT_DOWNLOAD_UNAVAILABLE",
          "Only active, verified attachments may be downloaded",
        );
      if (
        current.expiresAt &&
        parseInstant(current.expiresAt) <= now().getTime()
      )
        throw new AttachmentDownloadError(
          "ATTACHMENT_DOWNLOAD_EXPIRED",
          "The attachment download has expired",
        );
      if (current.expiresAt)
        ttl = Math.min(
          ttl,
          Math.floor(
            (parseInstant(current.expiresAt) - now().getTime()) / 1000,
          ),
        );
      if (ttl < 1)
        throw new AttachmentDownloadError(
          "ATTACHMENT_DOWNLOAD_EXPIRED",
          "The attachment download has expired",
        );
      const expiresAt = new Date(now().getTime() + ttl * 1000).toISOString();
      return {
        attachmentId: current.id,
        url: await options.storage.createDownloadUrl(current.storageKey, ttl),
        expiresAt,
      };
    },

    async deactivate(identity, reason = "deactivated") {
      await options.transactions.run(
        identity.planeKey,
        identity,
        async (tx) => {
          await options.repository.lockForStaging?.(identity, tx);
          if (!(await options.repository.load(identity, tx)))
            throw new Error("Attachment not found");
          await options.repository.deactivate(identity, reason, tx);
          await options.quota.release(identity, tx);
          await appendLifecycleEvent(
            options.outbox,
            identity,
            "attachments.deactivated",
            `attachment:${identity.attachmentId}:deactivated`,
            { reason },
            tx,
          );
        },
      );
      await options.scheduler?.schedulePurge(identity, {
        jobId: `attachment:${identity.attachmentId}:purge`,
      });
    },

    async expire(identity) {
      await options.transactions.run(
        identity.planeKey,
        identity,
        async (tx) => {
          await options.repository.expire(identity, tx);
          await options.quota.release(identity, tx);
          await appendLifecycleEvent(
            options.outbox,
            identity,
            "attachments.expired",
            `attachment:${identity.attachmentId}:expired`,
            {},
            tx,
          );
        },
      );
      await options.scheduler?.schedulePurge(identity, {
        jobId: `attachment:${identity.attachmentId}:purge`,
      });
    },

    async purge(identity) {
      const current = await options.transactions.run(
        identity.planeKey,
        identity,
        (tx) => options.repository.load(identity, tx),
      );
      if (
        !current ||
        current.hasLegalHold ||
        retentionActive(current.retentionUntil, now())
      )
        return false;
      if (
        current.seriesId &&
        options.seriesRepository &&
        options.legalHoldRepository
      ) {
        const [held, series] = await options.transactions.run(
          identity.planeKey,
          identity,
          (tx) =>
            Promise.all([
              options.legalHoldRepository!.hasActiveHold(
                identity.tenantId,
                current.seriesId!,
                tx,
              ),
              options.seriesRepository!.load(
                identity.tenantId,
                current.seriesId!,
                tx,
              ),
            ]),
        );
        if (held || retentionActive(series?.retentionUntil ?? undefined, now()))
          return false;
      }
      await options.storage.delete(current.storageKey).catch(() => undefined);
      await options.transactions.run(
        identity.planeKey,
        identity,
        async (tx) => {
          await options.repository.markPurged(identity, tx);
          await options.quota.release(identity, tx);
          await appendLifecycleEvent(
            options.outbox,
            identity,
            "attachments.purged",
            `attachment:${identity.attachmentId}:purged`,
            { sha256: current.sha256 },
            tx,
          );
        },
      );
      return true;
    },

    async cleanupRetention(input) {
      if (
        !options.repository.listRetentionCandidates ||
        !options.repository.loadForMaintenance ||
        !options.repository.markPurgedForMaintenance
      )
        throw new Error(
          "Attachment repository does not support privileged retention cleanup",
        );
      const limit = Math.min(Math.max(input.limit ?? 100, 1), 1000);
      const before = input.before ?? now().toISOString();
      const ids = await options.transactions.run(input.planeKey, input, (tx) =>
        options.repository.listRetentionCandidates!(
          { tenantId: input.tenantId, before, limit },
          tx,
        ),
      );
      let purged = 0;
      for (const attachmentId of ids) {
        const identity = { ...input, attachmentId };
        const current = await options.transactions.run(
          input.planeKey,
          identity,
          (tx) => options.repository.loadForMaintenance!(identity, tx),
        );
        if (
          !current ||
          current.hasLegalHold ||
          retentionActive(current.retentionUntil, now())
        )
          continue;
        if (
          current.seriesId &&
          options.seriesRepository &&
          options.legalHoldRepository
        ) {
          const [held, series] = await options.transactions.run(
            input.planeKey,
            identity,
            (tx) =>
              Promise.all([
                options.legalHoldRepository!.hasActiveHold(
                  input.tenantId,
                  current.seriesId!,
                  tx,
                ),
                options.seriesRepository!.load(
                  input.tenantId,
                  current.seriesId!,
                  tx,
                ),
              ]),
          );
          if (
            held ||
            retentionActive(series?.retentionUntil ?? undefined, now())
          )
            continue;
        }
        await options.storage.delete(current.storageKey).catch(() => undefined);
        await options.transactions.run(input.planeKey, identity, async (tx) => {
          await options.repository.markPurgedForMaintenance!(identity, tx);
          await options.quota.release(identity, tx);
          await appendLifecycleEvent(
            options.outbox,
            identity,
            "attachments.purged",
            `attachment:${attachmentId}:purged`,
            { sha256: current.sha256 },
            tx,
          );
        });
        purged += 1;
      }
      return { examined: ids.length, purged, deferred: ids.length - purged };
    },

    async rebuildDerivatives(identity, control) {
      validRebuild(control);
      const current = await options.transactions.run(
        identity.planeKey,
        identity,
        async (tx) => {
          const record = await options.repository.load(identity, tx);
          if (!record || record.status !== "active" || !record.sha256)
            throw new Error(
              "Only active, hashed attachments can rebuild derivatives",
            );
          await appendLifecycleEvent(
            options.outbox,
            identity,
            "attachments.derivatives.rebuild_requested",
            `attachment:${identity.attachmentId}:derivatives:rebuild:${control.requestId}`,
            { sourceSha256: record.sha256, rebuild: control },
            tx,
          );
          return record;
        },
      );
      await options.scheduler?.scheduleDerivatives(
        { ...identity, sourceSha256: current.sha256! },
        {
          jobId: `attachment:${identity.attachmentId}:derivatives:rebuild:${control.requestId}`,
          rebuild: control,
        },
      );
    },

    close() {
      for (const controller of activeScanOperations) {
        controller.abort(new Error("Attachment lifecycle is shutting down"));
      }
    },
  };
}

export class AttachmentDownloadError extends Error {
  constructor(
    readonly code:
      "ATTACHMENT_DOWNLOAD_UNAVAILABLE" | "ATTACHMENT_DOWNLOAD_EXPIRED",
    message: string,
  ) {
    super(message);
  }
}

export class AttachmentConflictError extends Error {}

function awaitingUpload(record: AttachmentRecord, now: Date): void {
  if (
    !record.isActive ||
    !["uploading", "uploaded", "pending"].includes(record.status)
  )
    throw new AttachmentConflictError("Attachment is not awaiting upload");
  if (record.expiresAt && parseInstant(record.expiresAt) <= now.getTime())
    throw new AttachmentConflictError("Attachment upload has expired");
}

interface StreamDeadline {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
}

/**
 * One combined AbortSignal covering the finalize() download+scan phase's timeout, an optional
 * caller-supplied abort, and process shutdown — mirroring the ClamAV adapter's own deadline
 * pattern so the same signal can reach both storage.getStream() and scanner.scan(), and release
 * the underlying S3 stream regardless of which of the three actually fires.
 */
function createStreamDeadline(
  timeoutMs: number,
  externalSignal: AbortSignal | undefined,
  activeOperations: Set<AbortController>,
): StreamDeadline {
  const timeout = new AbortController();
  const timer = setTimeout(
    () =>
      timeout.abort(
        new Error(`Attachment scan stream exceeded ${timeoutMs} ms`),
      ),
    timeoutMs,
  );
  timer.unref();
  const shutdown = new AbortController();
  activeOperations.add(shutdown);
  const signal = AbortSignal.any([
    timeout.signal,
    shutdown.signal,
    ...(externalSignal ? [externalSignal] : []),
  ]);
  const dispose = () => {
    // Settle any losing read/scan wait before removing this operation's cancellation source.
    shutdown.abort();
    clearTimeout(timer);
    activeOperations.delete(shutdown);
  };
  return { signal, dispose };
}

function measure(source: AsyncIterable<Uint8Array>, expectedBytes?: number) {
  const hash = createHash("sha256");
  let sizeBytes = 0;
  let completed = false;
  const content = (async function* () {
    for await (const chunk of source) {
      if (!(chunk instanceof Uint8Array))
        throw new TypeError("Object stream yielded a non-byte chunk");
      sizeBytes += chunk.byteLength;
      if (expectedBytes !== undefined && sizeBytes > expectedBytes)
        throw new AttachmentConflictError(
          "Uploaded size exceeds the staged upload",
        );
      hash.update(chunk);
      yield chunk;
    }
    completed = true;
  })();
  return {
    content,
    result: () => {
      if (!completed)
        throw new Error(
          "Malware scanner did not consume the complete object stream",
        );
      return { sizeBytes, sha256: hash.digest("hex") };
    },
  };
}

function provenance(input: AttachmentUploadIntent): AttachmentProvenance {
  return input.provenance ?? { source: "user_upload" };
}
function stagingKey(input: AttachmentIdentity) {
  return `quarantine/${input.planeKey}/${input.tenantId}/${input.attachmentId}/${randomUUID()}`;
}
function activeKey(input: AttachmentIdentity) {
  return `attachments/${input.planeKey}/${input.tenantId}/${input.attachmentId}/${randomUUID()}/original`;
}
function retentionActive(value: string | undefined, now: Date) {
  return Boolean(value && new Date(value) > now);
}
function validUpload(input: AttachmentUploadIntent) {
  if (
    !uuid(input.attachmentId) ||
    !uuid(input.tenantId) ||
    !uuid(input.principalId)
  )
    throw new TypeError("Attachment identity must contain UUIDs");
  if (!input.fileName.trim() || !input.contentType.trim())
    throw new TypeError("Attachment filename and content type are required");
}
function validRebuild(input: DerivativeRebuildControl) {
  if (
    !input.reason.trim() ||
    !input.requestId.trim() ||
    !["missing", "failed", "all"].includes(input.mode)
  )
    throw new TypeError("Derivative rebuild control is invalid");
}
function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function appendLifecycleEvent<T>(
  outbox: OutboxWriter<T>,
  identity: AttachmentIdentity,
  eventType: string,
  eventKey: string,
  payload: Readonly<Record<string, unknown>>,
  tx: T,
) {
  await outbox.append(
    {
      tenantId: identity.tenantId,
      topic: "attachments.lifecycle",
      eventType,
      eventKey,
      entityType: "document.attachment",
      entityId: identity.attachmentId,
      aggregateType: "document.attachment",
      aggregateId: identity.attachmentId,
      actorId: identity.principalId,
      payload: { ...identity, ...payload },
    },
    tx,
  );
}
async function appendFinalizationRequests<T>(
  outbox: OutboxWriter<T>,
  identity: AttachmentIdentity,
  digest: string,
  tx: T,
) {
  await appendLifecycleEvent(
    outbox,
    identity,
    "attachments.extraction.requested",
    `attachment:${identity.attachmentId}:extract:${digest}`,
    { jobId: `attachment:${identity.attachmentId}:extract:${digest}` },
    tx,
  );
  await appendLifecycleEvent(
    outbox,
    identity,
    "attachments.derivatives.requested",
    `attachment:${identity.attachmentId}:derivatives:${digest}`,
    {
      sourceSha256: digest,
      jobId: `attachment:${identity.attachmentId}:derivatives:${digest}`,
    },
    tx,
  );
}
async function dispatchFinalization(
  scheduler: AttachmentLifecycleScheduler | undefined,
  identity: AttachmentIdentity,
  digest: string,
) {
  if (!scheduler) return;
  await Promise.allSettled([
    scheduler.scheduleExtraction(identity, {
      jobId: `attachment:${identity.attachmentId}:extract:${digest}`,
    }),
    scheduler.scheduleDerivatives(
      { ...identity, sourceSha256: digest },
      { jobId: `attachment:${identity.attachmentId}:derivatives:${digest}` },
    ),
  ]);
}
