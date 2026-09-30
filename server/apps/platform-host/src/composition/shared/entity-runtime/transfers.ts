import type { JobRuntime } from "@athyper/server-runtime-jobs";
import type { Transaction } from "kysely";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import type { MalwareScanner } from "@athyper/server-contract-malware-scanning";
import type { JobDefinition } from "@athyper/server-contract-jobs";
import {
  KyselyRecordTransferStore,
  createMetadataImportRowValidator,
  createObjectStorageRecordTransferArtifactStore,
  createObjectStorageImportWorkbookIntake,
  createRecordTransferJobDispatcher,
  createRecordTransferService,
  createRecordImportHandler,
  createRecordExportHandler,
  registerRecordTransferRoutes,
  registerPublicRecordTransferRoutes,
  RECORD_TRANSFER_QUEUE,
  EXECUTE_RECORD_IMPORT_JOB,
  EXECUTE_RECORD_EXPORT_JOB,
} from "@athyper/server-service-records";
import type { EntityServices } from "./services.js";

type TransferOptions = Parameters<
  typeof createRecordTransferService<Transaction<Record<string, never>>>
>[0];
type RouteOptions = Parameters<typeof registerRecordTransferRoutes>[1];
export interface EntityTransferOptions extends Pick<
  TransferOptions,
  | "metadata"
  | "authorizer"
  | "audit"
  | "outbox"
  | "transactions"
  | "adapters"
  | "collectionScopes"
> {
  readonly jobs?: JobRuntime;
  readonly storage?: ObjectStorage;
  readonly scanner?: MalwareScanner;
  readonly queries: EntityServices["queries"];
  readonly metrics?: Parameters<typeof createRecordImportHandler>[0]["metrics"];
}

/** Transfer services and jobs share the same metadata, authorization and locked scopes.
 * Space-owned import adapters are supplied by the host, never selected here. */
export function createEntityTransferRuntime(options: EntityTransferOptions) {
  const {
    jobs,
    storage,
    scanner,
    metadata,
    authorizer,
    audit,
    outbox,
    transactions,
    adapters,
    collectionScopes,
    queries,
    metrics,
  } = options;
  if (!jobs || !storage) return undefined;
  const store = new KyselyRecordTransferStore();
  const artifacts = createObjectStorageRecordTransferArtifactStore(storage);
  const workbookIntake = scanner
    ? createObjectStorageImportWorkbookIntake(storage, scanner)
    : undefined;
  const transfers = createRecordTransferService({
    staging: store,
    validator: createMetadataImportRowValidator(metadata, authorizer),
    jobs: createRecordTransferJobDispatcher(jobs),
    metadata,
    authorizer,
    audit,
    outbox,
    transactions,
    adapters,
    ...(collectionScopes ? { collectionScopes } : {}),
    errorReports: artifacts,
    ...(workbookIntake ? { workbookIntake } : {}),
  });
  return {
    transfers,
    registerHttp(
      application: Parameters<typeof registerRecordTransferRoutes>[0],
      options: Pick<RouteOptions, "authenticate" | "readContext"> & {
        publicApiEnabled?: boolean;
      },
    ) {
      const routes = {
        authenticate: options.authenticate,
        readContext: options.readContext,
        transfers,
      };
      registerRecordTransferRoutes(application, routes);
      if (options.publicApiEnabled)
        registerPublicRecordTransferRoutes(application, routes);
    },
    registerJobs(
      registerDefinition: (...definitions: JobDefinition[]) => void,
    ) {
      jobs.register(
        RECORD_TRANSFER_QUEUE,
        EXECUTE_RECORD_IMPORT_JOB,
        createRecordImportHandler({
          store,
          metadata,
          authorizer,
          adapters,
          ...(collectionScopes ? { collectionScopes } : {}),
          transactions,
          audit,
          outbox,
          ...(metrics ? { metrics } : {}),
        }),
      );
      jobs.register(
        RECORD_TRANSFER_QUEUE,
        EXECUTE_RECORD_EXPORT_JOB,
        createRecordExportHandler({
          store,
          metadata,
          authorizer,
          queries,
          ...(collectionScopes ? { collectionScopes } : {}),
          transactions,
          artifacts,
          audit,
          outbox,
          ...(metrics ? { metrics } : {}),
        }),
      );
      registerDefinition(
        {
          code: EXECUTE_RECORD_IMPORT_JOB,
          owner: "@athyper/server-service-records",
          queue: RECORD_TRANSFER_QUEUE,
          name: EXECUTE_RECORD_IMPORT_JOB,
          scope: "tenant",
          payloadSchema: { name: EXECUTE_RECORD_IMPORT_JOB, version: 1 },
          timeoutMs: 300_000,
          maxAttempts: 5,
          executionRetentionDays: 90,
        },
        {
          code: EXECUTE_RECORD_EXPORT_JOB,
          owner: "@athyper/server-service-records",
          queue: RECORD_TRANSFER_QUEUE,
          name: EXECUTE_RECORD_EXPORT_JOB,
          scope: "tenant",
          payloadSchema: { name: EXECUTE_RECORD_EXPORT_JOB, version: 1 },
          timeoutMs: 300_000,
          maxAttempts: 5,
          executionRetentionDays: 30,
        },
      );
    },
  };
}
