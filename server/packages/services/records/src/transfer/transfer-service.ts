import { usesEntityBackendAuthorization } from "../entity-backend-authorizer.js";
import { createHash, randomUUID } from "node:crypto";
import type {
  VerifiedRequestContext,
  Authorizer,
} from "@athyper/server-contract-auth";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { OutboxWriter } from "@athyper/server-contract-events";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type {
  GovernedRecordJobDispatcher,
  ImportValidationRow,
  ImportValidationSummary,
  RecordCollectionScopeResolution,
  RecordCollectionScopeResolver,
  RecordImportAtomicity,
  RecordImportConflictPolicy,
  RecordImportOperation,
  RecordImportPreview,
  RecordImportSession,
  RecordTransferListItem,
} from "@athyper/server-contract-records";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { RecordServiceError } from "../errors.js";
import { descriptorFor } from "../query-service.js";
import type { GovernedImportAdapterRegistry } from "./import-adapter-registry.js";
import { structuredImportFormat } from "./structured-import-file-codec.js";

type Row = Readonly<Record<string, unknown>>;
export interface StoredImport {
  readonly session: RecordImportSession;
  readonly rows: readonly Row[];
  readonly validation?: readonly ImportValidationRow[];
  readonly summary?: ImportValidationSummary;
}
export interface ImportStagingStore<Transaction = unknown> {
  create(
    session: RecordImportSession,
    rows: readonly Row[],
    transaction?: Transaction,
  ): Promise<void>;
  get(
    tenantId: string,
    sessionId: string,
    transaction?: Transaction,
  ): Promise<StoredImport | null>;
  getChunk?(
    tenantId: string,
    sessionId: string,
    chunkIndex: number,
    transaction: Transaction,
  ): Promise<{
    readonly chunkChecksum: string;
    readonly cumulativeChecksum: string;
    readonly rowCount: number;
  } | null>;
  /** Must reject duplicate chunk indexes with different checksums and non-contiguous indexes. */
  appendChunk?(
    input: {
      tenantId: string;
      sessionId: string;
      chunkIndex: number;
      rows: readonly Row[];
      chunkChecksum: string;
      cumulativeChecksum: string;
    },
    transaction: Transaction,
  ): Promise<"created" | "replayed">;
  seal?(
    input: {
      tenantId: string;
      sessionId: string;
      expectedChunkCount: number;
      checksum: string;
    },
    transaction: Transaction,
  ): Promise<void>;
  saveValidation(
    sessionId: string,
    rows: readonly ImportValidationRow[],
    transaction?: Transaction,
    summary?: ImportValidationSummary,
    errorReportKey?: string,
  ): Promise<void>;
  setStatus(
    sessionId: string,
    status: RecordImportSession["status"],
    transaction?: Transaction,
  ): Promise<void>;
  cancelImport?(
    tenantId: string,
    sessionId: string,
    cancelledAt: string,
    transaction: Transaction,
  ): Promise<"cancelled" | "already_terminal" | "not_found">;
  restartImport?(
    tenantId: string,
    sessionId: string,
    transaction: Transaction,
  ): Promise<"restarted" | "invalid_state" | "not_found">;
  failQueuedImport?(
    tenantId: string,
    sessionId: string,
    errorCode: string,
    errorDetail: string,
    failedAt: string,
    transaction: Transaction,
  ): Promise<boolean>;
  saveExportRequest(
    input: {
      readonly id: string;
      readonly tenantId: string;
      readonly entityCode: string;
      readonly exactFilter: Readonly<Record<string, unknown>>;
      readonly actorPrincipalId: string;
      readonly status: "queued";
    },
    transaction: Transaction,
  ): Promise<"created" | "replayed">;
  cancelExport?(
    tenantId: string,
    exportRequestId: string,
    cancelledAt: string,
    transaction: Transaction,
  ): Promise<"cancelled" | "already_terminal" | "not_found">;
  restartExport?(
    tenantId: string,
    exportRequestId: string,
    transaction: Transaction,
  ): Promise<"restarted" | "invalid_state" | "not_found">;
  failQueuedExport?(
    tenantId: string,
    exportRequestId: string,
    errorCode: string,
    errorDetail: string,
    failedAt: string,
    transaction: Transaction,
  ): Promise<boolean>;
  getExport?(
    tenantId: string,
    exportRequestId: string,
    transaction: Transaction,
  ): Promise<{
    entityCode: string;
    actorPrincipalId: string;
    status: "queued" | "running" | "completed" | "cancelled" | "failed";
    exactFilter?: Readonly<Record<string, unknown>>;
    artifactKey?: string;
    rowCount?: number;
  } | null>;
  listOwned?(
    tenantId: string,
    principalId: string,
    limit: number,
    transaction: Transaction,
  ): Promise<readonly RecordTransferListItem[]>;
}
export interface ImportRowValidator {
  validate(
    context: VerifiedRequestContext,
    entityCode: string,
    row: Row,
    rowNumber: number,
    operation?: RecordImportOperation,
  ): Promise<ImportValidationRow>;
}
export interface ImportErrorReportStore {
  write(input: {
    planeKey: "studio" | "neon" | "mesh";
    tenantId: string;
    sessionId: string;
    content: AsyncIterable<Uint8Array>;
    contentType: "application/x-ndjson";
  }): Promise<string>;
  createDownloadUrl(key: string, expirySeconds: number): Promise<string>;
}
export interface ImportWorkbookIntake {
  prepareUpload(input: {
    readonly planeKey: "studio" | "neon" | "mesh";
    readonly tenantId: string;
    readonly sessionId: string;
    readonly fileName: string;
    readonly sizeBytes: number;
    readonly maxBytes: number;
  }): Promise<{
    readonly uploadUrl: string;
    readonly expiresInSeconds: number;
  }>;
  read(input: {
    readonly planeKey: "studio" | "neon" | "mesh";
    readonly tenantId: string;
    readonly sessionId: string;
    readonly fileName: string;
    readonly sizeBytes: number;
    readonly maxBytes: number;
    readonly maxRows: number;
    readonly allowedFields: readonly string[];
  }): Promise<readonly Row[]>;
  createTemplate(input: {
    readonly planeKey: "studio" | "neon" | "mesh";
    readonly tenantId: string;
    readonly entityCode: string;
    readonly descriptorHash: string;
    readonly fields: readonly {
      key: string;
      label: string;
      required: boolean;
      example?: string | number | boolean;
      options?: readonly (string | number | boolean)[];
    }[];
  }): Promise<{ readonly url: string; readonly expiresInSeconds: number }>;
}
export interface CancellableRecordJobDispatcher extends GovernedRecordJobDispatcher {
  cancel?(jobId: string): Promise<boolean>;
}
export type RecordTransferService = ReturnType<
  typeof createRecordTransferService<unknown>
