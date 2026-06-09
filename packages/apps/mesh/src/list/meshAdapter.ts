import type {
  RuntimeAccessContext,
  RuntimeAccessScope,
  RuntimeDescriptor,
  RuntimeListServerAdapter,
} from "@athyper/runtime-list/adapter";
import { createDelegatedAccessScope, resolveRuntimeAccessScope } from "@athyper/runtime-list/core";
import { EntityListPageFrame } from "@athyper/surface-kit";

export function resolveMeshAccessScope(
  descriptor: RuntimeDescriptor,
  context:    RuntimeAccessContext,
): RuntimeAccessScope {
  return resolveRuntimeAccessScope("mesh", descriptor, context);
}

export const meshAdapter: RuntimeListServerAdapter = {
  plane: "mesh",
  features: {
    export:              true,
    columnCustomization: true,
    grouping:            true,
    viewModes:           ["list", "compact"],
    searchMode:          "server",
    maxPageSize:         200,
  },

  async fetchDescriptor(_entityCode) {
    // Return null so RuntimeListPage renders the graceful "entity unavailable" state
    // rather than propagating an unhandled error to the Next.js error boundary.
    return null;
  },
  async resolveAccessScope(_entityCode, descriptor) {
    return createDelegatedAccessScope("mesh", descriptor);
  },
  async fetchRecords(_entityCode, _params, _descriptor) {
    return { records: [], pagination: undefined, isFullyLoaded: true };
  },

  entityListHref:   (code) => `/workspace/${code}`,
  entityDetailHref: (code, id) => `/workspace/${code}/${id}`,
  entityNewHref:    (code) => `/workspace/${code}/new`,

  PageFrame: EntityListPageFrame,
};
