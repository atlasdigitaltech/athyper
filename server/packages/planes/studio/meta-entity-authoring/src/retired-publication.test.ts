import { expect, it } from "vitest";
import { validateGraph } from "./deterministic.js";
import { authoringGraph } from "./testing/authoring-graph.js";

it.each(["baselineImport", "authorizationSuccessor", "runtimeRestoration"])(
  "rejects the retired %s carrier, including an explicit null marker",
  (marker) => {
    for (const value of [{}, null]) {
      const graph = authoringGraph();
      graph.surfaces![0]!.layoutConfig = { [marker]: value };
      expect(validateGraph(graph).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "IMPORTED_BASELINE_PUBLICATION_RETIRED",
          }),
        ]),
      );
    }
  },
);

it("keeps ordinary shared authoring available without retired carriers", () => {
  expect(
    validateGraph(authoringGraph()).issues.some(
      (issue) => issue.code === "IMPORTED_BASELINE_PUBLICATION_RETIRED",
    ),
  ).toBe(false);
});
