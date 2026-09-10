import { createHash } from "node:crypto";
import {
  parseAtlasBusinessContext,
  type AtlasBusinessContextV1,
} from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type {
  ListRecordsQuery,
  RecordQueryService,
} from "@athyper/server-contract-records";
import { assertAtlasContext } from "./context.js";
import { AtlasServiceError, AtlasScopeSelectionRequiredError } from "./errors.js";

export interface AtlasResolvedBusinessContext {
  readonly page: AtlasBusinessContextV1;
  readonly descriptorHash: string;
  /** Published entity hash; descriptorHash identifies the authorized list surface. */
  readonly entityDescriptorHash?: string;
  readonly entityContractHash?: string;
  readonly scopeFingerprint: string;
}
export interface AtlasBusinessContextResolver {
  resolve(
    context: VerifiedRequestContext,
    value: unknown,
  ): Promise<AtlasResolvedBusinessContext>;
}
/** Use the same list service as Manage: standard views, cursor, query fields and directory admission. */
export function createAtlasBusinessContextResolver(options: {
  readonly metadata: MetadataReader;
  readonly cases?: import("@athyper/server-contract-ai").AtlasCaseExplanationOwner;
  readonly records: RecordQueryService;
  readonly list: (query: ListRecordsQuery) => Promise<{
    readonly descriptorHash: string;
    readonly scopeFingerprint: string;
    readonly rows: readonly { readonly id: string }[];
  }>;
}): AtlasBusinessContextResolver {
  return {
    async resolve(context, value) {
      assertAtlasContext(context);
      const page = readAtlasBusinessContext(value);
      const deny = (): never => {
        throw new AtlasServiceError(
          "PERMISSION_DENIED",
          "The requested Atlas business context is unavailable.",
        );
      };
      const descriptor = await options.metadata.getEntityDescriptor(
        context,
        page.entityCode,
      );
      if (!descriptor || descriptor.entityCode !== page.entityCode || descriptor.planeKey !== context.planeKey)
        return deny();
      // Legacy BP context transport is allowed; this does not enable any additional tools.
      if (
        descriptor.ai &&
        (!descriptor.ai.enabled ||
          !descriptor.ai.contextKinds.includes(page.kind))
      )
        return deny();
      if (
        !descriptor.ai &&
        !(context.planeKey === "neon" && page.entityCode === "business_partner")
      )
        return deny();
      // Case relationships remain owner-specific. Work coordinates are validated by the Records list owner.
      if (
        page.kind === "record" &&
        page.entityCode === "business_partner" &&
        page.roleLens &&
        !["all", "supplier", "customer"].includes(page.roleLens)
      )
        return deny();
      if (page.workContext?.networkAccountId && !descriptor.ai?.insightProviders.some(ref => ref.id === "entity_read_record" && ref.version === 1)) return deny();
      if (page.kind === "record" && page.caseId) {
        if (page.entityCode !== "business_partner" || !options.cases) return deny();
        try { await options.cases.read({context, requestId: page.caseId, businessPartnerId: page.recordId}); }
        catch { return deny(); }
      }
      try {
        const base = {
          context,
          entityCode: page.entityCode,
          countMode: "none" as const,
          hydrateReferences: false,
        };
        if (page.kind === "record") {
          // Mesh admission must use the account-scoped Records owner below.
          // The unscoped get cannot supply its required account coordinate.
          const scopedMeshRecord = context.planeKey === "mesh" && page.entityCode === "network_relationship";
          if (!scopedMeshRecord &&
            !(
              await options.records.get({
                context,
                entityCode: page.entityCode,
                recordId: page.recordId,
                hydrateReferences: false,
              })
            ).data
          )
            return deny();
          const scoped = await options.list({
            ...base,
            // Tenant-wide directory admission is independent of optional work scope.
            // Work coordinates remain untrusted until a scoped owner evaluates them.
            ...(descriptor.directoryScope?.mode === "tenant" && page.entityCode === "business_partner" && context.planeKey === "neon" ? {} : {scopeCoordinate: page.workContext}),
            recordIds: [page.recordId],
            limit: 1,
          });
          if (!scoped.rows.some((row) => row.id === page.recordId))
            return deny();
          return Object.freeze({
            page,
            descriptorHash: scoped.descriptorHash,
            entityDescriptorHash: descriptor.compiledHash,
          entityContractHash: descriptor.contractHash,
            scopeFingerprint: fingerprint(scoped.scopeFingerprint, page),
          });
        }
        // Directory membership and transaction work coordinates are validated independently.
        if (page.workContext)
          await options.list({
            ...base,
            scopeCoordinate: page.workContext,
            limit: 1,
          });
        const directory = page.directory;
        // The owner eligibility filter requires exactly one explicit organization/company pair.
        const directoryCoordinate =
          directory?.eligibleOperation &&
          directory.operatingOrganizationIds?.length === 1 &&
          directory.companyCodeIds?.length === 1
            ? {
                partnerRole: directory.partnerRole,
                eligibleOperation: directory.eligibleOperation,
                operatingOrganizationId: directory.operatingOrganizationIds[0],
                companyCodeId: directory.companyCodeIds[0],
              }
            : directory;
        const query = {
          ...base,
          fields: page.fields,
          group: page.group,
          filters: page.filters,
          sort: page.sort,
          search: page.search,
          standardViewKey: page.standardViewKey,
          scopeCoordinate: directoryCoordinate,
          limit: page.pageSize,
        };
        const scoped = await options.list({ ...query, cursor: page.cursor });
        if (
          page.visibleIds.some(
            (id) => !scoped.rows.some((row) => row.id === id),
          )
        )
          return deny();
        if (page.selectedIds.length) {
          const selected = await options.list({
            ...query,
            recordIds: page.selectedIds,
            limit: 100,
          });
          if (
            page.selectedIds.some(
              (id) => !selected.rows.some((row) => row.id === id),
            )
          )
            return deny();
        }
        return Object.freeze({
          page,
          descriptorHash: scoped.descriptorHash,
          entityDescriptorHash: descriptor.compiledHash,
          entityContractHash: descriptor.contractHash,
          scopeFingerprint: fingerprint(scoped.scopeFingerprint, page),
        });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "RECORD_LIST_SCOPE_REQUIRED") throw new AtlasScopeSelectionRequiredError();
        return deny();
      }
    },
  };
}
function fingerprint(scope: string, page: AtlasBusinessContextV1) {
  const { generationId: _, ...coordinates } = page;
  return createHash("sha256")
    .update(JSON.stringify(canonical([scope, coordinates])))
    .digest("hex");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [
          key,
          [
            "selectedIds",
            "visibleIds",
            "operatingOrganizationIds",
            "companyCodeIds",
          ].includes(key) && Array.isArray(item)
            ? [...item].sort()
            : canonical(item),
        ]),
    );
  return value;
}

