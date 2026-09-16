import { expect, it } from "vitest";
import { compileEntityIntakeSurfaces } from "@athyper/contract-platform-entity-runtime";
import { removalDependencies, structuralEdit } from "./composition-structure";
const fresh = "00000000-0000-4000-8000-000000000001";
import { graph } from "./composition-structure.fixture";
it("orders by explicit position, compiles the result and preserves identities and unrelated data", () => {
  const next = structuralEdit(graph, {
    kind: "reorder",
    collection: "surfaceSections",
    id: "section-last",
    direction: -1,
  });
  expect(
    compileEntityIntakeSurfaces(next)[0]?.sections.map((s) => s.key),
  ).toEqual(["last", "first"]);
  expect(next.fields).toBe(graph.fields);
  expect(next.unknown).toBe(graph.unknown);
  expect(graph.surfaceSections[0]?.position).toBe(0);
});
it("adds a field placement, splits and merges sections, then removes only the optional placement", () => {
  const placed = structuralEdit(graph, {
    kind: "placement",
    sectionId: "section-main",
    templateId: "placement-mode",
    id: "00000000-0000-4000-8000-000000000002",
  });
  const section = structuralEdit(placed, {
    kind: "section",
    surfaceId: "surface-main",
    id: fresh,
    key: "additional",
    title: "Additional",
    placementId: "00000000-0000-4000-8000-000000000002",
  });
  const merged = structuralEdit(section, {
    kind: "remove",
    collection: "surfaceSections",
    id: fresh,
    destinationSectionId: "section-main",
  });
  const removed = structuralEdit(merged, {
    kind: "remove",
    collection: "surfaceFieldBindings",
    id: "00000000-0000-4000-8000-000000000002",
  });
  expect(removed.fields).toBe(graph.fields);
  expect(removed.surfaceFieldBindings).toEqual(graph.surfaceFieldBindings);
  expect(compileEntityIntakeSurfaces(removed)).toHaveLength(2);
});
it("reports owned placements and blocks required placements, rule dependencies and positional tests", () => {
  expect(
    removalDependencies(graph, "surfaceSections", "section-main").join(),
  ).toContain("entitySurfaceSectionId");
  const required = {
    ...graph,
    surfaceFieldBindings: graph.surfaceFieldBindings.map((p) => ({
      ...p,
      displayConfig: { ...p.displayConfig, required: true },
    })),
  };
  expect(() =>
    structuralEdit(required, {
      kind: "remove",
      collection: "surfaceFieldBindings",
      id: "placement-role",
    }),
  ).toThrow("Required placements");
  const bound = {
    ...graph,
    extension: { expression: "answers.requested_role == supplier" },
  };
  expect(
    removalDependencies(bound, "surfaceFieldBindings", "placement-role"),
  ).toContain("extension.expression");
  expect(() =>
    structuralEdit(
      { ...graph, tests: [{ key: "order", path: "surfaceSections.0.title" }] },
      {
        kind: "reorder",
        collection: "surfaceSections",
        id: "section-main",
        direction: 1,
      },
    ),
  ).toThrow("Contract test");
});
it("rejects cross-surface moves, duplicate fields, duplicate keys and ambiguous positions", () => {
  expect(() =>
    structuralEdit(graph, {
      kind: "move",
      id: "placement-role",
      sectionId: "section-other",
    }),
  ).toThrow("same surface");
  expect(() =>
    structuralEdit(graph, {
      kind: "placement",
      sectionId: "section-main",
      templateId: "placement-role",
      id: fresh,
    }),
  ).toThrow("already placed");
  expect(() =>
    structuralEdit(graph, {
      kind: "section",
      surfaceId: "surface-main",
      id: fresh,
      key: "first",
      title: "Duplicate",
      placementId: "placement-role",
    }),
  ).toThrow("already exists");
  expect(() =>
    structuralEdit(
      {
        ...graph,
        surfaceSections: graph.surfaceSections.map((s) => ({
          ...s,
          position: 0,
        })),
      },
      {
        kind: "reorder",
        collection: "surfaceSections",
        id: "section-main",
        direction: 1,
      },
    ),
  ).toThrow("duplicate positions");
});
it("refuses malformed references and compiler-invalid dependencies on a new placement", () => {
  const changed = {
    ...graph,
    surfaceFieldBindings: graph.surfaceFieldBindings.map((p) =>
      p.id === "placement-mode"
        ? {
            ...p,
            visibilityRule: {
              field: "missing_field",
              operator: "equals",
              value: "full",
            },
          }
        : p,
    ),
  };
  expect(() =>
    structuralEdit(changed, {
      kind: "placement",
      sectionId: "section-main",
      templateId: "placement-mode",
      id: fresh,
    }),
  ).toThrow();
});

it("refuses deleting or moving the final placement and rejects references to section keys", () => {
  expect(() =>
    structuralEdit(graph, {
      kind: "remove",
      collection: "surfaceFieldBindings",
      id: "placement-role",
    }),
  ).toThrow("retain at least one");
  expect(() =>
    structuralEdit(graph, {
      kind: "move",
      id: "placement-role",
      sectionId: "section-last",
    }),
  ).toThrow("Remove section");
  expect(() =>
    structuralEdit(
      { ...graph, extension: { section: "first" } },
      {
        kind: "remove",
        collection: "surfaceSections",
        id: "section-main",
        destinationSectionId: "section-last",
      },
    ),
  ).toThrow("extension.section");
});
