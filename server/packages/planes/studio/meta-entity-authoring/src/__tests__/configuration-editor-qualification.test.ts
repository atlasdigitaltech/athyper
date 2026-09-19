import { expect, it } from "vitest";
import { configurationEdit } from "../../../../../../../packages/planes/studio/business-partner/src/composition-configuration";
import { configurationFixture } from "../../../../../../../packages/planes/studio/business-partner/src/composition-configuration.fixture";
import {
  validateGraph,
  compileGraph,
  runContractTests,
} from "../deterministic";
it("validates and compiles qualified rule and workflow edits through authoring", () => {
  let graph = configurationEdit(
    configurationFixture,
    "surfaceFieldBindings",
    "placement-role",
    "required",
    true,
  );
  graph = configurationEdit(graph, "flows", "flow", "navigationMode", "free");
  graph = configurationEdit(graph, "flowSteps", "step", "isOptional", true);
  expect(validateGraph(graph as never).issues).toEqual([]);
  expect(runContractTests(graph as never).passed).toBe(true);
  expect(compileGraph(graph as never).contractHash).toBeTruthy();
});