/** Converts contract errors into the public, bounded 400 response at both entry points. */
export function readAtlasBusinessContext(
  value: unknown,
): AtlasBusinessContextV1 {
  try {
    return parseAtlasBusinessContext(value);
  } catch {
    throw new AtlasServiceError(
      "INVALID_ARGUMENT",
      "Invalid Atlas business context.",
    );
  }
}

/** Navigation/cursor coordinates stay on the server; this is not record evidence. */
export function atlasBusinessContextModelScope(page: AtlasBusinessContextV1): Readonly<Record<string, unknown>> {
  if (page.kind === "record") {
    const { generationId: _generation, schemaVersion: _version, ...scope } = page;
    return scope;
  }
  return {
    kind: page.kind,
    entityCode: page.entityCode,
    locale: page.locale,
    analysisTarget: page.analysisTarget,
    selectedCount: page.selectedIds.length,
    visibleCount: page.visibleIds.length,
    appliedFilterCount: page.filters.length,
    ...(page.search ? { searchApplied: true } : {}),
    ...(page.standardViewKey ? { standardViewKey: page.standardViewKey } : {}),
    // The qualified summary tool can use a single selected target. Multiple-ID
    // insights need their own owner adapter; never imply partial IDs are complete.
    ...(page.analysisTarget === "selection" && page.selectedIds.length === 1 ? { recordId: page.selectedIds[0] } : {}),
    ...(page.workContext ? { workContext: page.workContext } : {}),
    ...(page.directory ? { directory: { operatingOrganizationCount:page.directory.operatingOrganizationIds?.length??0,companyCount:page.directory.companyCodeIds?.length??0,partnerRole:page.directory.partnerRole,eligibleOperation:page.directory.eligibleOperation } } : {}),
  };
}
