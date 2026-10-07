import { validateNativeSnapshotReferences } from "./native-snapshot-validation.js";
import {
  FoundationContractError,
  type MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import { canonicalJson, sha256 } from "./deterministic.js";
import {
  createLegacyNativeCoreAdapters,
  type LegacyNativeCoreAdapterInput,
} from "./legacy-native-core-adapters.js";
import {
  createLegacyNativeLayoutAdapters,
  type LegacyNativeLayoutAdapterInput,
} from "./legacy-native-layout-adapters.js";
import { createLegacyNativeResourcesAdapter } from "./legacy-native-resources-adapter.js";
import { createLegacyNativePresentationLocalizationAdapter } from "./native-presentation-localization.js";
import { createLegacyNativeFieldChoicesAdapter } from "./native-field-choices.js";
import { createLegacyNativeDetailBadgesAdapter } from "./native-detail-badges.js";
import { createLegacyNativeFieldSemanticsAdapter } from "./native-field-semantics.js";
import { createLegacyNativeDetailSectionsAdapter } from "./native-detail-sections.js";
import { createLegacyNativeNavigationAdapter } from "./legacy-native-navigation-adapter.js";
import { createLegacyNativeListViewAdapter } from "./native-list-view.js";
import { createLegacyNativeReferenceRelationsAdapter } from "./native-reference-relations.js";
import { createLegacyNativeReferenceCapabilityAdapter } from "./native-reference-capability.js";
import {
  composeNativeNestedConversionAdapters,
  type NativeConversionResource,
  type NativeNestedConversionAdapter,
} from "./native-graph-conversion.js";
import {
  prepareExpandedNativeGraphConversion,
  type NativeExpandedConversionContext,
} from "./native-expanded-conversion.js";

import { createNativeConversionApplicationPolicy } from "./native-conversion-composition.js";

const factories = {
  localization: createLegacyNativePresentationLocalizationAdapter,
  choices: createLegacyNativeFieldChoicesAdapter,
  badges: createLegacyNativeDetailBadgesAdapter,
  semantics: createLegacyNativeFieldSemanticsAdapter,
  sections: createLegacyNativeDetailSectionsAdapter,
  navigation: createLegacyNativeNavigationAdapter,
  view: createLegacyNativeListViewAdapter,
  relations: createLegacyNativeReferenceRelationsAdapter,
  capability: createLegacyNativeReferenceCapabilityAdapter,
} as const;
type Kind = keyof typeof factories;
type StageInput<K extends Kind> = Omit<
  Parameters<(typeof factories)[K]>[0],
  "source" | "sourceHash"
>;
export type LegacyNativeWholeSourceStage = {
  [K in Kind]: {
    readonly kind: K;
    resolve(source: MetaEntityGraph): StageInput<K>;
  };
}[Kind];
/** Installed host composition only. Each resolver provides independently admitted
 * identities and resources for the exact intermediate source. No endpoint accepts
 * this object; no resource/ownership/catalogue authorization is inferred here. */
export interface LegacyNativeWholeSourceInput {
  /** Host budget for the combined snapshot, distinct from supplemental rows. */
  readonly maximumSnapshotMembers: number;
  readonly source: MetaEntityGraph;
  readonly context: NativeExpandedConversionContext;
  readonly resource: NativeConversionResource;
  readonly supplemental: Omit<
    Parameters<typeof createLegacyNativeResourcesAdapter>[0],
    "source" | "sourceHash"
  >;
  readonly stages: readonly LegacyNativeWholeSourceStage[];
  core(
    prepared: MetaEntityGraph,
  ): Omit<LegacyNativeCoreAdapterInput, "fields" | "runtimeProfiles">;
  layout(
    prepared: MetaEntityGraph,
  ): Omit<
    LegacyNativeLayoutAdapterInput,
    "surfaces" | "surfaceSections" | "surfaceFieldBindings"
  >;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
/** Constructs only production adapters over one source and proves the complete
 * inverse before returning an installable conversion bundle. Stages are ordered
 * explicitly by the host; this is not entity dispatch or inferred presentation.
 * The existing expanded coordinator remains the authority for graph preservation. */
export function resolveLegacyNativeWholeSource(
  input: LegacyNativeWholeSourceInput,
) {
  validateConversionJsonData(input.source, "/source");
  if (
    !Number.isSafeInteger(input.context.maximumBytes) ||
    input.context.maximumBytes < 1 ||
    Buffer.byteLength(canonicalJson(input.source)) > input.context.maximumBytes
  )
    fail("NATIVE_CONVERSION_LIMIT", "/source");
  if (
    !Array.isArray(input.stages) ||
    input.stages.length > Object.keys(factories).length ||
    new Set(input.stages.map((stage) => stage.kind)).size !==
      input.stages.length ||
    input.stages.some((stage) => !Object.hasOwn(factories, stage.kind))
  )
    fail("NATIVE_WHOLE_SOURCE_STAGE_INVALID", "/stages");
  const source = structuredClone(input.source);
  if (sha256(source) !== input.context.source.graphHash)
    fail("NATIVE_CONVERSION_SOURCE_HASH_MISMATCH", "/source");
  const installed = (r: NativeConversionResource) => {
    if (
      input.context.installedAdapters.filter(
        (i) => canonicalJson(i) === canonicalJson(r),
      ).length !== 1
    )
      fail("NATIVE_CONVERSION_ADAPTER_NOT_INSTALLED", "/resources");
  };
  installed(input.resource);
  input.context.validateRetained(structuredClone(source));
  installed(input.supplemental.resource);
  for (const r of input.supplemental.dependencies) installed(r);
  const supplemental = createLegacyNativeResourcesAdapter({
    ...input.supplemental,
    source,
    sourceHash: sha256(source),
  });
  let prepared = supplemental.forward(source).prepared;
  const steps: NativeNestedConversionAdapter[] = [];
  for (const stage of input.stages) {
    // The discriminated stage resolver is an installed composition port, never
    // authored code. Reattach the exact graph/hash after resolving its data.
    const data = stage.resolve(structuredClone(prepared));
    installed(data.resource);
    const factory = factories[stage.kind] as (
      v: unknown,
    ) => NativeNestedConversionAdapter;
    const adapter = factory({
      ...data,
      source: prepared,
      sourceHash: sha256(prepared),
    });
    for (const r of adapter.dependencies ?? []) installed(r);
    prepared = adapter.forward(prepared);
    steps.push(adapter);
  }
  const core = createLegacyNativeCoreAdapters({
    ...input.core(structuredClone(prepared)),
    fields: prepared.fields,
    runtimeProfiles: prepared.runtimeProfiles!,
  });
  const layout = createLegacyNativeLayoutAdapters({
    ...input.layout(structuredClone(prepared)),
    surfaces: prepared.surfaces!,
    surfaceSections: prepared.surfaceSections!,
    surfaceFieldBindings: prepared.surfaceFieldBindings!,
  });
  const adapters = { ...core, ...layout };
  const nested = steps.length
    ? composeNativeNestedConversionAdapters(input.resource, steps)
    : undefined;
  // Returns no partial bundle on failure. All original paths must reconstruct
  // from the final typed candidate, through the same five scalar implementations.
  const proof = prepareExpandedNativeGraphConversion(
    source,
    input.context,
    adapters,
    nested,
    supplemental,
  );
  validateNativeSnapshotReferences(
    proof.candidate,
    input.context.source,
    input.maximumSnapshotMembers,
  );
  return { context: input.context, adapters, nested, supplemental, proof };
}

/** Uses the existing repository application policy; never installs a default
 * writer, host, reviewer or storage grant. Authority and reader ports stay with
 * the owning host composition, independently of this conversion resolver. */
export function createLegacyNativeWholeSourceApplicationPolicy(
  composition: Omit<
    import("./native-conversion-composition.js").NativeConversionComposition,
    "conversion"
  > & {
    conversion(
      tx: import("kysely").Transaction<Record<string, never>>,
      input: import("./native-conversion-application.js").NativeConversionApplicationInput,
      source: MetaEntityGraph,
    ): Promise<Omit<LegacyNativeWholeSourceInput, "source">>;
  },
) {
  return createNativeConversionApplicationPolicy({
    ...composition,
    async conversion(tx, input, source) {
      const resolved = await composition.conversion(
        tx,
        input,
        structuredClone(source),
      );
      return resolveLegacyNativeWholeSource({ ...resolved, source });
    },
  });
}
