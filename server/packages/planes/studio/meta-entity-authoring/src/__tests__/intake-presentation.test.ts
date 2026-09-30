import { expect, it } from "vitest";
import { compileEntityIntakeSurfaces } from "@athyper/contract-platform-entity-runtime";
import { intakeGraph } from "../testing/authoring-graph.js";

it("does not invent intake surfaces for an unconfigured graph", () => {
  expect(compileEntityIntakeSurfaces({ surfaces: [] })).toEqual([]);
});
it("compiles explicit presentation without mutating authored choices", () => {
  const graph = intakeGraph();
  const before = structuredClone(graph);
  const compiled = compileEntityIntakeSurfaces(
    graph as unknown as Record<string, unknown>,
  );
  expect(graph).toEqual(before);
  expect(compiled[0]!.presentation).toEqual({
    defaultLayout: "content",
    allowedLayouts: ["content", "sections-content-guidance"],
  });
  expect(
    compileEntityIntakeSurfaces(graph as unknown as Record<string, unknown>),
  ).toEqual(compiled);
});
it("rejects a default presentation outside its authored allowed layouts", () => {
  const graph = intakeGraph();
  const invalid = {
    ...graph,
    surfaces: graph.surfaces!.map((surface) => ({
      ...surface,
      layoutConfig: {
        ...surface.layoutConfig,
        intakePresentation: {
          defaultLayout: "unpublished",
          allowedLayouts: ["content"],
        },
      },
    })),
  };
  expect(() => compileEntityIntakeSurfaces(invalid)).toThrow(
    "workspace defaults",
  );
});
