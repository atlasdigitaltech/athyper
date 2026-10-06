import {
  FoundationContractError,
  referenceUuid,
  validateFoundationNode,
  validateNormalizedCoreRow,
  validateNormalizedLayoutRow,
  validateReferenceMember,
  type NormalizedCoreRow,
  type NormalizedLayoutRow,
  type ReferenceMember,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  parseEntityDetailNavigation,
  type EntityDetailNavigationV1,
} from "@athyper/contract-platform-entity-runtime";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";

export interface NativeDetailNavigation {
  readonly groups: readonly ReferenceMember<"navigationGroup">[];
  readonly sections: readonly NormalizedLayoutRow<"section">[];
}
/** Installed, independently admitted label projection and surface, not an
 * author-supplied authorization or a captured copy of legacy label values. */
export interface NativeNavigationContext {
  readonly surface: NormalizedCoreRow<"surface">;
  readonly maximumSections: number;
  label(
    id: string,
  ): Pick<
    NonNullable<EntityDetailNavigationV1["tabs"]>[number],
    "label" | "localizedLabel"
  >;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
function context(c: NativeNavigationContext) {
  validateNormalizedCoreRow("surface", c.surface);
  if (
    c.surface.surfaceKind !== "detail" ||
    !Number.isSafeInteger(c.maximumSections) ||
    c.maximumSections < 1
  )
    fail("NATIVE_NAVIGATION_CONTEXT_INVALID", "/context");
}
/** The compatibility projection supports homogeneous continuous/selected
 * groups. Mixed behavior needs the newer runtime contract; it is never coerced. */
export function compileNativeDetailNavigation(
  input: NativeDetailNavigation,
  c: NativeNavigationContext,
): EntityDetailNavigationV1 {
  context(c);
  validateConversionJsonData(input, "/navigation");
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).sort().join() !== "groups,sections" ||
    !Array.isArray(input.groups) ||
    !Array.isArray(input.sections) ||
    !input.groups.length ||
    input.groups.length > 12 ||
    !input.sections.length ||
    input.sections.length > c.maximumSections
  )
    return fail("NATIVE_NAVIGATION_INPUT_INVALID", "/navigation");
  const ids = new Set<string>();
  const unique = (id: string, path: string) => {
    validateFoundationNode(referenceUuid, id, path);
    if (ids.has(id)) fail("NATIVE_NAVIGATION_IDENTITY_INVALID", path);
    ids.add(id);
  };
  const groups = [...input.groups].sort((a, b) => a.position - b.position);
  const keys = new Set<string>();
  for (const [i, row] of groups.entries()) {
    const { id, ...payload } = row;
    unique(id, "/groups");
    validateReferenceMember("navigationGroup", payload);
    if (
      row.entitySurfaceId !== c.surface.id ||
      row.labelId === null ||
      row.sectionDisplay === null ||
      row.position !== i + 1 ||
      keys.has(row.groupKey)
    )
      fail("NATIVE_NAVIGATION_GROUP_INVALID", "/groups");
    keys.add(row.groupKey);
  }
  if (new Set(groups.map((g) => g.sectionDisplay)).size !== 1)
    fail("NATIVE_NAVIGATION_MIXED_BEHAVIOR_UNSUPPORTED", "/groups");
  const sectionKeys = new Set<string>();
  for (const row of input.sections) {
    validateNormalizedLayoutRow("section", row);
    unique(row.id, "/sections");
    if (
      row.entitySurfaceId !== c.surface.id ||
      row.parentSectionId !== null ||
      !groups.some((g) => g.id === row.navigationGroupId) ||
      sectionKeys.has(row.sectionKey)
    )
      fail("NATIVE_NAVIGATION_SECTION_INVALID", "/sections");
    sectionKeys.add(row.sectionKey);
  }
  const result: EntityDetailNavigationV1 = {
    mode: groups[0]!.sectionDisplay === "continuous" ? "scroll" : "switch",
    tabs: groups.map((g) => {
      const sections = input.sections
        .filter((s) => s.navigationGroupId === g.id)
        .sort((a, b) => a.position - b.position);
      if (!sections.length || sections.some((s, i) => s.position !== i + 1))
        fail("NATIVE_NAVIGATION_ORDER_INVALID", "/sections");
      const label = c.label(g.labelId!);
      return {
        key: g.groupKey,
        ...label,
        ...(g.iconKey === null ? {} : { iconKey: g.iconKey }),
        sectionKeys: sections.map((s) => s.sectionKey),
      };
    }),
  };
  const parsed = parseEntityDetailNavigation(result, [...sectionKeys]);
  if (canonicalJson(parsed) !== canonicalJson(result))
    fail("NATIVE_NAVIGATION_LABEL_PROJECTION_INVALID", "/groups/label");
  return result;
}

