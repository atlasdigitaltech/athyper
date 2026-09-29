import {
  registerEntityListRoutes,
  registerRecordBookmarkRoutes,
  registerRecordSnapshotRoutes,
  registerSharedReferenceDirectoryRoutes,
} from "@athyper/server-service-records";
import {
  registerEntityViewRoutes,
  registerReferenceChoiceRoutes,
} from "@athyper/server-platform-preferences";

export interface EntityReadHttpBindings {
  readonly entity: Parameters<typeof registerEntityListRoutes>[1];
  readonly views?: Parameters<typeof registerEntityViewRoutes>[1];
  readonly references?: Parameters<typeof registerReferenceChoiceRoutes>[1];
  readonly directory?: Parameters<typeof registerSharedReferenceDirectoryRoutes>[1];
  readonly bookmarks?: Parameters<typeof registerRecordBookmarkRoutes>[1];
  readonly snapshots?: Parameters<typeof registerRecordSnapshotRoutes>[1];
}

/** Independently loadable HTTP registrar. Each binding requires its own existing
 * authentication/authorization ports; there is no anonymous or permissive default.
 * Compatibility descriptor overrides stay in the caller, never in this module. */
export function registerEntityReadHttp(
  application: Parameters<typeof registerEntityListRoutes>[0],
  bindings: EntityReadHttpBindings,
): void {
  if (bindings.views) registerEntityViewRoutes(application, bindings.views);
  if (bindings.references) registerReferenceChoiceRoutes(application, bindings.references);
  if (bindings.directory) registerSharedReferenceDirectoryRoutes(application, bindings.directory);
  registerEntityListRoutes(application, bindings.entity);
  if (bindings.bookmarks) registerRecordBookmarkRoutes(application, bindings.bookmarks);
  if (bindings.snapshots) registerRecordSnapshotRoutes(application, bindings.snapshots);
}
