import { createHash, randomUUID } from "node:crypto";
import type { VerifiedRequestContext, Authorizer } from "@athyper/server-contract-auth";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { OutboxWriter } from "@athyper/server-contract-events";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { GovernedRecordJobDispatcher, ImportValidationRow, ImportValidationSummary, RecordCollectionScopeResolution, RecordCollectionScopeResolver, RecordImportAtomicity, RecordImportConflictPolicy, RecordImportOperation, RecordImportPreview, RecordImportSession, RecordTransferListItem } from "@athyper/server-contract-records";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { RecordServiceError } from "../errors.js";
import { descriptorFor } from "../query-service.js";
import type { GovernedImportAdapterRegistry } from "./import-adapter-registry.js";

type Row = Readonly<Record<string, unknown>>;
export interface StoredImport { readonly session: RecordImportSession; readonly rows: readonly Row[]; readonly validation?: readonly ImportValidationRow[]; readonly summary?: ImportValidationSummary; }
export interface ImportStagingStore<Transaction = unknown> {
  create(session: RecordImportSession, rows: readonly Row[], transaction?: Transaction): Promise<void>;
  get(tenantId: string, sessionId: string, transaction?: Transaction): Promise<StoredImport | null>;
  getChunk?(tenantId: string, sessionId: string, chunkIndex: number, transaction: Transaction): Promise<{ readonly chunkChecksum: string; readonly cumulativeChecksum: string; readonly rowCount: number } | null>;
  /** Must reject duplicate chunk indexes with different checksums and non-contiguous indexes. */
  appendChunk?(input: { tenantId: string; sessionId: string; chunkIndex: number; rows: readonly Row[]; chunkChecksum: string; cumulativeChecksum: string }, transaction: Transaction): Promise<"created" | "replayed">;
  seal?(input: { tenantId: string; sessionId: string; expectedChunkCount: number; checksum: string }, transaction: Transaction): Promise<void>;
  saveValidation(sessionId: string, rows: readonly ImportValidationRow[], transaction?: Transaction, summary?: ImportValidationSummary, errorReportKey?: string): Promise<void>;
  setStatus(sessionId: string, status: RecordImportSession["status"], transaction?: Transaction): Promise<void>;
  cancelImport?(tenantId: string, sessionId: string, cancelledAt: string, transaction: Transaction): Promise<"cancelled" | "already_terminal" | "not_found">;
  saveExportRequest(input: { readonly id: string; readonly tenantId: string; readonly entityCode: string; readonly exactFilter: Readonly<Record<string, unknown>>; readonly actorPrincipalId: string; readonly status: "queued" }, transaction: Transaction): Promise<"created" | "replayed">;
  cancelExport?(tenantId: string, exportRequestId: string, cancelledAt: string, transaction: Transaction): Promise<"cancelled" | "already_terminal" | "not_found">;
  getExport?(tenantId:string,exportRequestId:string,transaction:Transaction):Promise<{entityCode:string;actorPrincipalId:string;status:"queued"|"running"|"completed"|"cancelled"|"failed";artifactKey?:string;rowCount?:number}|null>;
  listOwned?(tenantId:string,principalId:string,limit:number,transaction:Transaction):Promise<readonly RecordTransferListItem[]>;
}
export interface ImportRowValidator { validate(context: VerifiedRequestContext, entityCode: string, row: Row, rowNumber: number, operation?: RecordImportOperation): Promise<ImportValidationRow>; }
export interface ImportErrorReportStore { write(input: { tenantId: string; sessionId: string; content: AsyncIterable<Uint8Array>; contentType: "application/x-ndjson" }): Promise<string>; createDownloadUrl(key: string, expirySeconds: number): Promise<string>; }
export interface CancellableRecordJobDispatcher extends GovernedRecordJobDispatcher { cancel?(jobId: string): Promise<boolean>; }
export type RecordTransferService = ReturnType<typeof createRecordTransferService<unknown>>;

