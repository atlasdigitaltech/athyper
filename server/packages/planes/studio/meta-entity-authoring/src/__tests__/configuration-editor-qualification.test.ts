import { expect, it } from "vitest";
import {
  compileGraph,
  runContractTests,
  validateGraph,
} from "../deterministic.js";
import { authoringGraph } from "../testing/authoring-graph.js";

it("validates and compiles declarative field and flow configuration without a product editor", () => {
  const before = authoringGraph();
  const graph = {
    ...before,
    surfaceFieldBindings: before.surfaceFieldBindings!.map((binding) => ({
      ...binding,
      showRequiredIndicator: true,
    })),
    flows: before.flows!.map((flow) => ({ ...flow, navigationMode: "free" })),
    flowSteps: before.flowSteps!.map((step) => ({ ...step, isOptional: true })),
  };
  expect(validateGraph(graph).issues).toEqual([]);
  expect(runContractTests(graph).passed).toBe(true);
  expect(compileGraph(graph).contractHash).not.toBe(
    compileGraph(before).contractHash,
  );
  expect(
    validateGraph({
      ...graph,
      flowSteps: graph.flowSteps.map((step) => ({
        ...step,
        entitySurfaceId: "missing",
      })),
    }).issues.length,
  ).toBeGreaterThan(0);
});
