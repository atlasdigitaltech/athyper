import { expect, it } from "vitest";
import {
  compileGraph,
  runContractTests,
  validateGraph,
} from "../deterministic.js";
import { authoringGraph } from "../testing/authoring-graph.js";

it("validates reorder, placement and section changes through the shared graph pipeline", () => {
  const before = authoringGraph();
  const added = {
    id: "section-additional",
    entitySurfaceId: "surface-main",
    sectionKey: "additional",
    title: "Additional",
    position: 2,
  };
  const graph = {
    ...before,
    surfaceSections: [
      ...before.surfaceSections!.map((section) => ({
        ...section,
        position: 1 - section.position,
      })),
      added,
    ],
    surfaceFieldBindings: [
      ...before.surfaceFieldBindings!,
      {
        ...before.surfaceFieldBindings![0]!,
        id: "placement-additional",
        bindingKey: "additional",
        entitySurfaceSectionId: added.id,
      },
    ],
  };
  expect(validateGraph(graph).issues).toEqual([]);
  expect(runContractTests(graph).passed).toBe(true);
  expect(compileGraph(graph).contractHash).not.toBe(
    compileGraph(before).contractHash,
  );
  const withoutSection = {
    ...graph,
    surfaceSections: graph.surfaceSections.filter(
      (section) => section.id !== added.id,
    ),
  };
  expect(validateGraph(withoutSection).issues.length).toBeGreaterThan(0);
  expect(
    validateGraph({
      ...withoutSection,
      surfaceFieldBindings: before.surfaceFieldBindings,
    }).issues,
  ).toEqual([]);
});