export function createRecordTransferService<Transaction>(options: {
  readonly staging: ImportStagingStore<Transaction>;
  readonly validator: ImportRowValidator;
  readonly jobs: CancellableRecordJobDispatcher;
  readonly metadata: MetadataReader;
  readonly authorizer: Authorizer;
  readonly audit: AuditRecorder<Transaction>;
  readonly outbox: OutboxWriter<Transaction>;
  readonly transactions: PlaneTransactionCoordinator<Transaction>;
  readonly adapters: GovernedImportAdapterRegistry<Transaction>;
  readonly collectionScopes?: RecordCollectionScopeResolver;
  readonly errorReports?: ImportErrorReportStore;
  readonly validationSampleSize?: number;
  readonly now?: () => Date;
  readonly createId?: () => string;
}) {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  return {
    async beginImport(context: VerifiedRequestContext, entityCode: string, sessionId = createId(), operation: RecordImportOperation = "create", configuration: { readonly scopeCoordinate?: Readonly<Record<string, string>>; readonly conflictPolicy?: RecordImportConflictPolicy; readonly atomicity?: RecordImportAtomicity } = {}) {
      const descriptor = await descriptorFor(options.metadata, context, entityCode);
      const scope = await resolveImportScope(options.collectionScopes, context, descriptor, configuration.scopeCoordinate);
      const adapter = options.adapters.select(descriptor, operation);
      await authorizeDescriptorOperation(options.authorizer, context, descriptor, "import", scope.authorizationResource);
      await authorizeImportMode(options.authorizer,context,descriptor,operation,scope.authorizationResource);
      requireChunkStore(options.staging);
      const session: RecordImportSession = Object.freeze({ id: sessionId, tenantId: context.tenantId, entityCode, operation, adapterKey: adapter.key, descriptorHash: descriptor.compiledHash, ...(configuration.scopeCoordinate ? { scopeCoordinate: Object.freeze({ ...configuration.scopeCoordinate }) } : {}), conflictPolicy: configuration.conflictPolicy ?? "reject", atomicity: configuration.atomicity ?? "all_or_nothing", status: "uploading", stagedRowCount: 0, validRowCount: 0, invalidRowCount: 0, checksum: emptyChecksum(), nextChunkIndex: 0, createdAt: now().toISOString(),createdBy:context.principalId });
      await options.transactions.run(context.planeKey, context, async (tx) => {
        await options.staging.create(session, [], tx);
        await appendEvent(options.outbox, context, "records.import.upload_started", `records:import:${sessionId}:upload`, entityCode, sessionId, { sessionId }, tx);
      });
      return session;
    },

    async appendImportChunk(context: VerifiedRequestContext, sessionId: string, chunkIndex: number, rows: readonly Row[]) {
      if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || !rows.length) throw new TypeError("Import chunk index and rows are required");
      requireChunkStore(options.staging);
      const chunkChecksum = digest(stable(rows));
      return options.transactions.run(context.planeKey, context, async (tx) => {
        const staged = await options.staging.get(context.tenantId, sessionId, tx);
        if (!staged || staged.session.status !== "uploading") throw new Error("Import upload session is unavailable");requireOwner(staged.session,context);
        const expected = staged.session.nextChunkIndex ?? 0;
        if (chunkIndex > expected) throw new Error(`Import chunk ${expected} is required before chunk ${chunkIndex}`);
        if (chunkIndex < expected) {
          const stored = await options.staging.getChunk!(context.tenantId, sessionId, chunkIndex, tx);
          if (!stored || stored.chunkChecksum !== chunkChecksum || stored.rowCount !== rows.length) throw new Error("Import chunk idempotency conflict");
          return { sessionId, chunkIndex, rowCount: rows.length, chunkChecksum, cumulativeChecksum: stored.cumulativeChecksum, replayed: true };
        }
        const cumulativeChecksum = digest(`${staged.session.checksum}:${chunkIndex}:${chunkChecksum}`);
        const result = await options.staging.appendChunk!({ tenantId: context.tenantId, sessionId, chunkIndex, rows: structuredClone(rows), chunkChecksum, cumulativeChecksum }, tx);
        return { sessionId, chunkIndex, rowCount: rows.length, chunkChecksum, cumulativeChecksum, replayed: result === "replayed" };
      });
    },

    async completeImportUpload(context: VerifiedRequestContext, sessionId: string, expectedChunkCount: number) {
      requireChunkStore(options.staging);
      return options.transactions.run(context.planeKey, context, async (tx) => {
        const staged = await options.staging.get(context.tenantId, sessionId, tx);
        if (!staged || staged.session.status !== "uploading") throw new Error("Import upload session is unavailable");requireOwner(staged.session,context);
        if ((staged.session.nextChunkIndex ?? 0) !== expectedChunkCount) throw new Error("Import upload has missing chunks");
        await options.staging.seal!({ tenantId: context.tenantId, sessionId, expectedChunkCount, checksum: staged.session.checksum }, tx);
        await appendEvent(options.outbox, context, "records.import.upload_completed", `records:import:${sessionId}:upload-completed`, staged.session.entityCode, sessionId, { sessionId, rowCount: staged.rows.length, checksum: staged.session.checksum }, tx);
        return { ...staged.session, status: "staged" as const };
      });
    },

    async stage(context: VerifiedRequestContext, entityCode: string, rows: readonly Row[], operation: RecordImportOperation = "create", configuration: { readonly scopeCoordinate?: Readonly<Record<string, string>>; readonly conflictPolicy?: RecordImportConflictPolicy; readonly atomicity?: RecordImportAtomicity } = {}) {
      const descriptor = await descriptorFor(options.metadata, context, entityCode);
      const scope = await resolveImportScope(options.collectionScopes, context, descriptor, configuration.scopeCoordinate);
      const adapter = options.adapters.select(descriptor, operation);
      await authorizeDescriptorOperation(options.authorizer, context, descriptor, "import", scope.authorizationResource);
      await authorizeImportMode(options.authorizer,context,descriptor,operation,scope.authorizationResource);
      if (!rows.length) throw new TypeError("Import contains no rows");
      const checksum = digest(stable(rows));
      const session: RecordImportSession = Object.freeze({ id: createId(), tenantId: context.tenantId, entityCode, operation, adapterKey: adapter.key, descriptorHash: descriptor.compiledHash, ...(configuration.scopeCoordinate ? { scopeCoordinate: Object.freeze({ ...configuration.scopeCoordinate }) } : {}), conflictPolicy: configuration.conflictPolicy ?? "reject", atomicity: configuration.atomicity ?? "all_or_nothing", status: "staged", stagedRowCount: rows.length, validRowCount: 0, invalidRowCount: 0, checksum, nextChunkIndex: 1, createdAt: now().toISOString(),createdBy:context.principalId });
      await options.transactions.run(context.planeKey, context, async (tx) => {
        await options.staging.create(session, structuredClone(rows), tx);
        await appendEvent(options.outbox, context, "records.import.staged", `records:import:${session.id}:staged`, entityCode, session.id, { sessionId: session.id, rowCount: rows.length, checksum }, tx);
      });
      return session;
    },

    async validate(context: VerifiedRequestContext, sessionId: string): Promise<RecordImportPreview> {
      const staged = await options.transactions.run(context.planeKey, context, (tx) => options.staging.get(context.tenantId, sessionId, tx));
      if (!staged || ["commit_queued", "running", "committed", "cancelled"].includes(staged.session.status)) throw new Error("Import session is unavailable");requireOwner(staged.session,context);
      const descriptor = await descriptorFor(options.metadata, context, staged.session.entityCode);
      requireDescriptorHash(staged.session, descriptor.compiledHash);
      const scope = await resolveImportScope(options.collectionScopes, context, descriptor, staged.session.scopeCoordinate);
      const adapter = options.adapters.resolve(staged.session.adapterKey, descriptor, staged.session.operation);
      await authorizeDescriptorOperation(options.authorizer, context, descriptor, "import", scope.authorizationResource);
      await authorizeImportMode(options.authorizer,context,descriptor,staged.session.operation,scope.authorizationResource);
      const validation: ImportValidationRow[] = [];
      for (let index = 0; index < staged.rows.length; index += 1) {
        const generic = await options.validator.validate(context, staged.session.entityCode, staged.rows[index]!, index + 1, staged.session.operation);
        const governed = await adapter.validate({ context, descriptor, session: staged.session, scope, row: staged.rows[index]!, rowNumber: index + 1 });
        validation.push({ rowNumber: index + 1, valid: generic.valid && governed.valid, errors: Object.freeze([...generic.errors, ...governed.errors]) });
      }
      const summary = summarize(validation, options.validationSampleSize ?? 100);
      const errorReportKey = summary.invalidCount && options.errorReports ? await options.errorReports.write({ tenantId: context.tenantId, sessionId, content: errorLines(validation), contentType: "application/x-ndjson" }) : undefined;
      await options.transactions.run(context.planeKey, context, async (tx) => {
        const current = await options.staging.get(context.tenantId, sessionId, tx);
        if (!current || ["commit_queued", "running", "committed", "cancelled"].includes(current.session.status) || current.session.checksum !== staged.session.checksum) throw new Error("Import session changed during validation");
        await options.staging.saveValidation(sessionId, validation, tx, summary, errorReportKey);
        await options.staging.setStatus(sessionId, "validated", tx);
        await appendEvent(options.outbox, context, "records.import.validated", `records:import:${sessionId}:validated:${staged.session.checksum}`, staged.session.entityCode, sessionId, { sessionId, summary, errorReportKey }, tx);
      });
      return preview(sessionId, validation, summary);
    },

    async preview(context: VerifiedRequestContext, sessionId: string): Promise<RecordImportPreview> {
      return options.transactions.run(context.planeKey, context, async (tx) => {
        const staged = await options.staging.get(context.tenantId, sessionId, tx);
        if (!staged?.validation || !["validated", "previewed"].includes(staged.session.status)) throw new Error("Import must be validated before preview");requireOwner(staged.session,context);
        const summary = staged.summary ?? summarize(staged.validation, options.validationSampleSize ?? 100);
        await options.staging.setStatus(sessionId, "previewed", tx);
        return preview(sessionId, staged.validation, summary);
      });
    },

    async commit(context: VerifiedRequestContext, sessionId: string) {
      const jobId = `records:import:${sessionId}`;
      const staged = await options.transactions.run(context.planeKey, context, async (tx) => {
        const value = await options.staging.get(context.tenantId, sessionId, tx);
        if (!value) throw new Error("Import session is unavailable");requireOwner(value.session,context);
        if (["commit_queued", "committed"].includes(value.session.status)) return value;
        if (!value.validation || value.session.status === "staged") throw new Error("Import must be validated before commit");
        if (value.session.status !== "previewed") throw new Error("Import must be previewed before commit");
        if (value.session.atomicity === "all_or_nothing" && value.validation.some((row) => !row.valid)) throw new Error("Import contains invalid rows");
        if (!value.validation.some((row) => row.valid)) throw new Error("Import contains no valid rows");
        await options.staging.setStatus(sessionId, "commit_queued", tx);
        await recordTransferAudit(options.audit, context, "records.import.commit_queued", "import", value.session.entityCode, { sessionId, jobId, checksum: value.session.checksum }, tx);
        await appendEvent(options.outbox, context, "records.import.dispatch_requested", jobId, value.session.entityCode, sessionId, { tenantId: context.tenantId, sessionId, checksum: value.session.checksum, actorPrincipalId: context.principalId, jobId }, tx);
        return value;
      });
      await options.jobs.enqueue("import", { planeKey:context.planeKey,tenantId: context.tenantId, sessionId, checksum: staged.session.checksum, actorPrincipalId: context.principalId,context }, { jobId }).catch(() => undefined);
      return { sessionId, jobId, status: "queued" as const };
    },

    async cancelImport(context: VerifiedRequestContext, sessionId: string) {
      if (!options.staging.cancelImport) throw new Error("Import cancellation is not supported by the staging store");
      const jobId = `records:import:${sessionId}`;
      const result = await options.transactions.run(context.planeKey, context, async (tx) => {
        const current=await options.staging.get(context.tenantId,sessionId,tx);if(!current)throw new Error("Import session is unavailable");requireOwner(current.session,context);const state = await options.staging.cancelImport!(context.tenantId, sessionId, now().toISOString(), tx);
        if (state === "not_found") throw new Error("Import session is unavailable");
        if (state === "cancelled") await appendEvent(options.outbox, context, "records.import.cancelled", `${jobId}:cancelled`, "records.import_session", sessionId, { sessionId, jobId }, tx);
        return state;
      });
      if (result === "cancelled") await options.jobs.cancel?.(jobId).catch(() => false);
      return { sessionId, status: result === "cancelled" ? "cancelled" as const : "already_terminal" as const };
    },

    async downloadErrorReport(context: VerifiedRequestContext, sessionId: string, expirySeconds = 300) {
      if (!options.errorReports) throw new Error("Import error reports are not configured");
      const staged = await options.transactions.run(context.planeKey, context, (tx) => options.staging.get(context.tenantId, sessionId, tx));
      if (!staged?.session.errorReportKey) throw new Error("Import error report is unavailable");requireOwner(staged.session,context);
      return { sessionId, url: await options.errorReports.createDownloadUrl(staged.session.errorReportKey, Math.min(Math.max(expirySeconds, 30), 3600)), expiresInSeconds: Math.min(Math.max(expirySeconds, 30), 3600) };
    },

    async requestExport(context: VerifiedRequestContext, entityCode: string, filter: Readonly<Record<string, unknown>>, requestId?: string) {
      await authorizeOperation(options, context, entityCode, "export");
      const exportRequestId = requestId ?? createId(), jobId = `records:export:${exportRequestId}`, exactFilter = structuredClone(filter);
      await options.transactions.run(context.planeKey, context, async (tx) => {
        const state = await options.staging.saveExportRequest({ id: exportRequestId, tenantId: context.tenantId, entityCode, exactFilter, actorPrincipalId: context.principalId, status: "queued" }, tx);
        if (state === "replayed") return;
        await recordTransferAudit(options.audit, context, "records.export.requested", "export", entityCode, { exportRequestId, jobId, exactFilter }, tx);
        await appendEvent(options.outbox, context, "records.export.dispatch_requested", jobId, entityCode, exportRequestId, { tenantId: context.tenantId, entityCode, exactFilter, actorPrincipalId: context.principalId, exportRequestId, jobId }, tx);
      });
      await options.jobs.enqueue("export", { planeKey:context.planeKey,tenantId: context.tenantId, entityCode, exactFilter, actorPrincipalId: context.principalId, exportRequestId,context }, { jobId }).catch(() => undefined);
      return { exportRequestId, jobId, status: "queued" as const };
    },

    async cancelExport(context: VerifiedRequestContext, exportRequestId: string) {
      if (!options.staging.cancelExport) throw new Error("Export cancellation is not supported by the staging store");
      const jobId = `records:export:${exportRequestId}`;
      const state = await options.transactions.run(context.planeKey, context, async (tx) => {
        if(options.staging.getExport){const current=await options.staging.getExport(context.tenantId,exportRequestId,tx);if(current&&current.actorPrincipalId!==context.principalId)throw new RecordServiceError(403,"FORBIDDEN","Record transfer belongs to another principal");}const result = await options.staging.cancelExport!(context.tenantId, exportRequestId, now().toISOString(), tx);
        if (result === "not_found") throw new Error("Export request is unavailable");
        if (result === "cancelled") await appendEvent(options.outbox, context, "records.export.cancelled", `${jobId}:cancelled`, "records.export_request", exportRequestId, { exportRequestId, jobId }, tx);
        return result;
      });
      if (state === "cancelled") await options.jobs.cancel?.(jobId).catch(() => false);
      return { exportRequestId, status: state === "cancelled" ? "cancelled" as const : "already_terminal" as const };
    },
    async getImport(context:VerifiedRequestContext,sessionId:string){const staged=await options.transactions.run(context.planeKey,context,tx=>options.staging.get(context.tenantId,sessionId,tx));if(!staged)throw new Error("Import session is unavailable");requireOwner(staged.session,context);return staged.session;},
    async downloadExport(context:VerifiedRequestContext,exportRequestId:string,expirySeconds=300){if(!options.errorReports||!options.staging.getExport)throw new Error("Export downloads are not configured");const request=await options.transactions.run(context.planeKey,context,tx=>options.staging.getExport!(context.tenantId,exportRequestId,tx));if(!request||request.actorPrincipalId!==context.principalId||request.status!=="completed"||!request.artifactKey)throw new Error("Export artifact is unavailable");const ttl=Math.min(Math.max(expirySeconds,30),3600);return{exportRequestId,rowCount:request.rowCount??0,url:await options.errorReports.createDownloadUrl(request.artifactKey,ttl),expiresInSeconds:ttl};},
    async listTransfers(context:VerifiedRequestContext,limit=50){if(!options.staging.listOwned)throw new Error("Transfer workspace is not configured");const safe=Math.min(Math.max(limit,1),100);return{items:await options.transactions.run(context.planeKey,context,tx=>options.staging.listOwned!(context.tenantId,context.principalId,safe,tx))};},
  };
}

