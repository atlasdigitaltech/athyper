import type { MetaEntityGraph } from "./model.js";
import type { NormalizedCoreGraph } from "./normalized-core-contract.js";
import type { NormalizedLayoutGraph } from "./normalized-layout-contract.js";
/** Versioned canonical authoring snapshot. Other existing scalar/member branches
 * remain in their current typed contracts and are immutable to this command API.
 * No legacy type/layout blobs coexist with the five normalized families. */
export type NativeMetaEntityGraph = Omit<
  MetaEntityGraph,
  | "contractSchema"
  | "fields"
  | "runtimeProfiles"
  | "surfaces"
  | "surfaceSections"
  | "surfaceFieldBindings"
> & {
  readonly contractSchema: "athyper.meta-entity-contract/2.4";
  readonly authoringSource: {
    readonly entityId: string;
    readonly tenantId: string | null;
    readonly sourceKind: "product" | "tenant_entity";
    readonly authoringSchemaHash: string;
  };
  readonly fields: NormalizedCoreGraph["field"];
  readonly runtimeProfiles: NormalizedCoreGraph["runtime"];
  readonly surfaces: NormalizedCoreGraph["surface"];
  readonly surfaceSections: NormalizedLayoutGraph["section"];
  readonly surfaceFieldBindings: NormalizedLayoutGraph["binding"];
};

/** Expanded source version: operation and AI rows cannot be decoded by the 2.4
 * repository. Protected controls remain stored/service-owned, outside commands. */
export type ExpandedNativeMetaEntityGraph = Omit<
  NativeMetaEntityGraph,
  "contractSchema" | "operations"
> & {
  readonly contractSchema: "athyper.meta-entity-contract/2.5";
  readonly operations: readonly import("./native-operation-contract.js").NativeOperationRow[];
  readonly ai: import("./native-ai-contract.js").NativeAiGraph;
};
export type NativeAuthoringSnapshot =
  NativeMetaEntityGraph | ExpandedNativeMetaEntityGraph;
