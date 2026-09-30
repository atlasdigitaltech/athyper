import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRecordSummaryViewV1 } from "@athyper/contract-platform-entity-runtime";
import {
  readCompiledRuntimeContract,
  type PinnedCompiledEntityReader,
  type CompiledEntityResolvedRelease,
} from "@athyper/server-platform-metadata";
import type {
  EntityRuntimeHeaderRepository,
  EntityRuntimeSummaryHandler,
  EntityRuntimeSummaryHandlerRegistry,
  EntityRuntimeResourceContext,
} from "./entity-section-service.js";

type Input = {
  context: VerifiedRequestContext;
  entityCode: string;
  recordId: string;
  resourceContext?: EntityRuntimeResourceContext;
};
/** Normalized publications have a runtime contract, not a legacy presentation
 * surface. Resolve providers against that same signed release; never fall back
 * to a reference artifact in a different bundle. No cross-request data cache. */
export function createPublishedSummaryService(options: {
  reader: PinnedCompiledEntityReader;
  headers: EntityRuntimeHeaderRepository;
  providers?: EntityRuntimeSummaryHandlerRegistry;
}) {
  // A small generic provider for entities that explicitly declare it. It uses
  // only the published header fields and the same authorized query boundary.
  // Domain summaries remain registered host providers; none are inferred.
  const identityProvider = {
    authorize: async () => true,
    async read(input: Parameters<EntityRuntimeSummaryHandler["read"]>[0]) {
      const descriptor = await readCompiledRuntimeContract(
        options.reader,
        input.release,
      );
      const presentation = descriptor.recordPresentation!;
      const fieldKeys = [
        ...new Set([
          presentation.titleField,
          ...(presentation.codeField ? [presentation.codeField] : []),
          ...presentation.contextFields,
        ]),
      ];
      const header = await options.headers.readHeader({ ...input, fieldKeys });
      if (!header) return null;
      return {
        value: Object.fromEntries(
          fieldKeys
            .filter((key) => Object.hasOwn(header.values, key))
            .map((key) => [key, header.values[key]]),
        ),
        displayFields: fieldKeys
          .filter((key) => Object.hasOwn(header.values, key))
          .map((key) => ({
            key,
            label: {
              labelKey: `field.${key}`,
              defaultText: key.replaceAll("_", " "),
            },
          })),
      };
    },
  };
  const providerFor = (key: string) =>
    key === "platform.record.identity.v1"
      ? identityProvider
      : options.providers?.get(key);
  async function model(input: Input, pinned?: CompiledEntityResolvedRelease) {
    const release =
      pinned ??
      (await options.reader.resolve({
        tenantId: input.context.tenantId,
        principalId: input.context.principalId,
        planeKey: input.context.planeKey,
        entityCode: input.entityCode,
      }));
    if (!release || !release.artifactIndex.has(`${input.entityCode}/runtime`))
      return null;
    if (
      release.coordinate.tenantId !== input.context.tenantId ||
      release.coordinate.principalId !== input.context.principalId ||
      release.coordinate.planeKey !== input.context.planeKey ||
      release.coordinate.entityCode !== input.entityCode
    )
      throw Error("SUMMARY_RELEASE_SCOPE_MISMATCH");
    const descriptor = await readCompiledRuntimeContract(
      options.reader,
      release,
    );
    const declared = descriptor.recordPresentation?.summaryView;
    if (!declared) return null;
    const core = await options.reader.core(release);
    const header = await options.headers.readHeader({
      context: input.context,
      release,
      core,
      recordId: input.recordId,
      fieldKeys: [
        descriptor.storage.idField,
        ...(descriptor.storage.versionField
          ? [descriptor.storage.versionField]
          : []),
      ],
    });
    if (!header) return null;
    const request = {
      ...input,
      release,
      core,
      requestCache: new Map<string, Promise<unknown>>(),
    };
    const cards = [] as EntityRecordSummaryViewV1["cards"][number][];
    for (const card of declared.cards) {
      const provider = providerFor(card.provider);
      // New runtime providers must explicitly authorize discovery, not merely
      // expose a read method. Denied/unknown cards do not disclose their labels.
      try {
        if (provider?.authorize && (await provider.authorize(request)))
          cards.push(card);
      } catch {
        // Failed authorization/provider discovery is unavailable, never allowed.
        // Optional summary failure must not prevent ordinary record access.
      }
    }
    return { descriptor, release, header, request, cards };
  }
  return {
    async describe(
      input: Input & { releaseId: string },
    ): Promise<EntityRecordSummaryViewV1 | undefined> {
      const value = await model(input);
      if (
        !value ||
        value.descriptor.releaseId !== input.releaseId ||
        !value.cards.length
      )
        return undefined;
      return { schemaVersion: 1, cards: value.cards };
    },
    async read(input: Input, pinned: CompiledEntityResolvedRelease) {
      const value = await model(input, pinned);
      if (!value || !value.cards.length) return null;
      const cards = await Promise.all(
        value.cards.map(async (card) => {
          try {
            const data = await providerFor(card.provider)!.read(value.request);
            return {
              key: card.key,
              state: data == null ? "empty" : "ready",
              ...(data == null ? {} : { data }),
            };
          } catch (error) {
            if (
              error &&
              typeof error === "object" &&
              (Reflect.get(error, "code") ===
                "ENTITY_RUNTIME_CONTEXT_REQUIRED" ||
                Reflect.get(error, "status") === 409)
            )
              return { key: card.key, state: "context_required" };
            return { key: card.key, state: "unavailable" };
          }
        }),
      );
      const recordVersion = value.descriptor.storage.versionField
        ? value.header.values[value.descriptor.storage.versionField]
        : undefined;
      return {
        releaseId: value.release.release.releaseId,
        releaseHash: value.release.release.releaseHash,
        revision:
          recordVersion == null ? value.header.revision : String(recordVersion),
        cards,
      };
    },
  };
}
