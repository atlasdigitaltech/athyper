import { GENERIC_RECORD_READ_CAPABILITIES } from "@athyper/server-service-records";
import type { ExpandedNativeMetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  compileNativeListSettings,
  sha256,
  type NativeListSettingsContext,
} from "@athyper/server-plane-studio-meta-entity-authoring";

/** Bind compiler limits to the implementation composed by the shared record
 * host. Neither proposal input nor an external compiler context supplies these
 * limits. Deployment, storage-owner and effective-security checks remain separate.
 */
export function resolveNativeBootstrapListProviders(
  graph: ExpandedNativeMetaEntityGraph,
): readonly NativeListSettingsContext[] {
  const implementation = GENERIC_RECORD_READ_CAPABILITIES;
  const runtime = graph.runtimeProfiles;
  if (
    runtime.length !== 1 ||
    runtime[0]!.readMode !== implementation.readMode ||
    runtime[0]!.backingKind !== "table" ||
    runtime[0]!.writeMode !== "none" ||
    runtime[0]!.readHandlerKey !== null ||
    runtime[0]!.readHandlerVersion !== null ||
    runtime[0]!.writeHandlerKey !== null ||
    runtime[0]!.writeHandlerVersion !== null
  )
    throw Error("PRODUCT_NATIVE_RECORD_PROVIDER_UNSUPPORTED");
  const surfaces = graph.surfaces.filter((s) => s.surfaceKind === "list");
  if (
    !surfaces.length ||
    new Set(surfaces.map((s) => s.id)).size !== surfaces.length
  )
    throw Error("PRODUCT_NATIVE_LIST_PROVIDER_SCOPE_INVALID");
  return surfaces.map((surface) => {
    const context: NativeListSettingsContext = {
      surfaceId: surface.id,
      provider: {
        owner: implementation.owner,
        key: implementation.key,
        version: implementation.version,
        hash: sha256(implementation),
      },
      modes: implementation.modes,
      countModes: implementation.countModes,
      maximumPageSize: implementation.maximumPageSize,
      maximumPageSizeChoices: implementation.maximumPageSizeChoices,
      maximumSortLevels: implementation.maximumSortLevels,
      maximumFilters: implementation.maximumFilters,
      maximumFilterDepth: implementation.maximumFilterDepth,
    };
    // Reject unsupported settings here instead of normalizing them silently at runtime.
    compileNativeListSettings(surface, context);
    return context;
  });
}
