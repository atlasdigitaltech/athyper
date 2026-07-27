import type {
  RuntimeAccessContext,
  RuntimeAccessScope,
  RuntimeDescriptor,
  RuntimeListServerAdapter,
  EntityListResponse,
  RawSearchParams,
} from "@athyper/runtime-list/adapter";
import { createDelegatedAccessScope, resolveRuntimeAccessScope } from "@athyper/runtime-list/core";

export interface MeshAdapterConfig {
  fetchDescriptor(entityCode: string): Promise<RuntimeDescriptor | null>;
  fetchRecords(
    entityCode: string,
    params: RawSearchParams,
    descriptor: RuntimeDescriptor,
  ): Promise<EntityListResponse>;
}

export function resolveMeshAccessScope(
  descriptor: RuntimeDescriptor,
  context:    RuntimeAccessContext,
): RuntimeAccessScope {
  return resolveRuntimeAccessScope("mesh", descriptor, context);
}

export function createMeshAdapter(config: MeshAdapterConfig): RuntimeListServerAdapter {
  return {
    plane: "mesh",
    features: {
      savedViews:          false,
      bulkActions:         false,
      export:              false,
      import:              false,
      columnCustomization: true,
      grouping:            true,
      viewModes:           ["list", "compact"],
      searchMode:          "server",
      maxPageSize:         200,
    },

    fetchDescriptor: config.fetchDescriptor,
    async resolveAccessScope(_entityCode, descriptor) {
      // The Mesh runtime API has already intersected the active account grant,
      // record grants, tenant, plane and descriptor. No client-supplied scope
      // may widen that server boundary.
      return createDelegatedAccessScope("mesh", descriptor);
    },
    async fetchRecords(entityCode, params, descriptor) {
      return config.fetchRecords(entityCode, params, descriptor);
    },

    entityListHref:   (code) => `/app/${code}`,
    entityDetailHref: (code, id) => `/app/${code}/${id}`,
    // Mesh never exposes generic direct create/write routes.
    entityNewHref:    (code) => `/app/${code}`,
  };
}
