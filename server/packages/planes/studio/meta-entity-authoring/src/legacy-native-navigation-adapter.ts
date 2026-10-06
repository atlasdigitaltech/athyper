import {
  FoundationContractError,
  type MetaEntityGraph,
  type NormalizedLayoutRow,
} from "@athyper/server-contract-meta-entity-authoring";
import type { EntityDetailNavigationV1 } from "@athyper/contract-platform-entity-runtime";
import {
  compileNativeDetailNavigation,
  convertLegacyDetailNavigation,
  type NativeNavigationContext,
} from "./native-detail-navigation.js";
import type {
  NativeConversionResource,
  NativeNestedConversionAdapter,
} from "./native-graph-conversion.js";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
export interface LegacyNativeNavigationAdapterInput {
  readonly source: MetaEntityGraph;
  readonly sourceHash: string;
  readonly resource: NativeConversionResource;
  readonly labelResource: NativeConversionResource;
  readonly mappings: Readonly<
    Record<
      string,
      {
        readonly context: NativeNavigationContext;
        readonly sections: readonly NormalizedLayoutRow<"section">[];
        readonly groups: Readonly<
          Record<string, { readonly id: string; readonly labelId: string }>
        >;
      }
    >
  >;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
/** Production mapping for the recordPresentation.navigation path. Other
 * presentation paths remain for their own typed mappings and reject if unhandled.
 * Only presence/identity/resource metadata is retained for inverse conversion. */
export function createLegacyNativeNavigationAdapter(
  input: LegacyNativeNavigationAdapterInput,
): NativeNestedConversionAdapter {
  validateConversionJsonData(input.source, "/source");
  const sourceHash = input.sourceHash;
  if (sha256(input.source) !== sourceHash)
    fail("NATIVE_NAVIGATION_SOURCE_HASH_MISMATCH", "/source");
  const surfaces = input.source.surfaces ?? [];
  const enrolled = surfaces
    .filter(
      (s) =>
        s.layoutConfig?.recordPresentation &&
        Object.hasOwn(
          s.layoutConfig.recordPresentation as object,
          "navigation",
        ),
    )
    .map((s) => s.id!)
    .sort();
  if (
    Object.keys(input.mappings).sort().join() !== enrolled.join() ||
    new Set(enrolled).size !== enrolled.length ||
    !enrolled.length
  )
    fail("NATIVE_NAVIGATION_MAPPING_INVALID", "/mappings");
  const mappings = new Map(
    Object.entries(input.mappings).map(([id, m]) => {
      if (id !== m.context.surface.id)
        fail("NATIVE_NAVIGATION_SECTION_INVALID", "/mappings");
      return [
        id,
        {
          context: {
            ...m.context,
            surface: structuredClone(m.context.surface),
          },
          sections: structuredClone(m.sections),
          groups: structuredClone(m.groups),
        },
      ] as const;
    }),
  );
  const mappedGroupIds = new Set(
    [...mappings.values()].flatMap((m) =>
      Object.values(m.groups).map((g) => g.id),
    ),
  );
  if (
    mappedGroupIds.size !==
    [...mappings.values()].reduce((n, m) => n + Object.keys(m.groups).length, 0)
  )
    fail("NATIVE_NAVIGATION_IDENTITY_INVALID", "/mappings/groups");
  const preexistingGroupIds = new Set(
    input.source.referenceMembers?.members.navigationGroup.map((g) => g.id) ??
      [],
  );
  const resource = structuredClone(input.resource),
    labelResource = structuredClone(input.labelResource);
  const forward = (graph: MetaEntityGraph) => {
    validateConversionJsonData(graph, "/source");
    if (sha256(graph) !== sourceHash)
      fail("NATIVE_NAVIGATION_SOURCE_HASH_MISMATCH", "/source");
    if (!graph.referenceMembers)
      return fail("NATIVE_NAVIGATION_REFERENCE_MEMBERS_REQUIRED", "/source");
    const result = structuredClone(graph);
    const members = result.referenceMembers!.members;
    for (const surface of result.surfaces!) {
      const mapping = mappings.get(surface.id!);
      if (!mapping) continue;
      const config = { ...surface.layoutConfig! };
      const record = {
        ...(config.recordPresentation as Record<string, unknown>),
      };
      const declaration = record.navigation as EntityDetailNavigationV1;
      const converted = convertLegacyDetailNavigation(
        declaration,
        mapping.sections,
        mapping.context,
        { sourceHash: sha256(declaration), groups: mapping.groups },
      );
      // Membership/order must agree with the admitted scalar section mapping.
      // Conflicting repeated declarations are not silently resolved by priority.
      if (canonicalJson(converted.sections) !== canonicalJson(mapping.sections))
        fail(
          "NATIVE_NAVIGATION_SECTION_PRESENTATION_CONFLICT",
          "/surfaceSections",
        );
      const additions = converted.groups.filter((group) => {
        const existing = members.navigationGroup.filter(
          (g) => g.id === group.id,
        );
        if (
          existing.length > 1 ||
          (existing.length === 1 &&
            canonicalJson(existing[0]) !== canonicalJson(group))
        )
          fail(
            "NATIVE_NAVIGATION_SECTION_PRESENTATION_CONFLICT",
            "/referenceMembers/navigationGroup",
          );
        return existing.length === 0;
      });
      (members as { navigationGroup: unknown }).navigationGroup = [
        ...members.navigationGroup,
        ...additions,
      ];
      delete record.navigation;
      if (Object.keys(record).length) config.recordPresentation = record;
      else delete config.recordPresentation;
      (surface as { layoutConfig?: unknown }).layoutConfig = Object.keys(config)
        .length
        ? config
        : undefined;
      if (!Object.keys(config).length)
        delete (surface as { layoutConfig?: unknown }).layoutConfig;
    }
    return result;
  };
  // Validate the selected paths immediately; source values are not used by reverse.
  forward(input.source);
  return {
    resource,
    dependencies: [labelResource],
    forward,
    reverse(prepared, target) {
      const result = structuredClone(prepared);
      if (!target.referenceMembers || !result.referenceMembers)
        return fail("NATIVE_NAVIGATION_REFERENCE_MEMBERS_REQUIRED", "/target");
      for (const [id, mapping] of mappings) {
        const surface = result.surfaces!.find((s) => s.id === id);
        const nativeSurface = target.surfaces.find((s) => s.id === id);
        if (!surface || !nativeSurface)
          return fail("NATIVE_NAVIGATION_SECTION_INVALID", "/target");
        const ids = new Set(Object.values(mapping.groups).map((g) => g.id));
        const groups = target.referenceMembers.members.navigationGroup.filter(
          (g) => ids.has(g.id),
        );
        if (groups.length !== ids.size)
          fail("NATIVE_NAVIGATION_MAPPING_INVALID", "/target/groups");
        const navigation = compileNativeDetailNavigation(
          {
            groups,
            sections: target.surfaceSections.filter(
              (s) => s.entitySurfaceId === id,
            ),
          },
          { ...mapping.context, surface: nativeSurface },
        );
        const config = { ...surface.layoutConfig };
        const record = {
          ...(config.recordPresentation as Record<string, unknown> | undefined),
          navigation,
        };
        (surface as { layoutConfig?: unknown }).layoutConfig = {
          ...config,
          recordPresentation: record,
        };
      }
      (
        result.referenceMembers.members as { navigationGroup: unknown }
      ).navigationGroup =
        result.referenceMembers.members.navigationGroup.filter(
          (g) => !mappedGroupIds.has(g.id) || preexistingGroupIds.has(g.id),
        );
      return result;
    },
  };
}
