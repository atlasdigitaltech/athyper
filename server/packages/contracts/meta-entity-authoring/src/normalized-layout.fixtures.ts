/** Synthetic saved-layout fixtures. No host, storage or authorization evidence. */
import {
  coreFixture,
  coreFixtureContext,
  coreFixtureId,
  coreFixtureRow,
} from "./normalized-core.fixtures.js";
import {
  normalizedLayoutMembers,
  type NormalizedLayoutGraph,
  type NormalizedLayoutKind,
  type NormalizedLayoutRow,
} from "./normalized-layout-contract.js";
import type { NormalizedLayoutContext } from "./normalized-layout-validation.js";
export function layoutFixtureRow<K extends NormalizedLayoutKind>(
  kind: K,
  id: string,
  values: Readonly<Record<string, unknown>>,
): NormalizedLayoutRow<K> {
  return {
    id,
    ...Object.fromEntries(
      Object.keys(normalizedLayoutMembers[kind].columns).map((key) => [
        key,
        null,
      ]),
    ),
    ...values,
  } as NormalizedLayoutRow<K>;
}
export function layoutFixture(): NormalizedLayoutGraph {
  return {
    section: [
      layoutFixtureRow("section", coreFixtureId(60), {
        entitySurfaceId: coreFixtureId(41),
        navigationGroupId: coreFixtureId(70),
        sectionKey: "details",
        labelId: coreFixtureId(32),
        sectionKind: "section",
        contentKind: "fields",
        position: 1,
        columnCount: 2,
        collapsible: false,
        collapsedByDefault: false,
        placement: "direct",
      }),
    ],
    binding: [
      layoutFixtureRow("binding", coreFixtureId(61), {
        entitySurfaceId: coreFixtureId(41),
        entitySurfaceSectionId: coreFixtureId(60),
        entityFieldId: coreFixtureId(2),
        bindingKey: "code",
        bindingKind: "field",
        position: 1,
        componentDisplayId: coreFixtureId(80),
        columnSpan: 1,
        meaningfulForForm: false,
      }),
    ],
  };
}
export function layoutFixtureContext(
  phase: "draft" | "qualification" = "qualification",
): NormalizedLayoutContext {
  const initial = coreFixture();
  const detail = coreFixtureRow("surface", coreFixtureId(41), {
    surfaceKey: "detail",
    surfaceKind: "detail",
    labelId: coreFixtureId(32),
    layoutKind: "grid",
    isDefault: true,
    titleFieldId: coreFixtureId(3),
    codeFieldId: coreFixtureId(2),
    columnCount: 2,
    showGroupBand: false,
    componentContractId: coreFixtureId(50),
  });
  return {
    core: { ...initial, surface: [...initial.surface, detail] },
    coreContext: coreFixtureContext(phase),
    maxMembers: 100,
    navigationGroups: [
      { id: coreFixtureId(70), entitySurfaceId: detail.id, position: 1 },
    ],
    overlays: [],
    capabilityLayouts: [],
    relatedTargets: [],
    components: [
      {
        id: coreFixtureId(80),
        level: "field_display",
        surfaceKinds: ["detail", "form", "list", "embedded", "lookup"],
        dataTypes: ["string", "text"],
        cardinalities: ["one"],
        options: ["textWrap", "emptyTextLabelId"],
        filterOperators: [],
        compatibleDisplayIds: [],
        maskedRepresentationSafe: false,
      },
    ],
    fieldPresentation: initial.field.map((f) => ({
      fieldId: f.id,
      display: "plain",
      queryUses: ["filter"],
      filterOperators: ["eq", "contains"],
      inputSurfaceIds: [],
      referenceSurfaceKeys: [],
      referenceLoadModes: [],
    })),
  };
}