/** Converts only explicit navigation. It never interprets a section named
 * overview, a legacy layout group or the absence of tabs as navigation. */
export function convertLegacyDetailNavigation(
  source: EntityDetailNavigationV1,
  sections: readonly NormalizedLayoutRow<"section">[],
  c: NativeNavigationContext,
  mapping: {
    readonly sourceHash: string;
    readonly groups: Readonly<
      Record<string, { readonly id: string; readonly labelId: string }>
    >;
  },
): NativeDetailNavigation {
  context(c);
  validateConversionJsonData(source, "/source");
  validateConversionJsonData(mapping, "/mapping");
  if (
    !mapping ||
    typeof mapping !== "object" ||
    Object.keys(mapping).sort().join() !== "groups,sourceHash" ||
    !mapping.groups ||
    typeof mapping.groups !== "object" ||
    Array.isArray(mapping.groups)
  )
    fail("NATIVE_NAVIGATION_MAPPING_INVALID", "/mapping");
  for (const row of Object.values(mapping.groups))
    validateFoundationNode(
      {
        type: "object",
        properties: { id: referenceUuid, labelId: referenceUuid },
      },
      row,
      "/mapping/groups",
    );
  const parsed = parseEntityDetailNavigation(
    source,
    sections.map((s) => s.sectionKey),
  );
  if (canonicalJson(parsed) !== canonicalJson(source))
    fail("NATIVE_NAVIGATION_SOURCE_NOT_CANONICAL", "/source");
  if (!source.tabs?.length)
    return fail("NATIVE_NAVIGATION_GROUPS_REQUIRED", "/source/tabs");
  if (sha256(source) !== mapping.sourceHash)
    fail("NATIVE_NAVIGATION_SOURCE_HASH_MISMATCH", "/source");
  if (
    Object.keys(mapping.groups).sort().join() !==
    source.tabs
      .map((t) => t.key)
      .sort()
      .join()
  )
    fail("NATIVE_NAVIGATION_MAPPING_INVALID", "/mapping/groups");
  const assignments = new Map<string, { groupId: string; position: number }>();
  const groups = source.tabs.map(
    (tab, i): ReferenceMember<"navigationGroup"> => {
      const target = mapping.groups[tab.key]!;
      for (const [index, key] of tab.sectionKeys.entries())
        assignments.set(key, { groupId: target.id, position: index + 1 });
      return {
        id: target.id,
        entitySurfaceId: c.surface.id,
        groupKey: tab.key,
        labelId: target.labelId,
        iconKey: tab.iconKey ?? null,
        sectionDisplay: source.mode === "scroll" ? "continuous" : "selected",
        position: i + 1,
      };
    },
  );
  const result: NativeDetailNavigation = {
    groups,
    sections: sections.map((row) => {
      const assignment = assignments.get(row.sectionKey);
      if (!assignment)
        return fail("NATIVE_NAVIGATION_SECTION_INVALID", "/sections");
      return {
        ...row,
        navigationGroupId: assignment.groupId,
        position: assignment.position,
      };
    }),
  };
  if (
    canonicalJson(compileNativeDetailNavigation(result, c)) !==
    canonicalJson(source)
  )
    fail("NATIVE_NAVIGATION_NOT_LOSSLESS", "/source");
  return result;
}
