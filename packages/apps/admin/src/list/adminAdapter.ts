import type {
  RuntimeAccessContext,
  RuntimeAccessScope,
  RuntimeDescriptor,
  RuntimeListServerAdapter,
} from "@athyper/runtime-list/adapter";
import { createDelegatedAccessScope, resolveRuntimeAccessScope } from "@athyper/runtime-list/core";
import { EntityListPageFrame } from "@athyper/surface-kit";

export function resolveAdminAccessScope(
  descriptor: RuntimeDescriptor,
  context:    RuntimeAccessContext,
): RuntimeAccessScope {
  return resolveRuntimeAccessScope("admin", descriptor, context);
}

export const adminAdapter: RuntimeListServerAdapter = {
  plane: "admin",
  features: {
    viewModes:           ["list"],
    searchMode:          "server",
    maxPageSize:         100,
  },

  async fetchDescriptor(_entityCode) {
    // Return null so RuntimeListPage renders the graceful "entity unavailable" state
    // rather than propagating an unhandled error to the Next.js error boundary.
    return null;
  },
  async resolveAccessScope(_entityCode, descriptor) {
    return createDelegatedAccessScope("admin", descriptor);
  },
  async fetchRecords(_entityCode, _params, _descriptor) {
    return { records: [], pagination: undefined, isFullyLoaded: true };
  },

  entityListHref:   (code) => `/admin/${code}`,
  entityDetailHref: (code, id) => `/admin/${code}/${id}`,
  entityNewHref:    (code) => `/admin/${code}/new`,

  PageFrame: EntityListPageFrame,
};
