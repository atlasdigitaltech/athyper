import { expect, it } from "vitest";
import { structuralEdit } from "../../../../../../../packages/planes/studio/business-partner/src/composition-structure";
import { graph } from "../../../../../../../packages/planes/studio/business-partner/src/composition-structure.fixture";
import {
  validateGraph,
  compileGraph,
  runContractTests,
} from "../deterministic";
it("accepts qualified UI structural changes through the backend validation and compilation pipeline", () => {
  let working = structuralEdit(graph, {
    kind: "reorder",
    collection: "surfaceSections",
    id: "section-last",
    direction: -1,
  });
  working = structuralEdit(working, {
    kind: "placement",
    sectionId: "section-main",
    templateId: "placement-mode",
    id: "00000000-0000-4000-8000-000000000001",
  });
  working = structuralEdit(working, {
    kind: "section",
    surfaceId: "surface-main",
    id: "00000000-0000-4000-8000-000000000002",
    key: "additional",
    title: "Additional",
    placementId: "00000000-0000-4000-8000-000000000001",
  });
  expect(validateGraph(working as never).issues).toEqual([]);
  expect(runContractTests(working as never).passed).toBe(true);
  expect(compileGraph(working as never).contractHash).toBeTruthy();
  working = structuralEdit(working, {
    kind: "remove",
    collection: "surfaceSections",
    id: "00000000-0000-4000-8000-000000000002",
    destinationSectionId: "section-main",
  });
  working = structuralEdit(working, {
    kind: "remove",
    collection: "surfaceFieldBindings",
    id: "00000000-0000-4000-8000-000000000001",
  });
  expect(validateGraph(working as never).issues).toEqual([]);
});
