import type { MetadataReader } from "@athyper/server-contract-metadata";
import { createMetadataFormatReader } from "./metadata-format-reader.js";
import { type PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { PlaneKey } from "@athyper/server-foundation/context";
import { createDistributedDescriptorCache, createDistributedCompiledEntityArtifactCache, createMetadataService, createCompiledMetadataReader, readCompiledRuntimeContract, createRuntimeMetaCompiledEntityReleaseSource, createRuntimeDescriptorRepository, PinnedCompiledEntityReader } from "@athyper/server-platform-metadata";
import type { Kysely, Transaction } from "kysely";
import type { HostConfig } from "../../../config/index.js";
import type { Container } from "../../create-container.js";

type RecordTransaction = Transaction<Record<string, never>>;

export function registerEntityMetadata(container: Container, config: HostConfig | undefined, databases: Partial<Record<PlaneKey, Kysely<Record<string, never>>>>, transactions: PlaneTransactionCoordinator<RecordTransaction>, override?: MetadataReader) {
  // One split-artifact reader is shared by query descriptors and record sections.
  container.platform.compiledEntityReader = new PinnedCompiledEntityReader({
    source: createRuntimeMetaCompiledEntityReleaseSource({
      databases: databases,
      withTenantTransaction: (planeKey, actor, work) =>
        transactions.run(planeKey, actor, work),
    }),
    ...(container.adapters.redisCache
      ? { cache: createDistributedCompiledEntityArtifactCache(container.adapters.redisCache) }
      : {}),
  });
  const compiledMetadata = createCompiledMetadataReader(container.platform.compiledEntityReader);
  const legacyMetadata = createMetadataService({
    repository: createRuntimeDescriptorRepository({
      databases: databases,
      withTenantTransaction: (planeKey, actor, work) => transactions.run(planeKey, actor, work),
    }),
    ...(container.adapters.redisCache ? {cache: createDistributedDescriptorCache(container.adapters.redisCache)} : {}),
  });
  const reader = container.platform.compiledEntityReader;
  const migrationMetadata = config?.metadataFormatRouting
    ? createMetadataFormatReader({ async getEntityDescriptor(context, entityCode) {
        const release = await reader.resolve({ planeKey: context.planeKey, tenantId: context.tenantId,
          principalId: context.principalId, entityCode });
        // Old UI-only split releases do not declare the runtime_contract format.
        // Select by the admitted manifest, never catch errors to select a fallback.
        if (!release?.release.artifacts.some(a => a.entityCode === entityCode && a.artifactType === "runtime_contract")) return null;
        return readCompiledRuntimeContract(reader, release);
      } }, legacyMetadata) : legacyMetadata;
  // A compiled-only plane NEVER falls back to native rows or graph previews.
  // Other planes may explicitly opt into active-publication-format routing.
  const metadata = override ?? {
    getEntityDescriptor: ((context, entityCode) =>
      config?.compiledMetadataPlanes?.includes(context.planeKey)
        ? compiledMetadata.getEntityDescriptor(context, entityCode)
        : migrationMetadata.getEntityDescriptor(context, entityCode)
    ) satisfies import("@athyper/server-contract-metadata").MetadataReader["getEntityDescriptor"],
  };
  container.platform.metadata = metadata;
  return metadata;
}
