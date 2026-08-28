import type { RecordCollectionScopeResolution, RecordCollectionScopeResolver } from "@athyper/server-contract-records";

/** Normalizes Studio's global-plus-tenant metadata catalog into the shared list boundary. */
export function createStudioRecordCollectionScopeResolver(): RecordCollectionScopeResolver {
  return Object.freeze({
    async resolve(input: Parameters<RecordCollectionScopeResolver["resolve"]>[0]): Promise<RecordCollectionScopeResolution> {
      const descriptor = input.descriptor;
      if ((input.operationCode !== "read" && input.operationCode !== "import") || descriptor.planeKey !== "studio" || descriptor.entityCode !== "metadata_entity" || descriptor.storage.schema !== "metadata" || descriptor.storage.object !== "entity") return tenantScope();
      return Object.freeze({
        status: "ready",
        authorizationResource: Object.freeze({}),
        constraints: Object.freeze([{ kind: "studio.metadata_entity.catalog.v1" as const, tenantId: input.context.tenantId }]),
        labels: Object.freeze([{ key: "catalog_scope", label: "Catalog scope", value: "System and current tenant" }]),
        fingerprintMaterial: Object.freeze({ resolver: "studio.metadata_entity.catalog.v1", tenantId: input.context.tenantId }),
      });
    },
  });
}

function tenantScope(): Extract<RecordCollectionScopeResolution, { readonly status: "ready" }> { return Object.freeze({ status: "ready", authorizationResource: Object.freeze({}), constraints: Object.freeze([]), labels: Object.freeze([]), fingerprintMaterial: Object.freeze({ mode: "tenant" }) }); }
