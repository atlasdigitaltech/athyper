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
import { fingerprintCommand, parseIdempotencyKey, type CommandExecutionStore, type OutboxWriter } from "@athyper/server-contract-events";
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
  readonly expectedSeriesVersion?: number;
  readonly expectedCurrentAttachmentId?: string | null;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly pendingCleanupKeys?: readonly string[];
}

export interface AttachmentRepository<T> {
  archiveOutcome?(identity: AttachmentIdentity, tx: T): Promise<{ readonly activeLinks: number; readonly legalHold: boolean }>;
  archive?(identity: AttachmentIdentity, tx: T): Promise<{ readonly activeLinks: number; readonly legalHold: boolean }>;
  setCategory?(identity: AttachmentIdentity, input: { readonly entityType: string; readonly entityId: string; readonly category: "general" | "evidence" }, tx: T): Promise<void>;
  manageFolder?(
    identity: AttachmentIdentity,
    input: { readonly command: "create" | "move" | "delete"; readonly entityType: string; readonly entityId: string; readonly folderId: string | null; readonly expectedRevision: number; readonly name?: string; readonly parentFolderId?: string; readonly attachmentId?: string },
    tx: T,
  ): Promise<{ readonly revision: number | undefined }>;
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
      expectedSeriesVersion?: number;
      expectedCurrentAttachmentId?: string | null;
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
  /** Entity attachment association removal. Production repositories must implement it. */
  unlink?(
    identity: AttachmentIdentity,
    target: { readonly entityType: string; readonly entityId: string },
    tx: T,
  ): Promise<{ readonly unlinked: boolean; readonly orphaned: boolean }>;
  /** Renames the series display label using the reader-issued series revision. */
  rename?(
    identity: AttachmentIdentity,
    input: { readonly displayName: string; readonly expectedSeriesRevision: string },
    tx: T,
  ): Promise<AttachmentRecord | null>;
  /** Returns whether the attachment series still has a live association. */
  hasActiveLinks?(
    identity: AttachmentIdentity,
    tx: T,
  ): Promise<boolean>;
  /**
   * Expires a still-staged record and reports whether this call changed it.
   * A false result means a concurrent finalization, cancellation, or prior
   * expiry won the race and must not release quota or publish an expiry event.
   */
  expire(identity: AttachmentIdentity, tx: T): Promise<boolean | void>;
  markPurged(identity: AttachmentIdentity, tx: T): Promise<void>;
  markPurgedForMaintenance?(identity: AttachmentIdentity, tx: T): Promise<void>;
  /** All object keys owned by this attachment, including generated derivatives. */
  purgeObjectKeys?(identity: AttachmentIdentity, tx: T): Promise<readonly string[]>;
  listPendingObjectCleanup?(input: { tenantId: string; limit: number }, tx: T): Promise<readonly { attachmentId: string; keys: readonly string[] }[]>;
  removePendingObjectCleanup?(identity: AttachmentIdentity, keys: readonly string[], tx: T): Promise<void>;
  addPendingObjectCleanup?(identity: AttachmentIdentity, keys: readonly string[], tx: T): Promise<void>;
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
  /** Durable receipts cover retried folder and lifecycle mutation commands. */
  readonly commandExecutions?: CommandExecutionStore<T, any>;
  readonly scheduler?: AttachmentLifecycleScheduler;
  readonly uploadUrlTtlSeconds?: number;
  readonly seriesRepository?: SeriesRepository<T>;
  readonly legalHoldRepository?: LegalHoldRepository<T>;
  readonly now?: () => Date;
  /** Overall deadline for downloading and scanning one attachment during finalize(). Default 5 minutes. */
  readonly scanStreamTimeoutMs?: number;
}

export interface AttachmentFinalizeOptions {
  /** Re-admit current record permissions and mandatory policy after the potentially long scan. */
  readonly authorizeCommit?: () => Promise<void>;
  /** Aborting releases the in-flight download/scan stream instead of leaving it to idle out. */
  readonly signal?: AbortSignal;
}

