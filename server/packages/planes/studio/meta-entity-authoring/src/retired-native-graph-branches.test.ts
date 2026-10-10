import { expect, it } from "vitest";
import { assertNoRetiredNativeGraphBranches } from "./retired-native-graph-branches.js";

it("rejects populated retired graph branches instead of silently dropping them", () => {
  expect(() =>
    assertNoRetiredNativeGraphBranches({
      contractSchema: "athyper.meta-entity-contract/2.1",
      entity: {
        entityCode: "example",
        entityClass: "reference",
        ownershipModel: "system",
      },
      materializationBindings: [
        {
          bindingKey: "obsolete",
          targetEntityCode: "target",
          materializerKey: "retired",
        },
      ],
    }),
  ).toThrow(/retired from Entity authoring/);
});
