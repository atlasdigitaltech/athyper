import { expect, it } from "vitest";
import { composeGraph } from "./composition-model";
it("derives placement labels and nested ownership while preserving source data", () => {
  const graph = {
    surfaces: [{ id: "s", title: "Form" }],
    fields: [{ id: "f", fieldKey: "legal_name" }],
    surfaceSections: [
      { id: "a", entitySurfaceId: "s", sectionKey: "identity" },
      {
        id: "b",
        entitySurfaceId: "s",
        parentSectionId: "a",
        sectionKey: "nested",
      },
    ],
    surfaceFieldBindings: [
      {
        id: "p",
        entitySurfaceId: "s",
        entitySurfaceSectionId: "b",
        entityFieldId: "f",
        extension: { unknown: true },
      },
    ],
  };
  const before = JSON.stringify(graph),
    m = composeGraph(graph);
  expect(m.map.get("surfaceFieldBindings:p")?.label).toBe("Legal name");
  expect(m.map.get("surfaceSections:b")?.children[0]?.key).toBe(
    "surfaceFieldBindings:p",
  );
  expect(m.map.get("fields:f")?.parent).toBeUndefined();
  expect(JSON.stringify(graph)).toBe(before);
});
it("keeps orphaned, duplicate and cyclic objects discoverable", () => {
  const m = composeGraph({
    surfaces: [{ id: "s" }, { id: "s" }],
    surfaceSections: [
      { id: "a", entitySurfaceId: "s", parentSectionId: "b" },
      { id: "b", entitySurfaceId: "s", parentSectionId: "a" },
      { id: "c", entitySurfaceId: "missing" },
    ],
  });
  expect(m.nodes).toHaveLength(5);
  expect(m.nodes.every((n) => n.issues.length > 0)).toBe(true);
  const discovered: string[] = [];
  const visit = (n: (typeof m.nodes)[number]) => {
    discovered.push(n.key);
    n.children.forEach(visit);
  };
  m.groups.forEach((g) => g.nodes.forEach(visit));
  expect(new Set(discovered).size).toBe(5);
});
it("rejects cross-surface parenting and retains stable keys after ordering changes", () => {
  const graph = {
    surfaces: [{ id: "s" }, { id: "t" }],
    surfaceSections: [
      { id: "a", entitySurfaceId: "s" },
      { id: "b", entitySurfaceId: "t", parentSectionId: "a" },
    ],
  };
  const m = composeGraph(graph);
  expect(m.map.get("surfaceSections:b")?.parent).toBeUndefined();
  expect(m.map.get("surfaceSections:b")?.issues.join(" ")).toContain(
    "different surface",
  );
  expect(
    composeGraph({ ...graph, surfaces: [...graph.surfaces].reverse() }).map.has(
      "surfaces:s",
    ),
  ).toBe(true);
});