>;

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
  readonly workbookIntake?: ImportWorkbookIntake;
  readonly validationSampleSize?: number;
  readonly now?: () => Date;
  readonly createId?: () => string;
}) {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  const prepareExport = async (
    context: VerifiedRequestContext,
    entityCode: string,
    filter: Readonly<Record<string, unknown>>,
  ) => {
    assertBusinessPartnerExportPrivacy(entityCode, filter);
    const exactFilter = structuredClone(filter);
    const descriptor = await descriptorFor(
      options.metadata,
      context,
      entityCode,
    );
    if (!descriptor.operations["export"])
      throw new RecordServiceError(
        409,
        "ENTITY_OPERATION_UNAVAILABLE",
        "Export is not selected",
      );
    const requestedTransfer = exactFilter["_transfer"];
    if (
      usesEntityBackendAuthorization(options.authorizer, context, descriptor) &&
      exactFilter["fields"] === undefined &&
      requestedTransfer &&
      typeof requestedTransfer === "object" &&
      !Array.isArray(requestedTransfer) &&
      "fields" in requestedTransfer
    )
      (exactFilter as Record<string, unknown>)["fields"] = (
        requestedTransfer as Record<string, unknown>
      )["fields"];
    if (
      usesEntityBackendAuthorization(options.authorizer, context, descriptor) &&
      exactFilter["fields"] === undefined
    )
      (exactFilter as Record<string, unknown>)["fields"] = descriptor.fields
        .filter((field) =>
          descriptor.authorization!.fieldPolicies.some(
            (policy) =>
              policy.fields.includes(field.key) &&
              policy.queryUses.includes("export") &&
              policy.representation === "plain",
          ),
        )
        .map((field) => field.key);
    if (
      usesEntityBackendAuthorization(options.authorizer, context, descriptor)
    ) {
      const transfer = exactFilter["_transfer"];
      const settings =
        transfer && typeof transfer === "object" && !Array.isArray(transfer)
          ? (transfer as Record<string, unknown>)
          : {};
      if (
        settings["fields"] !== undefined &&
        JSON.stringify(settings["fields"]) !==
          JSON.stringify(exactFilter["fields"])
      )
        throw new RecordServiceError(
          400,
          "EXPORT_FIELD_PROJECTION_MISMATCH",
          "Export worker and authorization fields must match",
        );
      (exactFilter as Record<string, unknown>)["_transfer"] = {
        ...settings,
        fields: exactFilter["fields"],
      };
    }
    const scope = await resolveTransferScope(
      options.collectionScopes,
      context,
      descriptor,
      "export",
      scopeCoordinate(exactFilter),
    );
    const exportFields = exactFilter["fields"];
    if (
      usesEntityBackendAuthorization(options.authorizer, context, descriptor) &&
      (!Array.isArray(exportFields) ||
        !exportFields.length ||
        exportFields.some((field) => typeof field !== "string"))
    )
      throw new RecordServiceError(
        403,
        "EXPORT_AUTHORIZATION_FIELDS_MISSING",
        "Export fields are unavailable",
      );
    return { descriptor, exactFilter, scope, exportFields };
  };
  return {
    async preflightExport(
      context: VerifiedRequestContext,
      entityCode: string,
      filter: Readonly<Record<string, unknown>>,
    ) {
      // No export authorization recursion, enqueue, state, audit or outbox writes.
      // Execution still authorizes exact fields and each worker/download boundary.
      await prepareExport(context, entityCode, filter);
    },
    async beginImport(
      context: VerifiedRequestContext,
      entityCode: string,
      sessionId = createId(),
      operation: RecordImportOperation = "create",
      configuration: {
        readonly scopeCoordinate?: Readonly<Record<string, string>>;
        readonly conflictPolicy?: RecordImportConflictPolicy;
        readonly atomicity?: RecordImportAtomicity;
      } = {},
    ) {
      const descriptor = await descriptorFor(
        options.metadata,
        context,
        entityCode,
      );
      const scope = await resolveImportScope(
        options.collectionScopes,
        context,
        descriptor,
        configuration.scopeCoordinate,
      );
      await authorizeDescriptorOperation(
        options.authorizer,
        context,
        descriptor,
        "import",
        scope.authorizationResource,
      );
      await authorizeImportMode(
        options.authorizer,
        context,
        descriptor,
        operation,
        scope.authorizationResource,
      );
      const adapter = options.adapters.select(descriptor, operation);
      requireChunkStore(options.staging);
      const session: RecordImportSession = Object.freeze({
        id: sessionId,
        tenantId: context.tenantId,
        entityCode,
        operation,
        adapterKey: adapter.key,
        descriptorHash: descriptor.compiledHash,
        ...(configuration.scopeCoordinate
          ? {
              scopeCoordinate: Object.freeze({
                ...configuration.scopeCoordinate,
              }),
            }
          : {}),
        conflictPolicy: configuration.conflictPolicy ?? "reject",
        atomicity: configuration.atomicity ?? "all_or_nothing",
        status: "uploading",
        stagedRowCount: 0,
        validRowCount: 0,
        invalidRowCount: 0,
        checksum: emptyChecksum(),
        nextChunkIndex: 0,
        createdAt: now().toISOString(),
        createdBy: context.principalId,
      });
      await options.transactions.run(context.planeKey, context, async (tx) => {
        await options.staging.create(session, [], tx);
        await appendEvent(
          options.outbox,
          context,
          "records.import.upload_started",
          `records:import:${sessionId}:upload`,
          entityCode,
          sessionId,
          { sessionId },
          tx,
        );
      });
      return session;
    },

    async prepareWorkbookUpload(
      context: VerifiedRequestContext,
      sessionId: string,
      fileName: string,
      sizeBytes: number,
    ) {
      if (!options.workbookIntake)
        throw new RecordServiceError(
          503,
          "IMPORT_FILE_UNAVAILABLE",
          "Server-side file import is not configured",
        );
      const staged = await options.transactions.run(
        context.planeKey,
        context,
        (tx) => options.staging.get(context.tenantId, sessionId, tx),
      );
      if (
        !staged ||
        staged.session.status !== "uploading" ||
        (staged.session.nextChunkIndex ?? 0) !== 0
      )
        throw new RecordServiceError(
          409,
          "XLSX_IMPORT_STATE_INVALID",
          "Excel upload is unavailable for this import session",
        );
      requireOwner(staged.session, context);
      const descriptor = await descriptorFor(
          options.metadata,
          context,
          staged.session.entityCode,
        ),
        format = importFileFormat(fileName);
      requireDescriptorHash(staged.session, descriptor.compiledHash);
      requireImportFileCapability(descriptor, format);
      const scope = await resolveImportScope(
        options.collectionScopes,
        context,
        descriptor,
        staged.session.scopeCoordinate,
      );
      await authorizeDescriptorOperation(
        options.authorizer,
        context,
        descriptor,
        "import",
        scope.authorizationResource,
      );
      await authorizeImportMode(
        options.authorizer,
        context,
        descriptor,
        staged.session.operation,
        scope.authorizationResource,
      );
      const maxBytes =
        descriptor.listPresentation?.dataOperations?.importMaxFileBytes ??
        25 * 1024 * 1024;
      return {
        sessionId,
        ...(await options.workbookIntake.prepareUpload({
          planeKey: context.planeKey,
          tenantId: context.tenantId,
          sessionId,
          fileName,
          sizeBytes,
          maxBytes,
        })),
      };
    },

    async completeWorkbookUpload(
      context: VerifiedRequestContext,
      sessionId: string,
      fileName: string,
      sizeBytes: number,
    ) {
      if (!options.workbookIntake)
        throw new RecordServiceError(
          503,
          "IMPORT_FILE_UNAVAILABLE",
          "Server-side file import is not configured",
        );
      requireChunkStore(options.staging);
      const staged = await options.transactions.run(
        context.planeKey,
        context,
        (tx) => options.staging.get(context.tenantId, sessionId, tx),
      );
      if (
        !staged ||
        staged.session.status !== "uploading" ||
        (staged.session.nextChunkIndex ?? 0) !== 0
      )
        throw new RecordServiceError(
          409,
          "XLSX_IMPORT_STATE_INVALID",
          "Excel upload is unavailable for this import session",
        );
      requireOwner(staged.session, context);
      const descriptor = await descriptorFor(
          options.metadata,
          context,
          staged.session.entityCode,
        ),
        format = importFileFormat(fileName);
      requireDescriptorHash(staged.session, descriptor.compiledHash);
      requireImportFileCapability(descriptor, format);
      const scope = await resolveImportScope(
        options.collectionScopes,
        context,
        descriptor,
        staged.session.scopeCoordinate,
      );
      await authorizeDescriptorOperation(
        options.authorizer,
        context,
        descriptor,
        "import",
        scope.authorizationResource,
      );
      await authorizeImportMode(
        options.authorizer,
        context,
        descriptor,
        staged.session.operation,
        scope.authorizationResource,
      );
      const maxBytes =
          descriptor.listPresentation?.dataOperations?.importMaxFileBytes ??
          25 * 1024 * 1024,
        maxRows =
          descriptor.listPresentation?.dataOperations?.importMaxRows ?? 50_000,
        allowedFields = importFields(descriptor).map((field) => field.key);
      const inspectedRows = await options.workbookIntake.read({
          planeKey: context.planeKey,
          tenantId: context.tenantId,
          sessionId,
          fileName,
          sizeBytes,
          maxBytes,
          maxRows,
          allowedFields,
        }),
        rows = coerceWorkbookRows(inspectedRows, descriptor);
      if (!rows.length)
        throw new RecordServiceError(
          422,
          "IMPORT_FILE_EMPTY",
          "The import file contains no records",
        );
      return options.transactions.run(context.planeKey, context, async (tx) => {
        const current = await options.staging.get(
          context.tenantId,
          sessionId,
          tx,
        );
        if (
          !current ||
          current.session.status !== "uploading" ||
          (current.session.nextChunkIndex ?? 0) !== 0
        )
          throw new RecordServiceError(
            409,
            "IMPORT_FILE_STATE_INVALID",
            "Import session changed while the file was being inspected",
          );
        requireOwner(current.session, context);
        let checksum = current.session.checksum,
          chunkIndex = 0;
        for (let offset = 0; offset < rows.length; offset += 500) {
          const chunk = rows.slice(offset, offset + 500),
            chunkChecksum = digest(stable(chunk));
          checksum = digest(`${checksum}:${chunkIndex}:${chunkChecksum}`);
          await options.staging.appendChunk!(
            {
              tenantId: context.tenantId,
              sessionId,
              chunkIndex,
              rows: chunk,
              chunkChecksum,
              cumulativeChecksum: checksum,
            },
            tx,
          );
          chunkIndex += 1;
        }
        await options.staging.seal!(
          {
            tenantId: context.tenantId,
            sessionId,
            expectedChunkCount: chunkIndex,
            checksum,
          },
          tx,
        );
        await appendEvent(
          options.outbox,
          context,
          "records.import.upload_completed",
          `records:import:${sessionId}:upload-completed`,
          current.session.entityCode,
          sessionId,
          {
            transferId: sessionId,
            sessionId,
            entityCode: current.session.entityCode,
            format,
            rowCount: rows.length,
            checksum,
          },
          tx,
        );
        return {
          ...current.session,
          status: "staged" as const,
          stagedRowCount: rows.length,
          nextChunkIndex: chunkIndex,
          checksum,
        };
      });
    },

    async createWorkbookTemplate(
      context: VerifiedRequestContext,
      entityCode: string,
    ) {
      if (!options.workbookIntake)
        throw new RecordServiceError(
          503,
          "XLSX_IMPORT_UNAVAILABLE",
          "Excel import is not configured",
        );
      const descriptor = await descriptorFor(
        options.metadata,
        context,
        entityCode,
      );
      requireWorkbookCapability(descriptor);
      await authorizeDescriptorOperation(
        options.authorizer,
        context,
        descriptor,
        "import",
        {},
      );
      const fields = importFields(descriptor).map((field) => ({
        key: field.key,
        label: field.label ?? field.key,
        required: field.required,
        example: workbookExample(field.type),
      }));
      if (!fields.length)
        throw new RecordServiceError(
          409,
          "XLSX_TEMPLATE_EMPTY",
          "This entity has no workbook-importable fields",
        );
      return options.workbookIntake.createTemplate({
        planeKey: context.planeKey,
        tenantId: context.tenantId,
        entityCode,
        descriptorHash: descriptor.compiledHash,
        fields,
      });
    },

    async appendImportChunk(
      context: VerifiedRequestContext,
      sessionId: string,
      chunkIndex: number,
      rows: readonly Row[],
    ) {
      if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || !rows.length)
        throw new TypeError("Import chunk index and rows are required");
      requireChunkStore(options.staging);
      const chunkChecksum = digest(stable(rows));
      return options.transactions.run(context.planeKey, context, async (tx) => {
        const staged = await options.staging.get(
          context.tenantId,
          sessionId,
          tx,
        );
        if (!staged || staged.session.status !== "uploading")
          throw new Error("Import upload session is unavailable");
        requireOwner(staged.session, context);
        const expected = staged.session.nextChunkIndex ?? 0;
        if (chunkIndex > expected)
          throw new Error(
            `Import chunk ${expected} is required before chunk ${chunkIndex}`,
          );
        if (chunkIndex < expected) {
          const stored = await options.staging.getChunk!(
            context.tenantId,
            sessionId,
            chunkIndex,
            tx,
          );
          if (
            !stored ||
            stored.chunkChecksum !== chunkChecksum ||
            stored.rowCount !== rows.length
          )
            throw new Error("Import chunk idempotency conflict");
          return {
            sessionId,
            chunkIndex,
            rowCount: rows.length,
            chunkChecksum,
            cumulativeChecksum: stored.cumulativeChecksum,
            replayed: true,
          };
        }
        const cumulativeChecksum = digest(
          `${staged.session.checksum}:${chunkIndex}:${chunkChecksum}`,
        );
        const result = await options.staging.appendChunk!(
          {
            tenantId: context.tenantId,
            sessionId,
            chunkIndex,
            rows: structuredClone(rows),
            chunkChecksum,
            cumulativeChecksum,
          },
          tx,
        );
        return {
          sessionId,
          chunkIndex,
          rowCount: rows.length,
          chunkChecksum,
          cumulativeChecksum,
          replayed: result === "replayed",
        };
      });
    },

    async completeImportUpload(
      context: VerifiedRequestContext,
      sessionId: string,
      expectedChunkCount: number,
    ) {
      requireChunkStore(options.staging);
      return options.transactions.run(context.planeKey, context, async (tx) => {
        const staged = await options.staging.get(
          context.tenantId,
          sessionId,
          tx,
        );
        if (!staged || staged.session.status !== "uploading")
          throw new Error("Import upload session is unavailable");
        requireOwner(staged.session, context);
        if ((staged.session.nextChunkIndex ?? 0) !== expectedChunkCount)
          throw new Error("Import upload has missing chunks");
        await options.staging.seal!(
          {
            tenantId: context.tenantId,
            sessionId,
            expectedChunkCount,
            checksum: staged.session.checksum,
          },
          tx,
        );
        await appendEvent(
          options.outbox,
          context,
          "records.import.upload_completed",
          `records:import:${sessionId}:upload-completed`,
          staged.session.entityCode,
          sessionId,
          {
            sessionId,
            rowCount: staged.rows.length,
            checksum: staged.session.checksum,
          },
          tx,
        );
        return { ...staged.session, status: "staged" as const };
      });
    },

    async stage(
      context: VerifiedRequestContext,
      entityCode: string,
      rows: readonly Row[],
      operation: RecordImportOperation = "create",
      configuration: {
        readonly scopeCoordinate?: Readonly<Record<string, string>>;
        readonly conflictPolicy?: RecordImportConflictPolicy;
        readonly atomicity?: RecordImportAtomicity;
      } = {},
    ) {
      const descriptor = await descriptorFor(
        options.metadata,
        context,
        entityCode,
      );
      const scope = await resolveImportScope(
        options.collectionScopes,
        context,
        descriptor,
        configuration.scopeCoordinate,
      );
      const adapter = options.adapters.select(descriptor, operation);
      await authorizeDescriptorOperation(
        options.authorizer,
        context,
        descriptor,
        "import",
        scope.authorizationResource,
      );
      await authorizeImportMode(
        options.authorizer,
        context,
        descriptor,
        operation,
        scope.authorizationResource,
      );
      if (!rows.length) throw new TypeError("Import contains no rows");
      const checksum = digest(stable(rows));
      const session: RecordImportSession = Object.freeze({
        id: createId(),
        tenantId: context.tenantId,
        entityCode,
        operation,
        adapterKey: adapter.key,
        descriptorHash: descriptor.compiledHash,
        ...(configuration.scopeCoordinate
          ? {
              scopeCoordinate: Object.freeze({
                ...configuration.scopeCoordinate,
              }),
            }
          : {}),
        conflictPolicy: configuration.conflictPolicy ?? "reject",
        atomicity: configuration.atomicity ?? "all_or_nothing",
        status: "staged",
        stagedRowCount: rows.length,
        validRowCount: 0,
        invalidRowCount: 0,
        checksum,
        nextChunkIndex: 1,
        createdAt: now().toISOString(),
        createdBy: context.principalId,
      });
      await options.transactions.run(context.planeKey, context, async (tx) => {
        await options.staging.create(session, structuredClone(rows), tx);
        await appendEvent(
          options.outbox,
          context,
          "records.import.staged",
          `records:import:${session.id}:staged`,
          entityCode,
          session.id,
          { sessionId: session.id, rowCount: rows.length, checksum },
          tx,
        );
      });
      return session;
    },

    async validate(
      context: VerifiedRequestContext,
      sessionId: string,
    ): Promise<RecordImportPreview> {
      const staged = await options.transactions.run(
        context.planeKey,
        context,
        (tx) => options.staging.get(context.tenantId, sessionId, tx),
      );
      if (
        !staged ||
        ["commit_queued", "running", "committed", "cancelled"].includes(
          staged.session.status,
        )
      )
        throw new Error("Import session is unavailable");
      requireOwner(staged.session, context);
      const descriptor = await descriptorFor(
        options.metadata,
        context,
        staged.session.entityCode,
      );
      requireDescriptorHash(staged.session, descriptor.compiledHash);
      const scope = await resolveImportScope(
        options.collectionScopes,
        context,
        descriptor,
        staged.session.scopeCoordinate,
      );
      const adapter = options.adapters.resolve(
        staged.session.adapterKey,
        descriptor,
        staged.session.operation,
      );
      await authorizeDescriptorOperation(
        options.authorizer,
        context,
        descriptor,
        "import",
        scope.authorizationResource,
      );
      await authorizeImportMode(
        options.authorizer,
        context,
        descriptor,
        staged.session.operation,
        scope.authorizationResource,
      );
      const validation: ImportValidationRow[] = [];
      for (let index = 0; index < staged.rows.length; index += 1) {
        const generic = await options.validator.validate(
          context,
          staged.session.entityCode,
          staged.rows[index]!,
          index + 1,
          staged.session.operation,
        );
        const governed = await adapter.validate({
          context,
          descriptor,
          session: staged.session,
          scope,
          row: staged.rows[index]!,
          rowNumber: index + 1,
        });
        validation.push({
          rowNumber: index + 1,
          valid: generic.valid && governed.valid,
          errors: Object.freeze([...generic.errors, ...governed.errors]),
        });
      }
      const summary = summarize(
        validation,
        options.validationSampleSize ?? 100,
      );
      const errorReportKey =
        summary.invalidCount && options.errorReports
          ? await options.errorReports.write({
              planeKey: context.planeKey,
              tenantId: context.tenantId,
              sessionId,
              content: errorLines(validation),
              contentType: "application/x-ndjson",
            })
          : undefined;
      await options.transactions.run(context.planeKey, context, async (tx) => {
        const current = await options.staging.get(
          context.tenantId,
          sessionId,
          tx,
        );
        if (
          !current ||
          ["commit_queued", "running", "committed", "cancelled"].includes(
            current.session.status,
          ) ||
          current.session.checksum !== staged.session.checksum
        )
          throw new Error("Import session changed during validation");
        await options.staging.saveValidation(
          sessionId,
          validation,
          tx,
          summary,
          errorReportKey,
        );
        await options.staging.setStatus(sessionId, "validated", tx);
        await recordTransferAudit(
          options.audit,
          context,
          "records.import.validated",
          "import",
          staged.session.entityCode,
          { sessionId, summary, errorReportKey: errorReportKey ?? null },
          tx,
        );
        await appendEvent(
          options.outbox,
          context,
          "records.import.validated",
          `records:import:${sessionId}:validated:${staged.session.checksum}`,
          staged.session.entityCode,
          sessionId,
          { sessionId, summary, errorReportKey },
          tx,
        );
      });
      return preview(sessionId, validation, summary);
    },

    async preview(
      context: VerifiedRequestContext,
      sessionId: string,
    ): Promise<RecordImportPreview> {
      return options.transactions.run(context.planeKey, context, async (tx) => {
        const staged = await options.staging.get(
          context.tenantId,
          sessionId,
          tx,
        );
        if (
          !staged?.validation ||
          !["validated", "previewed"].includes(staged.session.status)
        )
          throw new Error("Import must be validated before preview");
        requireOwner(staged.session, context);
        const summary =
          staged.summary ??
          summarize(staged.validation, options.validationSampleSize ?? 100);
        await options.staging.setStatus(sessionId, "previewed", tx);
        return preview(sessionId, staged.validation, summary);
      });
    },

    async commit(context: VerifiedRequestContext, sessionId: string) {
      const jobId = `records:import:${sessionId}`;
      const staged = await options.transactions.run(
        context.planeKey,
        context,
        async (tx) => {
          const value = await options.staging.get(
            context.tenantId,
            sessionId,
            tx,
          );
          if (!value) throw new Error("Import session is unavailable");
          requireOwner(value.session, context);
          if (["commit_queued", "committed"].includes(value.session.status))
            return value;
          if (!value.validation || value.session.status === "staged")
            throw new Error("Import must be validated before commit");
          if (value.session.status !== "previewed")
            throw new Error("Import must be previewed before commit");
          if (
            value.session.atomicity === "all_or_nothing" &&
            value.validation.some((row) => !row.valid)
          )
            throw new RecordServiceError(
              422,
              "IMPORT_ATOMICITY_REJECTED",
              "All-or-nothing import contains invalid rows",
            );
          if (!value.validation.some((row) => row.valid))
            throw new RecordServiceError(
              422,
              "IMPORT_NO_VALID_ROWS",
              "Import contains no valid rows",
            );
          await options.staging.setStatus(sessionId, "commit_queued", tx);
          await recordTransferAudit(
            options.audit,
            context,
            "records.import.commit_queued",
            "import",
            value.session.entityCode,
            { sessionId, jobId, checksum: value.session.checksum },
            tx,
          );
          await appendEvent(
            options.outbox,
            context,
            "records.import.dispatch_requested",
            jobId,
            value.session.entityCode,
            sessionId,
            {
              tenantId: context.tenantId,
              sessionId,
              checksum: value.session.checksum,
              actorPrincipalId: context.principalId,
              jobId,
            },
            tx,
          );
          return value;
        },
      );
      await dispatchOrFail(
        "import",
        context,
        staged.session.entityCode,
        sessionId,
        jobId,
        () =>
          options.jobs.enqueue(
            "import",
            {
              planeKey: context.planeKey,
              tenantId: context.tenantId,
              sessionId,
              checksum: staged.session.checksum,
              actorPrincipalId: context.principalId,
              context,
            },
            { jobId },
          ),
      );
      return { sessionId, jobId, status: "queued" as const };
    },

    async cancelImport(context: VerifiedRequestContext, sessionId: string) {
      if (!options.staging.cancelImport)
        throw new Error(
          "Import cancellation is not supported by the staging store",
        );
      const jobId = `records:import:${sessionId}`;
      const result = await options.transactions.run(
        context.planeKey,
        context,
        async (tx) => {
          const current = await options.staging.get(
            context.tenantId,
            sessionId,
            tx,
          );
          if (!current) throw new Error("Import session is unavailable");
          requireOwner(current.session, context);
          const state = await options.staging.cancelImport!(
            context.tenantId,
            sessionId,
            now().toISOString(),
            tx,
          );
          if (state === "not_found")
            throw new Error("Import session is unavailable");
          if (state === "cancelled") {
            await recordTransferAudit(
              options.audit,
              context,
              "records.import.cancelled",
              "import",
              current.session.entityCode,
              { sessionId, jobId },
              tx,
            );
            await appendEvent(
              options.outbox,
              context,
              "records.import.cancelled",
              `${jobId}:cancelled`,
              current.session.entityCode,
              sessionId,
              {
                transferId: sessionId,
                sessionId,
                jobId,
                entityCode: current.session.entityCode,
                status: "cancelled",
                url: `/operations/data-transfers?transfer=${encodeURIComponent(sessionId)}`,
              },
              tx,
            );
          }
          return state;
        },
      );
      if (result === "cancelled")
        await options.jobs.cancel?.(jobId).catch(() => false);
      return {
        sessionId,
        status:
          result === "cancelled"
            ? ("cancelled" as const)
            : ("already_terminal" as const),
      };
    },

    async restartImport(context: VerifiedRequestContext, sessionId: string) {
      if (!options.staging.restartImport)
        throw new RecordServiceError(
          409,
          "IMPORT_RESTART_UNAVAILABLE",
          "Import restart is not supported by the staging store",
        );
      const retryId = createId(),
        jobId = `records:import-retry:${retryId}`;
      const staged = await options.transactions.run(
        context.planeKey,
        context,
        async (tx) => {
          const current = await options.staging.get(
            context.tenantId,
            sessionId,
            tx,
          );
          if (!current)
            throw new RecordServiceError(
              404,
              "IMPORT_NOT_FOUND",
              "Import session is unavailable",
            );
          requireOwner(current.session, context);
          if (current.session.status !== "failed")
            throw new RecordServiceError(
              409,
              "IMPORT_RESTART_INVALID_STATE",
              "Only failed imports can be restarted",
            );
          const descriptor = await descriptorFor(
            options.metadata,
            context,
            current.session.entityCode,
          );
          requireDescriptorHash(current.session, descriptor.compiledHash);
          const scope = await resolveImportScope(
            options.collectionScopes,
            context,
            descriptor,
            current.session.scopeCoordinate,
          );
          await authorizeDescriptorOperation(
            options.authorizer,
            context,
            descriptor,
            "import",
            scope.authorizationResource,
          );
          await authorizeImportMode(
            options.authorizer,
            context,
            descriptor,
            current.session.operation,
            scope.authorizationResource,
          );
          const state = await options.staging.restartImport!(
            context.tenantId,
            sessionId,
            tx,
          );
          if (state !== "restarted")
            throw new RecordServiceError(
              409,
              "IMPORT_RESTART_INVALID_STATE",
              "The import is no longer restartable",
            );
          await recordTransferAudit(
            options.audit,
            context,
            "records.import.restart_requested",
            "import",
            current.session.entityCode,
            { sessionId, jobId, retryId },
            tx,
          );
          await appendEvent(
            options.outbox,
            context,
            "records.import.dispatch_requested",
            jobId,
            current.session.entityCode,
            sessionId,
            {
              tenantId: context.tenantId,
              sessionId,
              checksum: current.session.checksum,
              actorPrincipalId: context.principalId,
              jobId,
              retry: true,
            },
            tx,
          );
          return current;
        },
      );
      await dispatchOrFail(
        "import",
        context,
        staged.session.entityCode,
        sessionId,
        jobId,
        () =>
          options.jobs.enqueue(
            "import",
            {
              planeKey: context.planeKey,
              tenantId: context.tenantId,
              sessionId,
              checksum: staged.session.checksum,
              actorPrincipalId: context.principalId,
              context,
            },
            { jobId },
          ),
      );
      return { sessionId, jobId, status: "queued" as const };
    },

    async downloadErrorReport(
      context: VerifiedRequestContext,
      sessionId: string,
      expirySeconds = 300,
    ) {
      if (!options.errorReports)
        throw new Error("Import error reports are not configured");
      const staged = await options.transactions.run(
        context.planeKey,
        context,
        (tx) => options.staging.get(context.tenantId, sessionId, tx),
      );
      if (!staged?.session.errorReportKey)
        throw new Error("Import error report is unavailable");
      requireOwner(staged.session, context);
      const descriptor = await descriptorFor(
        options.metadata,
        context,
        staged.session.entityCode,
      );
      if (
        usesEntityBackendAuthorization(options.authorizer, context, descriptor)
      ) {
        const scope = await resolveImportScope(
          options.collectionScopes,
          context,
          descriptor,
          staged.session.scopeCoordinate,
        );
        await authorizeDescriptorOperation(
          options.authorizer,
          context,
          descriptor,
          "import",
          scope.authorizationResource,
        );
        await authorizeImportMode(
          options.authorizer,
          context,
          descriptor,
          staged.session.operation,
          scope.authorizationResource,
        );
      }
      return {
        sessionId,
        url: await options.errorReports.createDownloadUrl(
          staged.session.errorReportKey,
          Math.min(Math.max(expirySeconds, 30), 3600),
        ),
        expiresInSeconds: Math.min(Math.max(expirySeconds, 30), 3600),
      };
    },

    async requestExport(
      context: VerifiedRequestContext,
      entityCode: string,
      filter: Readonly<Record<string, unknown>>,
      requestId?: string,
    ) {
      const exportRequestId = requestId ?? createId(),
        jobId = `records:export:${exportRequestId}`;
      const { descriptor, exactFilter, scope, exportFields } =
        await prepareExport(context, entityCode, filter);
      await authorizeDescriptorOperation(
        options.authorizer,
        context,
        descriptor,
        "export",
        {
          ...scope.authorizationResource,
          ...(usesEntityBackendAuthorization(
            options.authorizer,
            context,
            descriptor,
          )
            ? {
                authorizationFieldUses: (exportFields as string[]).map(
                  (field) => ({ field, use: "export" }),
                ),
              }
            : {}),
        },
      );
      await options.transactions.run(context.planeKey, context, async (tx) => {
        const state = await options.staging.saveExportRequest(
          {
            id: exportRequestId,
            tenantId: context.tenantId,
            entityCode,
            exactFilter,
            actorPrincipalId: context.principalId,
            status: "queued",
          },
          tx,
        );
        if (state === "replayed") return;
        await recordTransferAudit(
          options.audit,
          context,
          "records.export.requested",
          "export",
          entityCode,
          { exportRequestId, jobId, exactFilter },
          tx,
        );
        await appendEvent(
          options.outbox,
          context,
          "records.export.dispatch_requested",
          jobId,
          entityCode,
          exportRequestId,
          {
            tenantId: context.tenantId,
            entityCode,
            exactFilter,
            actorPrincipalId: context.principalId,
            exportRequestId,
            jobId,
          },
          tx,
        );
      });
      await dispatchOrFail(
        "export",
        context,
        entityCode,
        exportRequestId,
        jobId,
        () =>
          options.jobs.enqueue(
            "export",
            {
              planeKey: context.planeKey,
              tenantId: context.tenantId,
              entityCode,
              exactFilter,
              actorPrincipalId: context.principalId,
              exportRequestId,
              context,
            },
            { jobId },
          ),
      );
      return { exportRequestId, jobId, status: "queued" as const };
    },

    async cancelExport(
      context: VerifiedRequestContext,
      exportRequestId: string,
    ) {
      if (!options.staging.cancelExport)
        throw new Error(
          "Export cancellation is not supported by the staging store",
        );
      const jobId = `records:export:${exportRequestId}`;
      const state = await options.transactions.run(
        context.planeKey,
        context,
        async (tx) => {
          const current = options.staging.getExport
            ? await options.staging.getExport(
                context.tenantId,
                exportRequestId,
                tx,
              )
            : null;
          if (current && current.actorPrincipalId !== context.principalId)
            throw new RecordServiceError(
              403,
              "FORBIDDEN",
              "Record transfer belongs to another principal",
            );
          const result = await options.staging.cancelExport!(
            context.tenantId,
            exportRequestId,
            now().toISOString(),
            tx,
          );
          if (result === "not_found")
            throw new Error("Export request is unavailable");
          if (result === "cancelled") {
            await recordTransferAudit(
              options.audit,
              context,
              "records.export.cancelled",
              "export",
              current?.entityCode ?? "records.export_request",
              { exportRequestId, jobId },
              tx,
            );
            await appendEvent(
              options.outbox,
              context,
              "records.export.cancelled",
              `${jobId}:cancelled`,
              current?.entityCode ?? "records.export_request",
              exportRequestId,
              {
                transferId: exportRequestId,
                exportRequestId,
                jobId,
                entityCode: current?.entityCode ?? "records",
                status: "cancelled",
                url: `/operations/data-transfers?transfer=${encodeURIComponent(exportRequestId)}`,
              },
              tx,
            );
          }
          return result;
        },
      );
      if (state === "cancelled")
        await options.jobs.cancel?.(jobId).catch(() => false);
      return {
        exportRequestId,
        status:
          state === "cancelled"
            ? ("cancelled" as const)
            : ("already_terminal" as const),
      };
    },
    async restartExport(
      context: VerifiedRequestContext,
      exportRequestId: string,
    ) {
      if (!options.staging.restartExport || !options.staging.getExport)
        throw new RecordServiceError(
          409,
          "EXPORT_RESTART_UNAVAILABLE",
          "Export restart is not supported by the staging store",
        );
      const retryId = createId(),
        jobId = `records:export-retry:${retryId}`;
      const request = await options.transactions.run(
        context.planeKey,
        context,
        async (tx) => {
          const current = await options.staging.getExport!(
            context.tenantId,
            exportRequestId,
            tx,
          );
          if (!current)
            throw new RecordServiceError(
              404,
              "EXPORT_NOT_FOUND",
              "Export request is unavailable",
            );
          if (current.actorPrincipalId !== context.principalId)
            throw new RecordServiceError(
              403,
              "FORBIDDEN",
              "Record transfer belongs to another principal",
            );
          if (current.status !== "failed" || !current.exactFilter)
            throw new RecordServiceError(
              409,
              "EXPORT_RESTART_INVALID_STATE",
              "Only failed exports can be restarted",
            );
          assertBusinessPartnerExportPrivacy(
            current.entityCode,
            current.exactFilter,
          );
          const descriptor = await descriptorFor(
              options.metadata,
              context,
              current.entityCode,
            ),
            scope = await resolveTransferScope(
              options.collectionScopes,
              context,
              descriptor,
              "export",
              scopeCoordinate(current.exactFilter),
            );
          await authorizeDescriptorOperation(
            options.authorizer,
            context,
            descriptor,
            "export",
            scope.authorizationResource,
          );
          const state = await options.staging.restartExport!(
            context.tenantId,
            exportRequestId,
            tx,
          );
          if (state !== "restarted")
            throw new RecordServiceError(
              409,
              "EXPORT_RESTART_INVALID_STATE",
              "The export is no longer restartable",
            );
          await recordTransferAudit(
            options.audit,
            context,
            "records.export.restart_requested",
            "export",
            current.entityCode,
            { exportRequestId, jobId, retryId },
            tx,
          );
          await appendEvent(
            options.outbox,
            context,
            "records.export.dispatch_requested",
            jobId,
            current.entityCode,
            exportRequestId,
            {
              tenantId: context.tenantId,
              entityCode: current.entityCode,
              exactFilter: current.exactFilter,
              actorPrincipalId: context.principalId,
              exportRequestId,
              jobId,
              retry: true,
            },
            tx,
          );
          return current;
        },
      );
      await dispatchOrFail(
        "export",
        context,
        request.entityCode,
        exportRequestId,
        jobId,
        () =>
          options.jobs.enqueue(
            "export",
            {
              planeKey: context.planeKey,
              tenantId: context.tenantId,
              entityCode: request.entityCode,
              exactFilter: request.exactFilter!,
              actorPrincipalId: context.principalId,
              exportRequestId,
              context,
            },
            { jobId },
          ),
      );
      return { exportRequestId, jobId, status: "queued" as const };
    },
    async getImport(context: VerifiedRequestContext, sessionId: string) {
      const staged = await options.transactions.run(
        context.planeKey,
        context,
        (tx) => options.staging.get(context.tenantId, sessionId, tx),
      );
      if (!staged) throw new Error("Import session is unavailable");
      requireOwner(staged.session, context);
      return staged.session;
    },
    async downloadExport(
      context: VerifiedRequestContext,
      exportRequestId: string,
      expirySeconds = 300,
    ) {
      if (!options.errorReports || !options.staging.getExport)
        throw new Error("Export downloads are not configured");
      const request = await options.transactions.run(
        context.planeKey,
        context,
        (tx) =>
          options.staging.getExport!(context.tenantId, exportRequestId, tx),
      );
      if (
        !request ||
        request.actorPrincipalId !== context.principalId ||
        request.status !== "completed" ||
        !request.artifactKey
      )
        throw new Error("Export artifact is unavailable");
      const descriptor = await descriptorFor(
        options.metadata,
        context,
        request.entityCode,
      );
      if (
        usesEntityBackendAuthorization(options.authorizer, context, descriptor)
      ) {
        if (!request.exactFilter)
          throw new RecordServiceError(
            403,
            "EXPORT_AUTHORIZATION_CONTEXT_MISSING",
            "Export scope is unavailable",
          );
        const scope = await resolveTransferScope(
          options.collectionScopes,
          context,
          descriptor,
          "export",
          scopeCoordinate(request.exactFilter),
        );
        const fields = request.exactFilter["fields"];
        if (
          !Array.isArray(fields) ||
          !fields.length ||
          fields.some((field) => typeof field !== "string")
        )
          throw new RecordServiceError(
            403,
            "EXPORT_AUTHORIZATION_FIELDS_MISSING",
            "Export fields are unavailable",
          );
        await authorizeDescriptorOperation(
          options.authorizer,
          context,
          descriptor,
          "export",
          {
            ...scope.authorizationResource,
            authorizationFieldUses: fields.map((field) => ({
              field,
              use: "export",
            })),
          },
        );
      }
      const ttl = Math.min(Math.max(expirySeconds, 30), 3600);
      return {
        exportRequestId,
        rowCount: request.rowCount ?? 0,
        url: await options.errorReports.createDownloadUrl(
          request.artifactKey,
          ttl,
        ),
        expiresInSeconds: ttl,
      };
    },
    async listTransfers(context: VerifiedRequestContext, limit = 50) {
      if (!options.staging.listOwned)
        throw new Error("Transfer workspace is not configured");
      const safe = Math.min(Math.max(limit, 1), 100);
      return {
        items: await options.transactions.run(context.planeKey, context, (tx) =>
          options.staging.listOwned!(
            context.tenantId,
            context.principalId,
            safe,
            tx,
          ),
        ),
      };
    },
  };

  async function dispatchOrFail(
    kind: "import" | "export",
    context: VerifiedRequestContext,
    entityCode: string,
    transferId: string,
    jobId: string,
    enqueue: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await enqueue();
      return;
    } catch (error) {
      const failedAt = now().toISOString(),
        errorCode = "TRANSFER_DISPATCH_UNAVAILABLE",
        errorDetail =
          "The transfer queue is temporarily unavailable. Retry this failed transfer after queue service recovery.";
      const changed = await options.transactions
        .run(context.planeKey, context, async (tx) => {
          const marked =
            kind === "import"
              ? await options.staging.failQueuedImport?.(
                  context.tenantId,
                  transferId,
                  errorCode,
                  errorDetail,
                  failedAt,
                  tx,
                )
              : await options.staging.failQueuedExport?.(
                  context.tenantId,
                  transferId,
                  errorCode,
                  errorDetail,
                  failedAt,
                  tx,
                );
          if (!marked) return false;
          const eventCode = `records.${kind}.dispatch_failed`;
          await options.audit.record(
            {
              eventCode,
              action: kind,
              outcome: "failure",
              severity: "error",
              actor: { kind: "user", principalId: context.principalId },
              tenantId: context.tenantId,
              entityType: entityCode,
              requestId: context.requestId,
              ...(context.correlationId
                ? { correlationId: context.correlationId }
                : {}),
              metadata: { transferId, jobId, errorCode },
            },
            tx,
          );
          await appendEvent(
            options.outbox,
            context,
            eventCode,
            `${jobId}:dispatch-failed`,
            entityCode,
            transferId,
            {
              transferId,
              jobId,
              entityCode,
              status: "failed",
              errorCode,
              failedAt,
              url: `/operations/data-transfers?transfer=${encodeURIComponent(transferId)}`,
            },
            tx,
          );
          return true;
        })
        .catch(() => false);
      if (!changed) throw error;
      throw new RecordServiceError(503, errorCode, errorDetail);
    }
  }
}