function requireChunkStore<T>(store: ImportStagingStore<T>): asserts store is ImportStagingStore<T> & Required<Pick<ImportStagingStore<T>, "getChunk" | "appendChunk" | "seal">> { if (!store.getChunk || !store.appendChunk || !store.seal) throw new Error("Resumable imports are not supported by the staging store"); }
function requireOwner(session:RecordImportSession,context:VerifiedRequestContext){if(session.createdBy&&session.createdBy!==context.principalId)throw new RecordServiceError(403,"FORBIDDEN","Record transfer belongs to another principal");}
function digest(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function emptyChecksum() { return digest(""); }
function stable(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`; }
function summarize(rows: readonly ImportValidationRow[], sampleSize: number): ImportValidationSummary { const invalid = rows.filter((row) => !row.valid); const errorsByCode: Record<string, number> = {}; for (const row of invalid) for (const error of row.errors) { const code = error.split(":", 1)[0]!.trim() || "VALIDATION_ERROR"; errorsByCode[code] = (errorsByCode[code] ?? 0) + 1; } return { totalCount: rows.length, validCount: rows.length - invalid.length, invalidCount: invalid.length, errorsByCode, sample: invalid.slice(0, Math.max(0, sampleSize)), truncated: invalid.length > sampleSize }; }
function preview(sessionId: string, rows: readonly ImportValidationRow[], summary: ImportValidationSummary): RecordImportPreview { return { sessionId, rows, validCount: summary.validCount, invalidCount: summary.invalidCount, summary }; }
async function* errorLines(rows: readonly ImportValidationRow[]) { const encoder = new TextEncoder(); for (const row of rows) if (!row.valid) yield encoder.encode(`${JSON.stringify(row)}\n`); }
async function authorizeOperation(options: { readonly metadata: MetadataReader; readonly authorizer: Authorizer }, context: VerifiedRequestContext, entityCode: string, operation: "import" | "export") { const descriptor = await descriptorFor(options.metadata, context, entityCode); return authorizeDescriptorOperation(options.authorizer, context, descriptor, operation, {}); }
async function authorizeDescriptorOperation(authorizer: Authorizer, context: VerifiedRequestContext, descriptor: Awaited<ReturnType<typeof descriptorFor>>, operation: "import" | "export", resource: Readonly<Record<string, string>>) { const permissionCode = descriptor.operations[operation]?.permissionCode; if (!permissionCode || !(await authorizer.authorize({ context, permissionCode, resource: { entityCode: descriptor.entityCode, ...resource } })).allowed) throw new RecordServiceError(403, "FORBIDDEN", `Record ${operation} is not permitted`); }
async function authorizeImportMode(authorizer:Authorizer,context:VerifiedRequestContext,descriptor:Awaited<ReturnType<typeof descriptorFor>>,operation:RecordImportOperation,resource:Readonly<Record<string,string>>){const permissions=descriptor.listPresentation?.dataOperations?.importOperationPermissions?.[operation]??[];if(!permissions.length)throw new RecordServiceError(403,"IMPORT_MODE_NOT_PUBLISHED",`Import ${operation} is not published for this entity`);for(const permissionCode of permissions)if(!(await authorizer.authorize({context,permissionCode,resource:{entityCode:descriptor.entityCode,...resource}})).allowed)throw new RecordServiceError(403,"FORBIDDEN",`Import ${operation} is not permitted`);}
async function resolveImportScope(resolver: RecordCollectionScopeResolver | undefined, context: VerifiedRequestContext, descriptor: Awaited<ReturnType<typeof descriptorFor>>, coordinate?: Readonly<Record<string, string>>): Promise<Extract<RecordCollectionScopeResolution, { readonly status: "ready" }>> {
  const resolution = resolver ? await resolver.resolve({ context, descriptor, operationCode: "import", ...(coordinate ? { coordinate } : {}) }) : { status: "ready" as const, authorizationResource: Object.freeze({}), constraints: Object.freeze([]), labels: Object.freeze([]), fingerprintMaterial: Object.freeze({ mode: "tenant" }) };
  if (resolution.status === "context_required") throw new RecordServiceError(409, "IMPORT_SCOPE_REQUIRED", "A governed import scope must be selected");
  if (resolution.status === "forbidden") throw new RecordServiceError(403, resolution.code, resolution.message);
  return resolution;
}
function requireDescriptorHash(session: RecordImportSession, compiledHash: string) { if (session.descriptorHash !== compiledHash) throw new RecordServiceError(409, "IMPORT_DESCRIPTOR_CHANGED", "The entity contract changed after this import began; start a new import"); }
async function appendEvent<T>(outbox: OutboxWriter<T>, context: VerifiedRequestContext, eventType: string, eventKey: string, entityType: string, entityId: string, payload: Readonly<Record<string, unknown>>, tx: T) { await outbox.append({ tenantId: context.tenantId, topic: "records.transfer", eventType, eventKey, entityType, entityId, aggregateType: eventType.startsWith("records.export") ? "records.export_request" : "records.import_session", aggregateId: entityId, actorId: context.principalId, correlationId: context.correlationId, payload }, tx); }
async function recordTransferAudit<T>(audit: AuditRecorder<T>, context: VerifiedRequestContext, eventCode: string, action: string, entityType: string, metadata: Readonly<Record<string, unknown>>, transaction: T) { await audit.record({ eventCode, action, outcome: "success", actor: { kind: "user", principalId: context.principalId }, tenantId: context.tenantId, entityType, requestId: context.requestId, ...(context.correlationId ? { correlationId: context.correlationId } : {}), metadata }, transaction); }
