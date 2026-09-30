import { createS3ObjectStorageAdapter } from "@athyper/server-adapter-object-storage-s3";
import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import type { HostConfig } from "../../config/environment.js";
import type { Container } from "../../kernel/container.js";
import type { AdapterRegistrationDependencies } from "./adapter-contract.js";

export type StorageRegistrationDependencies = Pick<
  AdapterRegistrationDependencies,
  "createObjectStorage"
>;

const DEFAULT_DEPENDENCIES: StorageRegistrationDependencies = {
  createObjectStorage: createS3ObjectStorageAdapter,
};

export function registerStorage(
  container: Container,
  config: HostConfig,
  lifecycle: LifecycleManager,
  overrides: Partial<StorageRegistrationDependencies> = {},
) {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  if (config.objectStorage.buckets) {
    const { buckets } = config.objectStorage;
    const sharedObjectStorageOptions = {
      region: config.objectStorage.region,
      multipartPartSizeMb: config.objectStorage.multipartPartSizeMb,
      multipartQueueSize: config.objectStorage.multipartQueueSize,
      maxUploadMb: config.objectStorage.maxUploadMb,
      presignedTtlSeconds: config.objectStorage.presignedTtlSeconds,
      ...(config.objectStorage.endpoint
        ? { endpoint: config.objectStorage.endpoint }
        : {}),
      ...(config.objectStorage.publicEndpoint
        ? { publicEndpoint: config.objectStorage.publicEndpoint }
        : {}),
    };
    const appCredentials = {
      ...(config.objectStorage.credentialProfile
        ? { credentialProfile: config.objectStorage.credentialProfile }
        : {}),
      ...(config.objectStorage.accessKeyId
        ? { accessKeyId: config.objectStorage.accessKeyId }
        : {}),
      ...(config.objectStorage.secretAccessKey
        ? { secretAccessKey: config.objectStorage.secretAccessKey }
        : {}),
    };
    const artifactsWriterCredentials = {
      ...(config.objectStorage.artifactsWriterCredentialProfile
        ? {
            credentialProfile:
              config.objectStorage.artifactsWriterCredentialProfile,
          }
        : {}),
      ...(config.objectStorage.artifactsWriterAccessKeyId
        ? { accessKeyId: config.objectStorage.artifactsWriterAccessKeyId }
        : {}),
      ...(config.objectStorage.artifactsWriterSecretAccessKey
        ? {
            secretAccessKey:
              config.objectStorage.artifactsWriterSecretAccessKey,
          }
        : {}),
    };

    const objectStorageDocuments = dependencies.createObjectStorage({
      ...sharedObjectStorageOptions,
      bucket: buckets.documents,
      ...appCredentials,
    });
    container.adapters.objectStorageDocuments = objectStorageDocuments;
    container.adapters.objectStorageDocumentsBucket = buckets.documents;
    lifecycle.onReady(() => objectStorageDocuments.validateAccess());
    lifecycle.onShutdown(() => objectStorageDocuments.close());

    const objectStorageTransfers = dependencies.createObjectStorage({
      ...sharedObjectStorageOptions,
      bucket: buckets.transfers,
      ...appCredentials,
    });
    container.adapters.objectStorageTransfers = objectStorageTransfers;
    container.adapters.objectStorageTransfersBucket = buckets.transfers;
    lifecycle.onReady(() => objectStorageTransfers.validateAccess());
    lifecycle.onShutdown(() => objectStorageTransfers.close());

    // Bound to the writer credential, not athyper-app: athyper-app only ever
    // reads this bucket, and probing under a credential other than the one
    // artifact writers actually use would not catch a write-path misconfig.
    const objectStorageArtifacts = dependencies.createObjectStorage({
      ...sharedObjectStorageOptions,
      bucket: buckets.artifacts,
      ...artifactsWriterCredentials,
    });
    container.adapters.objectStorageArtifacts = objectStorageArtifacts;
    container.adapters.objectStorageArtifactsBucket = buckets.artifacts;
    // Read-only reachability probe: HeadBucket + GetObject on a sentinel
    // reconciled by the s3-tools initializer. This does not prove PutObject works --
    // that is a live acceptance test, not a startup gate (see the storage
    // architecture plan, §05).
    lifecycle.onReady(() =>
      objectStorageArtifacts.validateReadAccess("_probes/artifacts-sentinel"),
    );
    lifecycle.onShutdown(() => objectStorageArtifacts.close());
  }
}