export function assertBusinessPartnerExportPrivacy(
  entityCode: string,
  filter: Readonly<Record<string, unknown>>,
): void {
  if (entityCode !== "business_partner") return;
  const transfer = filter["_transfer"];
  if (!transfer || typeof transfer !== "object" || Array.isArray(transfer))
    return;
  const fields = (transfer as Readonly<Record<string, unknown>>)["fields"];
  if (!Array.isArray(fields)) return;
  const forbidden = fields.find(
    (field) =>
      typeof field === "string" &&
      /^(?:person|personal|employee|employment|work_assignment|workforce|external_worker|worker_engagement|engagement|placement|onboarding|offboarding|date_of_birth|national_id|compensation)(?:[._]|$)/i.test(
        field,
      ),
  );
  if (forbidden)
    throw new RecordServiceError(
      403,
      "BUSINESS_PARTNER_EXPORT_WORKFORCE_FORBIDDEN",
      "Generic Business Partner exports cannot contain person or workforce fields",
    );
}

function requireChunkStore<T>(
  store: ImportStagingStore<T>,
): asserts store is ImportStagingStore<T> &
  Required<Pick<ImportStagingStore<T>, "getChunk" | "appendChunk" | "seal">> {
  if (!store.getChunk || !store.appendChunk || !store.seal)
    throw new Error("Resumable imports are not supported by the staging store");
}
function requireOwner(
  session: RecordImportSession,
  context: VerifiedRequestContext,
) {
  if (session.createdBy && session.createdBy !== context.principalId)
    throw new RecordServiceError(
      403,
      "FORBIDDEN",
      "Record transfer belongs to another principal",
    );
}
function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function emptyChecksum() {
  return digest("");
}
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
    .join(",")}}`;
}
function summarize(
  rows: readonly ImportValidationRow[],
  sampleSize: number,
): ImportValidationSummary {
  const invalid = rows.filter((row) => !row.valid);
  const errorsByCode: Record<string, number> = {};
  for (const row of invalid)
    for (const error of row.errors) {
      const code = error.split(":", 1)[0]!.trim() || "VALIDATION_ERROR";
      errorsByCode[code] = (errorsByCode[code] ?? 0) + 1;
    }
  return {
    totalCount: rows.length,
    validCount: rows.length - invalid.length,
    invalidCount: invalid.length,
    errorsByCode,
    sample: invalid.slice(0, Math.max(0, sampleSize)),
    truncated: invalid.length > sampleSize,
  };
}
function preview(
  sessionId: string,
  rows: readonly ImportValidationRow[],
  summary: ImportValidationSummary,
): RecordImportPreview {
  return {
    sessionId,
    rows,
    validCount: summary.validCount,
    invalidCount: summary.invalidCount,
    summary,
  };
}
async function* errorLines(rows: readonly ImportValidationRow[]) {
  const encoder = new TextEncoder();
  for (const row of rows)
    if (!row.valid) yield encoder.encode(`${JSON.stringify(row)}\n`);
}
async function authorizeDescriptorOperation(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  descriptor: Awaited<ReturnType<typeof descriptorFor>>,
  operation: "import" | "export",
  resource: Readonly<Record<string, unknown>>,
) {
  const permissionCode = descriptor.operations[operation]?.permissionCode;
  if (
    !permissionCode ||
    !(
      await authorizer.authorize({
        context,
        permissionCode,
        observation: {
          entityCode: descriptor.entityCode,
          operationKey: operation,
          surface: "transfer",
          phase: "execute",
        },
        resource: {
          tenantId: context.tenantId,
          ...resource,
          ...(usesEntityBackendAuthorization(authorizer, context, descriptor)
            ? { entityCode: descriptor.entityCode, operationKey: operation }
            : {}),
        },
      })
    ).allowed
  )
    throw new RecordServiceError(
      403,
      "FORBIDDEN",
      `Record ${operation} is not permitted`,
    );
}
async function authorizeImportMode(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  descriptor: Awaited<ReturnType<typeof descriptorFor>>,
  operation: RecordImportOperation,
  resource: Readonly<Record<string, string>>,
) {
  const permissions =
    descriptor.listPresentation?.dataOperations?.importOperationPermissions?.[
      operation
    ] ?? [];
  if (!permissions.length)
    throw new RecordServiceError(
      403,
      "IMPORT_MODE_NOT_PUBLISHED",
      `Import ${operation} is not published for this entity`,
    );
  for (const permissionCode of permissions)
    if (
      !(
        await authorizer.authorize({
          context,
          permissionCode,
          resource: { tenantId: context.tenantId, ...resource },
        })
      ).allowed
    )
      throw new RecordServiceError(
        403,
        "FORBIDDEN",
        `Import ${operation} is not permitted`,
      );
}
async function resolveImportScope(
  resolver: RecordCollectionScopeResolver | undefined,
  context: VerifiedRequestContext,
  descriptor: Awaited<ReturnType<typeof descriptorFor>>,
  coordinate?: Readonly<Record<string, string>>,
): Promise<
  Extract<RecordCollectionScopeResolution, { readonly status: "ready" }>
> {
  const resolution = resolver
    ? await resolver.resolve({
        context,
        descriptor,
        operationCode: "import",
        ...(coordinate ? { coordinate } : {}),
      })
    : {
        status: "ready" as const,
        authorizationResource: Object.freeze({}),
        constraints: Object.freeze([]),
        labels: Object.freeze([]),
        fingerprintMaterial: Object.freeze({ mode: "tenant" }),
      };
  if (resolution.status === "context_required")
    throw new RecordServiceError(
      409,
      "IMPORT_SCOPE_REQUIRED",
      "A governed import scope must be selected",
    );
  if (resolution.status === "forbidden")
    throw new RecordServiceError(403, resolution.code, resolution.message);
  return resolution;
}
async function resolveTransferScope(
  resolver: RecordCollectionScopeResolver | undefined,
  context: VerifiedRequestContext,
  descriptor: Awaited<ReturnType<typeof descriptorFor>>,
  _operationCode: "export",
  coordinate?: import("@athyper/server-contract-records").RecordListScopeCoordinate,
): Promise<
  Extract<RecordCollectionScopeResolution, { readonly status: "ready" }>
> {
  const resolution = resolver
    ? await resolver.resolve({
        context,
        descriptor,
        operationCode: "read",
        ...(coordinate ? { coordinate } : {}),
      })
    : {
        status: "ready" as const,
        authorizationResource: Object.freeze({}),
        constraints: Object.freeze([]),
        labels: Object.freeze([]),
        fingerprintMaterial: Object.freeze({ mode: "tenant" }),
      };
  if (resolution.status === "context_required")
    throw new RecordServiceError(
      409,
      "EXPORT_SCOPE_REQUIRED",
      "A governed export scope must be selected",
    );
  if (resolution.status === "forbidden")
    throw new RecordServiceError(403, resolution.code, resolution.message);
  return resolution;
}
function scopeCoordinate(
  filter: Readonly<Record<string, unknown>>,
):
  | import("@athyper/server-contract-records").RecordListScopeCoordinate
  | undefined {
  const value = filter["scopeCoordinate"];
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return value as import("@athyper/server-contract-records").RecordListScopeCoordinate;
}
function requireDescriptorHash(
  session: RecordImportSession,
  compiledHash: string,
) {
  if (session.descriptorHash !== compiledHash)
    throw new RecordServiceError(
      409,
      "IMPORT_DESCRIPTOR_CHANGED",
      "The entity contract changed after this import began; start a new import",
    );
}
function requireWorkbookCapability(
  descriptor: Awaited<ReturnType<typeof descriptorFor>>,
) {
  if (
    !descriptor.listPresentation?.dataOperations?.importFormats?.includes(
      "xlsx",
    )
  )
    throw new RecordServiceError(
      409,
      "XLSX_IMPORT_NOT_PUBLISHED",
      "Excel import is not published for this entity",
    );
}
function requireImportFileCapability(
  descriptor: Awaited<ReturnType<typeof descriptorFor>>,
  format: "csv" | "json" | "xlsx",
) {
  if (
    !descriptor.listPresentation?.dataOperations?.importFormats?.includes(
      format,
    )
  )
    throw new RecordServiceError(
      409,
      "IMPORT_FILE_FORMAT_NOT_PUBLISHED",
      `${format.toUpperCase()} import is not published for this entity`,
    );
}
function importFileFormat(fileName: string): "csv" | "json" | "xlsx" {
  try {
    return structuredImportFormat(fileName);
  } catch (error) {
    if (error instanceof Error && "code" in error)
      throw new RecordServiceError(400, String(error.code), error.message);
    throw error;
  }
}
function workbookExample(type: string): string | number | boolean {
  return type === "integer" || type === "decimal" || type === "money"
    ? 0
    : type === "boolean"
      ? false
      : type === "date"
        ? "2026-01-31"
        : type === "datetime"
          ? "2026-01-31T12:00:00Z"
          : "";
}
function importFields(descriptor: Awaited<ReturnType<typeof descriptorFor>>) {
  return (
    descriptor.listPresentation?.dataOperations?.importFields ??
    descriptor.fields
      .filter(
        (field) =>
          field.writableOn.includes("create") ||
          field.writableOn.includes("patch"),
      )
      .map((field) => ({
        key: field.key,
        type: field.type,
        required: field.required,
        label: field.list?.label,
      }))
  );
}
function coerceWorkbookRows(
  rows: readonly Readonly<Record<string, unknown>>[],
  descriptor: Awaited<ReturnType<typeof descriptorFor>>,
) {
  const jsonFields = new Set(
    importFields(descriptor)
      .filter((field) => field.type === "json")
      .map((field) => field.key),
  );
  return rows.map((row, index) =>
    Object.freeze(
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => {
          if (
            !jsonFields.has(key) ||
            typeof value !== "string" ||
            !value.trim()
          )
            return [key, value];
          try {
            return [key, JSON.parse(value)];
          } catch {
            throw new RecordServiceError(
              422,
              "XLSX_JSON_CELL_INVALID",
              `Data row ${index + 2}, field ${key}, must contain valid JSON`,
            );
          }
        }),
      ),
    ),
  );
}
async function appendEvent<T>(
  outbox: OutboxWriter<T>,
  context: VerifiedRequestContext,
  eventType: string,
  eventKey: string,
  entityType: string,
  entityId: string,
  payload: Readonly<Record<string, unknown>>,
  tx: T,
) {
  await outbox.append(
    {
      tenantId: context.tenantId,
      topic: "records.transfer",
      eventType,
      eventKey,
      entityType,
      entityId,
      aggregateType: eventType.startsWith("records.export")
        ? "records.export_request"
        : "records.import_session",
      aggregateId: entityId,
      actorId: context.principalId,
      correlationId: context.correlationId,
      payload,
    },
    tx,
  );
}
async function recordTransferAudit<T>(
  audit: AuditRecorder<T>,
  context: VerifiedRequestContext,
  eventCode: string,
  action: string,
  entityType: string,
  metadata: Readonly<Record<string, unknown>>,
  transaction: T,
) {
  await audit.record(
    {
      eventCode,
      action,
      outcome: "success",
      actor: { kind: "user", principalId: context.principalId },
      tenantId: context.tenantId,
      entityType,
      requestId: context.requestId,
      ...(context.correlationId
        ? { correlationId: context.correlationId }
        : {}),
      metadata,
    },
    transaction,
  );
}
