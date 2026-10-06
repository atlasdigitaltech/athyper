import { describe, expect, it } from "vitest";
import {
  normalizedLayoutMembers,
  validateNormalizedLayoutRow,
} from "./normalized-layout-contract.js";
import { parseNormalizedLayoutGraph } from "./normalized-layout-validation.js";
import {
  layoutFixture,
  layoutFixtureContext,
  layoutFixtureRow,
} from "./normalized-layout.fixtures.js";
import { coreFixtureId } from "./normalized-core.fixtures.js";
const edit = (f: (g: any) => void) => {
  const g = layoutFixture();
  f(g);
  return g;
};
describe("normalized section and binding component contracts", () => {
  it("defines every section/binding property without layout blobs", () => {
    expect(Object.keys(normalizedLayoutMembers.section.columns)).toHaveLength(
      28,
    );
    expect(Object.keys(normalizedLayoutMembers.binding.columns)).toHaveLength(
      27,
    );
    for (const c of Object.values(normalizedLayoutMembers).flatMap((d) =>
      Object.values(d.columns),
    ))
      expect(c.sqlType).not.toBe("jsonb");
    expect(
      parseNormalizedLayoutGraph(layoutFixture(), layoutFixtureContext()),
    ).toEqual(layoutFixture());
    expect(() =>
      validateNormalizedLayoutRow("section", {
        ...layoutFixture().section[0],
        layoutConfig: {},
      }),
    ).toThrow();
    expect(() =>
      validateNormalizedLayoutRow(
        "binding",
        { overlayId: coreFixtureId(90) },
        true,
        true,
      ),
    ).toThrow();
  });
  it("requires explicit navigation without inferring it from section keys", () => {
    const g = edit((g) => (g.section[0].navigationGroupId = null));
    expect(
      parseNormalizedLayoutGraph(g, layoutFixtureContext("draft")),
    ).toEqual(g);
    expect(() => parseNormalizedLayoutGraph(g, layoutFixtureContext())).toThrow(
      "NORMALIZED_LAYOUT_INCOMPLETE",
    );
    expect(() =>
      parseNormalizedLayoutGraph(layoutFixture(), {
        ...layoutFixtureContext(),
        navigationGroups: [],
      }),
    ).toThrow("NORMALIZED_LAYOUT_NAVIGATION_INVALID");
  });
  it("rejects cross-surface and cyclic parent relationships", () => {
    expect(() =>
      parseNormalizedLayoutGraph(
        edit((g) => (g.section[0].parentSectionId = g.section[0].id)),
        layoutFixtureContext(),
      ),
    ).toThrow("NORMALIZED_LAYOUT_PARENT_CYCLE");
    expect(() =>
      parseNormalizedLayoutGraph(
        edit((g) => (g.section[0].entitySurfaceId = coreFixtureId(40))),
        layoutFixtureContext(),
      ),
    ).toThrow("NORMALIZED_LAYOUT_SECTION_SURFACE_INVALID");
    expect(() =>
      parseNormalizedLayoutGraph(
        edit((g) => (g.binding[0].entitySurfaceSectionId = coreFixtureId(999))),
        layoutFixtureContext(),
      ),
    ).toThrow("NORMALIZED_LAYOUT_BINDING_SECTION_INVALID");
  });
  it("enforces dense positions, scoped keys and grid width", () => {
    expect(() =>
      parseNormalizedLayoutGraph(
        edit((g) => (g.binding[0].position = 2)),
        layoutFixtureContext(),
      ),
    ).toThrow("NORMALIZED_LAYOUT_ORDER_INVALID");
    expect(() =>
      parseNormalizedLayoutGraph(
        edit((g) => (g.binding[0].position = 0)),
        layoutFixtureContext(),
      ),
    ).toThrow();
    expect(() =>
      parseNormalizedLayoutGraph(
        edit((g) => (g.binding[0].columnSpan = 3)),
        layoutFixtureContext(),
      ),
    ).toThrow("NORMALIZED_LAYOUT_GRID_SPAN_INVALID");
    expect(() =>
      parseNormalizedLayoutGraph(
        edit((g) =>
          g.section.push({
            ...g.section[0],
            id: coreFixtureId(65),
            position: 2,
          }),
        ),
        layoutFixtureContext(),
      ),
    ).toThrow("NORMALIZED_LAYOUT_KEY_CONFLICT");
  });
  it("rejects variant mixing, collapse inconsistency and mixed nested/direct fields", () => {
    expect(() =>
      parseNormalizedLayoutGraph(
        edit((g) => (g.section[0].targetViewKey = "default")),
        layoutFixtureContext(),
      ),
    ).toThrow("NORMALIZED_LAYOUT_VARIANT_INVALID");
    expect(() =>
      parseNormalizedLayoutGraph(
        edit((g) => (g.section[0].collapsedByDefault = true)),
        layoutFixtureContext(),
      ),
    ).toThrow("NORMALIZED_LAYOUT_COLLAPSE_INVALID");
    expect(() =>
      parseNormalizedLayoutGraph(
        edit((g) =>
          g.section.push({
            ...g.section[0],
            id: coreFixtureId(65),
            sectionKey: "child",
            parentSectionId: g.section[0].id,
          }),
        ),
        layoutFixtureContext(),
      ),
    ).toThrow("NORMALIZED_LAYOUT_MIXED_CHILDREN");
  });
  it("rejects owner XOR violations and unqualified tenant overlays", () => {
    expect(() =>
      parseNormalizedLayoutGraph(
        edit((g) => (g.binding[0].overlayId = coreFixtureId(90))),
        layoutFixtureContext(),
      ),
    ).toThrow("NORMALIZED_LAYOUT_OWNER_XOR_INVALID");
    expect(() =>
      parseNormalizedLayoutGraph(
        edit((g) => {
          g.binding[0].entitySurfaceId = null;
          g.binding[0].entitySurfaceSectionId = null;
          g.binding[0].overlayId = coreFixtureId(90);
        }),
        layoutFixtureContext(),
      ),
    ).toThrow("NORMALIZED_LAYOUT_OVERLAY_UNAVAILABLE");
  });
  it("requires eligible fields and registered component options", () => {
    for (const change of [
      (g: any) => (g.binding[0].entityFieldId = coreFixtureId(1)),
      (g: any) => (g.binding[0].componentDisplayId = coreFixtureId(999)),
      (g: any) => (g.binding[0].dateStyle = "short"),
      (g: any) => (g.binding[0].fractionDigits = 2),
      (g: any) => (g.binding[0].referenceLoadMode = "lazy"),
      (g: any) => (g.binding[0].meaningfulForForm = true),
    ])
      expect(() =>
        parseNormalizedLayoutGraph(edit(change), layoutFixtureContext()),
      ).toThrow();
    const c = layoutFixtureContext();
    expect(() =>
      parseNormalizedLayoutGraph(layoutFixture(), {
        ...c,
        fieldPresentation: [],
      }),
    ).toThrow("NORMALIZED_LAYOUT_FIELD_PRESENTATION_UNAVAILABLE");
    expect(() =>
      parseNormalizedLayoutGraph(layoutFixture(), {
        ...c,
        fieldPresentation: c.fieldPresentation.map((f) => ({
          ...f,
          display: "masked",
        })),
      }),
    ).toThrow("NORMALIZED_LAYOUT_MASKED_PRESENTATION_UNAVAILABLE");
  });
  it("keeps filter permission and allowed operators independent of placement", () => {
    const c = layoutFixtureContext(),
      filter = {
        ...c.components[0]!,
        id: coreFixtureId(81),
        level: "field_filter" as const,
        filterOperators: ["eq", "contains"],
      };
    const g = edit((g) => {
      g.binding[0].componentFilterId = filter.id;
      g.binding[0].filterOperators = ["eq"];
      g.binding[0].defaultFilterOperator = "eq";
    });
    expect(
      parseNormalizedLayoutGraph(g, {
        ...c,
        components: [...c.components, filter],
      }),
    ).toEqual(g);
    expect(() =>
      parseNormalizedLayoutGraph(g, {
        ...c,
        components: [...c.components, filter],
        fieldPresentation: c.fieldPresentation.map((f) => ({
          ...f,
          queryUses: [],
        })),
      }),
    ).toThrow("NORMALIZED_LAYOUT_FILTER_UNAVAILABLE");
    expect(() =>
      parseNormalizedLayoutGraph(
        edit((g) => (g.binding[0].filterOperators = ["eq"])),
        c,
      ),
    ).toThrow("NORMALIZED_LAYOUT_VARIANT_INVALID");
  });
  it("requires exact related target, surface, view and operation evidence", () => {
    const c = layoutFixtureContext(),
      id = coreFixtureId(90);
    const g = edit((g) => {
      g.binding = [];
      Object.assign(g.section[0], {
        contentKind: "related_list",
        relationTargetId: id,
        targetSurfaceKey: "embedded",
        targetViewKey: "default",
        readOperationKey: "list",
        presentationCardinality: "many",
        emptyCreationMode: "unavailable",
      });
    });
    const related = {
      id,
      cardinalities: ["many"],
      surfaces: [
        {
          key: "embedded",
          kind: "embedded" as const,
          mode: "collection" as const,
          viewKeys: ["default"],
        },
      ],
      readOperationKeys: ["list"],
      createOperationKeys: [],
    };
    expect(() => parseNormalizedLayoutGraph(g, c)).toThrow(
      "NORMALIZED_LAYOUT_RELATED_TARGET_UNAVAILABLE",
    );
    expect(
      parseNormalizedLayoutGraph(g, { ...c, relatedTargets: [related] }),
    ).toEqual(g);
    expect(() =>
      parseNormalizedLayoutGraph(g, {
        ...c,
        relatedTargets: [{ ...related, readOperationKeys: [] }],
      }),
    ).toThrow("NORMALIZED_LAYOUT_RELATED_OPERATION_UNAVAILABLE");
    const setup = structuredClone(g) as any;
    setup.section[0].emptyCreationMode = "setup_operation";
    expect(() =>
      parseNormalizedLayoutGraph(setup, { ...c, relatedTargets: [related] }),
    ).toThrow("NORMALIZED_LAYOUT_INCOMPLETE");
  });
});