export interface AttachmentLifecycle {
  archiveOutcome?(identity: AttachmentIdentity): Promise<{ readonly activeLinks: number; readonly legalHold: boolean }>;
  archive?(identity: AttachmentIdentity, input?: { readonly idempotencyKey?: string }): Promise<{ readonly activeLinks: number; readonly legalHold: boolean }>;
  setCategory?(identity: AttachmentIdentity, input: { readonly entityType: string; readonly entityId: string; readonly category: "general" | "evidence"; readonly idempotencyKey?: string }): Promise<void>;
  manageFolder?(
    identity: AttachmentIdentity,
    input: { readonly command: "create" | "move" | "delete"; readonly entityType: string; readonly entityId: string; readonly folderId: string | null; readonly expectedRevision: number; readonly idempotencyKey: string; readonly name?: string; readonly parentFolderId?: string; readonly attachmentId?: string },
  ): Promise<{ readonly folderId: string | null; readonly revision: number }>;
  stage(input: AttachmentUploadIntent): Promise<StagedUpload>;
  finalize(
    identity: AttachmentIdentity,
    contentType: string,
    options?: AttachmentFinalizeOptions,
  ): Promise<AttachmentRecord>;
  status(identity: AttachmentIdentity): Promise<AttachmentRecord>;
  /** Only after the owning record capability has admitted this exact attachment. */
  authorizedStatus?(identity: AttachmentIdentity): Promise<AttachmentRecord>;
  createAuthorizedDownload(
    identity: AttachmentIdentity,
    expirySeconds?: number,
  ): Promise<{
    readonly attachmentId: string;
    readonly url: string;
    readonly expiresAt: string;
  }>;
  deactivate(identity: AttachmentIdentity, reason?: string): Promise<void>;
  unlink?(
    identity: AttachmentIdentity,
    target: { readonly entityType: string; readonly entityId: string },
  ): Promise<{ readonly unlinked: boolean; readonly orphaned: boolean }>;
  rename?(
    identity: AttachmentIdentity,
    input: { readonly displayName: string; readonly expectedSeriesRevision: string; readonly idempotencyKey?: string },
  ): Promise<AttachmentRecord>;
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
  async function executeRetriableCommand<TResult extends Readonly<Record<string, unknown>>>(
    identity: AttachmentIdentity,
    commandCode: string,
    idempotencyKey: string | undefined,
    request: Readonly<Record<string, unknown>>,
    work: (tx: T) => Promise<TResult>,
  ): Promise<TResult> {
    if (!idempotencyKey) return options.transactions.run(identity.planeKey, identity, work);
    const key = parseIdempotencyKey(idempotencyKey);
    if (!key.ok) throw new TypeError("Attachment idempotency key is invalid");
    if (!options.commandExecutions)
      throw new Error("Attachment command receipts are unavailable");
    return options.transactions.run(identity.planeKey, identity, async (tx) => {
      const receipt = await options.commandExecutions!.begin({
        tenantId: identity.tenantId,
        commandCode,
        idempotencyKey: key.value,
        requestFingerprint: fingerprintCommand({ principalId: identity.principalId, ...request }),
        actorPrincipalId: identity.principalId,
        sourceService: "attachments",
      }, tx);
      if (receipt.kind === "replay") return receipt.result as TResult;
      if (receipt.kind !== "started")
        throw new AttachmentConflictError("Attachment command is already in progress or conflicts with a prior request");
      const result = await work(tx);
      await options.commandExecutions!.complete(receipt.executionId, result, identity.principalId, tx);
      return result;
    });
  }
  async function purgeAttachment(identity: AttachmentIdentity, maintenance = false): Promise<boolean> {
    return options.transactions.run(identity.planeKey, identity, async tx => {
      // The production maintenance read locks both attachment and series until
      // object deletion and the durable marker commit. FK link/hold inserts and
      // series retention changes serialize against those row locks.
      const current = await (options.repository.loadForMaintenance?.(identity, tx) ?? options.repository.load(identity, tx));
      if (!current || !["expired", "deleted", "orphaned"].includes(current.status) ||
          current.storageKey === `purged/${current.id}` || current.hasLegalHold ||
          retentionActive(current.retentionUntil, now())) return false;
      if (options.repository.hasActiveLinks && await options.repository.hasActiveLinks(identity, tx)) return false;
      if (current.seriesId) {
        if (options.legalHoldRepository && await options.legalHoldRepository.hasActiveHold(identity.tenantId, current.seriesId, tx)) return false;
        const series = await options.seriesRepository?.load(identity.tenantId, current.seriesId, tx);
        if (retentionActive(series?.retentionUntil ?? undefined, now())) return false;
      }
      // A storage failure must fail the job and retain its original key for retry.
      // If the DB commit fails afterward, deleting the same key again is safe.
      const objectKeys=[...new Set(await (options.repository.purgeObjectKeys?.(identity,tx) ?? [current.storageKey,...(current.pendingCleanupKeys ?? [])]))];
      // The database marker is written only after every owned key is deleted.
      // A failed delete leaves this manifest durable for a restart retry.
      for (const key of objectKeys) await options.storage.delete(key);
      if (maintenance) await options.repository.markPurgedForMaintenance!(identity, tx);
      else await options.repository.markPurged(identity, tx);
      await options.quota.release(identity, tx);
      await appendLifecycleEvent(options.outbox, identity, "attachments.purged",
        `attachment:${identity.attachmentId}:purged`, { sha256: current.sha256 }, tx);
      return true;
    });
  }
  return {
    async archiveOutcome(identity) {
      if (!options.repository.archiveOutcome) throw new Error("Attachment repository does not support archive outcome");
      return options.transactions.run(identity.planeKey,identity,tx=>options.repository.archiveOutcome!(identity,tx));
    },
    async archive(identity, input = {}) {
      if (!options.repository.archive) throw new Error("Attachment repository does not support archive");
      const outcome=await executeRetriableCommand(identity,"attachments.archive",input.idempotencyKey,{attachmentId:identity.attachmentId},async tx=>{ const result=await options.repository.archive!(identity,tx); if(result.legalHold) throw new AttachmentConflictError("A legal hold prevents lifecycle archive"); await options.quota.release(identity,tx); await appendLifecycleEvent(options.outbox,identity,"attachments.archived",`attachment:${identity.attachmentId}:archived`,result,tx); return result; });
      await options.scheduler?.scheduleSearchRemoval?.(identity,"archived");
      await options.scheduler?.schedulePurge(identity,{jobId:`attachment:${identity.attachmentId}:purge`}); return outcome;
    },
    async setCategory(identity, input) {
      if (!options.repository.setCategory || !["general", "evidence"].includes(input.category)) throw new TypeError("Attachment category is invalid");
      await executeRetriableCommand(identity,"attachments.category",input.idempotencyKey,{attachmentId:identity.attachmentId,entityType:input.entityType,entityId:input.entityId,category:input.category},async tx => { await options.repository.setCategory!(identity,input,tx); await appendLifecycleEvent(options.outbox,identity,"attachments.categorized",`attachment:${identity.attachmentId}:category:${input.category}`,{category:input.category},tx); return {category:input.category}; });
    },
    async manageFolder(identity, input) {
      if (!options.repository.manageFolder) throw new Error("Attachment repository does not support folders");
      const key=parseIdempotencyKey(input.idempotencyKey);
      if (!key.ok) throw new TypeError("Attachment folder idempotency key is invalid");
      if (!options.commandExecutions) throw new Error("Attachment folder command receipts are unavailable");
      const folderId = input.folderId;
      if (!(input.command === "move" && folderId === null) && (typeof folderId !== "string" || !uuid(folderId)) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 || !["create", "move", "delete"].includes(input.command) || !input.entityType.trim() || !input.entityId.trim()) throw new TypeError("Attachment folder command is invalid");
      if (input.command === "create" && (!input.name?.trim() || input.name.trim().length > 256)) throw new TypeError("Attachment folder name is invalid");
      if (input.command === "move" && (!input.attachmentId || !uuid(input.attachmentId))) throw new TypeError("Attachment move requires an attachment");
      return options.transactions.run(identity.planeKey, identity, async tx => {
        const receipt=await options.commandExecutions!.begin({tenantId:identity.tenantId,commandCode:"attachments.folder",idempotencyKey:key.value,requestFingerprint:fingerprintCommand({principalId:identity.principalId,folderId,command:input.command,entityType:input.entityType,entityId:input.entityId,expectedRevision:input.expectedRevision,name:input.name,parentFolderId:input.parentFolderId,attachmentId:input.attachmentId}),actorPrincipalId:identity.principalId,sourceService:"attachments"},tx);
        if(receipt.kind === "replay") return receipt.result;
        if(receipt.kind !== "started") throw new AttachmentConflictError("Attachment folder command is already in progress or conflicts with a prior request");
        const changed=await options.repository.manageFolder!(identity, { ...input, folderId }, tx);
        if(changed.revision === undefined) throw new AttachmentConflictError("Attachment workspace has changed; refresh before retrying", "ATTACHMENT_WORKSPACE_REVISION_CONFLICT");
        await appendLifecycleEvent(options.outbox, { ...identity, attachmentId: folderId ?? input.attachmentId! }, `attachments.folder_${input.command}`, `attachment-folder-command:${receipt.executionId}`, { folderId, entityType: input.entityType, entityId: input.entityId }, tx);
        const result={folderId,revision:changed.revision};
        await options.commandExecutions!.complete(receipt.executionId,result,identity.principalId,tx);
        return result;
      });
    },
    async stage(input) {
      validUpload(input);
      if (!input.sizeBytes || input.sizeBytes < 1)
        throw new TypeError("Attachment size is required");
      const key = stagingKey(input);
      await options.transactions.run(input.planeKey, input, async (tx) => {
        await options.repository.lockForStaging?.(input, tx);
        if (await options.repository.load(input, tx)) return;
        // Resolve the current policy only for a new reservation. A retry of an
        // already admitted upload must retain its original reservation and URL
        // lifetime even if policy changed while the browser was transferring.
        const policy = await options.quotaPolicies.resolve(input);
        const expiresAt = new Date(
          now().getTime() + policy.reservationTtlSeconds * 1000,
        ).toISOString();

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
      if (!current.expiresAt)
        throw new AttachmentConflictError("Attachment upload expiry is missing");
      const ttl = Math.min(
        uploadTtl,
        Math.floor(
          (parseInstant(current.expiresAt) - now().getTime()) /
            1000,
        ),
      );
      if (ttl < 1)
        throw new AttachmentConflictError("Attachment upload has expired");
      await options.scheduler?.scheduleStageExpiry?.(input, {
        jobId: `attachment:${input.attachmentId}:expire:${current.expiresAt}`,
        delayMs: Math.max(
          0,
          parseInstant(current.expiresAt) - now().getTime(),
        ),
      });
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
            await finalizeOptions?.authorizeCommit?.();
            deadline.signal.throwIfAborted();
            await options.quota.commit(
              { ...identity, actualBytes: integrity.sizeBytes, policy },
              tx,
            );
            const finalized = await options.repository.finalizeClean(
              identity,
              {
                storageKey: destinationKey,
                ...integrity,
                contentType,
                ...(latest.expectedSeriesVersion !== undefined
                  ? { expectedSeriesVersion: latest.expectedSeriesVersion }
                  : {}),
                ...(latest.expectedCurrentAttachmentId !== undefined
                  ? {
                      expectedCurrentAttachmentId:
                        latest.expectedCurrentAttachmentId,
                    }
                  : {}),
              },
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
        await recordPendingCleanup(options,identity,[destinationKey]);
        throw error;
      } finally {
        deadline.dispose();
      }
      if (saved.storageKey !== destinationKey) {
        await recordPendingCleanup(options,identity,[destinationKey]);
        return saved;
      }
      await cleanPendingKeys(options, identity, [current.storageKey]);
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

    async authorizedStatus(identity) {
      const current = await options.transactions.run(identity.planeKey, identity, tx =>
        (options.repository.loadForDownload ?? options.repository.load)(identity, tx));
      if (!current) throw new Error("Attachment not found");
      return current;
    },

    async rename(identity, input) {
      const displayName = input.displayName.trim();
      if (!displayName || displayName.length > 1024)
        throw new TypeError("Attachment display name must be between 1 and 1024 characters");
      if (!/^[1-9][0-9]*$/.test(input.expectedSeriesRevision) || !Number.isSafeInteger(Number(input.expectedSeriesRevision)) || Number(input.expectedSeriesRevision) > 2_147_483_647)
        throw new TypeError("A positive series revision is required");
      if (!options.repository.rename)
        throw new Error("Attachment repository does not support rename");
      const renamed = await executeRetriableCommand(identity,"attachments.rename",input.idempotencyKey,{attachmentId:identity.attachmentId,displayName,expectedSeriesRevision:input.expectedSeriesRevision},async (tx) => {
        const current = await options.repository.rename!(identity, { displayName, expectedSeriesRevision: input.expectedSeriesRevision }, tx);
        if (!current) throw new AttachmentConflictError("Attachment series changed before it could be renamed");
        await appendLifecycleEvent(options.outbox, identity, "attachments.renamed", `attachment:${identity.attachmentId}:rename:${input.expectedSeriesRevision}`, { displayName, seriesId: current.seriesId }, tx);
        return current as AttachmentRecord & Readonly<Record<string, unknown>>;
      });
      return renamed;
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
        url: await options.storage.createDownloadUrl(current.storageKey, ttl, {
          contentType: "application/octet-stream",
          contentDisposition: `attachment; filename="${(current.fileName ?? "attachment").replace(/[^a-zA-Z0-9 ._()-]/g, "_")}"`,
        }),
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
      await options.scheduler?.scheduleSearchRemoval?.(identity, "deactivated");
      await options.scheduler?.schedulePurge(identity, {
        jobId: `attachment:${identity.attachmentId}:purge`,
      });
    },

    async unlink(identity, target) {
      const result = await options.transactions.run(
        identity.planeKey,
        identity,
        async (tx) => {
          await options.repository.lockForStaging?.(identity, tx);
          if (!options.repository.unlink)
            throw new Error("Attachment repository does not support unlink");
          const outcome = await options.repository.unlink(identity, target, tx);
          if (!outcome.unlinked) throw new AttachmentConflictError("Attachment link was not found");
          await appendLifecycleEvent(
            options.outbox,
            identity,
            "attachments.unlinked",
            `attachment:${identity.attachmentId}:unlinked:${target.entityType}:${target.entityId}`,
            { target, orphaned: outcome.orphaned },
            tx,
          );
          if (outcome.orphaned) await appendLifecycleEvent(options.outbox, identity,
            "attachments.orphaned", `attachment:${identity.attachmentId}:orphaned:${target.entityType}:${target.entityId}`,
            { target, orphaned: true }, tx);
          return outcome;
        },
      );
      await options.scheduler?.scheduleSearchRemoval?.(identity, "unlinked");
      if (result.orphaned)
        await options.scheduler?.schedulePurge(identity, {
          jobId: `attachment:${identity.attachmentId}:purge`,
        });
      return result;
    },

    async expire(identity) {
      const current = await options.transactions.run(
        identity.planeKey,
        identity,
        (tx) => options.repository.load(identity, tx),
      );
      // A delayed job may arrive after a successful finalize, retry, or manual
      // cancellation. It must never expire an active attachment.
      if (
        !current ||
        !["pending", "uploading", "uploaded"].includes(current.status) ||
        !current.expiresAt ||
        parseInstant(current.expiresAt) > now().getTime()
      )
        return;
      const expired = await options.transactions.run(
        identity.planeKey,
        identity,
        async (tx) => {
          const changed = await options.repository.expire(identity, tx);
          if (changed === false) return false;
          await options.quota.release(identity, tx);
          await appendLifecycleEvent(
            options.outbox,
            identity,
            "attachments.expired",
            `attachment:${identity.attachmentId}:expired`,
            {},
            tx,
          );
          return true;
        },
      );
      if (!expired) return;
      await options.scheduler?.schedulePurge(identity, {
        jobId: `attachment:${identity.attachmentId}:purge`,
      });
    },

    purge: identity => purgeAttachment(identity),

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
      const pending = options.repository.listPendingObjectCleanup
        ? await options.transactions.run(input.planeKey,input,tx=>options.repository.listPendingObjectCleanup!({tenantId:input.tenantId,limit},tx))
        : [];
      let deferred = 0;
      for (const candidate of pending) {
        try { await cleanPendingKeys(options,{...input,attachmentId:candidate.attachmentId},candidate.keys); }
        catch { deferred += 1; }
      }
      const ids = await options.transactions.run(input.planeKey, input, (tx) =>
        options.repository.listRetentionCandidates!(
          { tenantId: input.tenantId, before, limit },
          tx,
        ),
      );
      let purged = 0;
      for (const attachmentId of ids)
        if (await purgeAttachment({ ...input, attachmentId }, true)) purged += 1;
      return { examined: ids.length + pending.length, purged, deferred: deferred + ids.length - purged };
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

export class AttachmentConflictError extends Error {
  constructor(message:string, readonly code="ATTACHMENT_CONFLICT"){super(message);}
}

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
    !uuid(input.principalId) ||
    (input.draftId !== undefined && !uuid(input.draftId))
  )
    throw new TypeError("Attachment identity must contain UUIDs");
  if (!input.fileName.trim() || !input.contentType.trim())
    throw new TypeError("Attachment filename and content type are required");
  if (
    input.parentAttachmentId !== undefined &&
    (!uuid(input.parentAttachmentId) ||
      !Number.isSafeInteger(input.expectedSeriesVersion) ||
      input.expectedSeriesVersion! < 1)
  )
    throw new TypeError(
      "A version upload requires its parent attachment and expected series version",
    );
  if (input.expectedSeriesVersion !== undefined && !input.parentAttachmentId)
    throw new TypeError("Expected series version requires a parent attachment");
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

async function recordPendingCleanup<T>(options: AttachmentLifecycleOptions<T>, identity: AttachmentIdentity, keys: readonly string[]): Promise<void> {
  if (!keys.length) return;
  try {
    for (const key of new Set(keys)) await options.storage.delete(key);
  } catch {
    // Compatibility adapters cannot persist the manifest, but must never mask
    // the actual finalize failure. Production repositories implement this port.
    if (options.repository.addPendingObjectCleanup)
      await options.transactions.run(identity.planeKey,identity,tx=>options.repository.addPendingObjectCleanup!(identity,keys,tx));
  }
}

async function cleanPendingKeys<T>(options: AttachmentLifecycleOptions<T>, identity: AttachmentIdentity, keys: readonly string[]): Promise<void> {
  const unique=[...new Set(keys)];
  for (const key of unique) await options.storage.delete(key);
  if (unique.length && options.repository.removePendingObjectCleanup)
    await options.transactions.run(identity.planeKey,identity,tx=>options.repository.removePendingObjectCleanup!(identity,unique,tx));
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
