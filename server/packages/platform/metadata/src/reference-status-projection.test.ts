import { expect, it } from "vitest";
import { projectNativeFieldChoices } from "./native-runtime-projection.js";
it("retains enum labels and published status tones without widening query policy", () => {
  expect(
    projectNativeFieldChoices(
      {
        semanticRole: "status",
        statusTones: { active: "success", deprecated: "warning" },
        lookup: {
          options: [
            { value: "active", label: "Active" },
            { value: "deprecated", label: "Deprecated" },
          ],
        },
        writableOn: ["patch"],
        readPermissionCode: "override",
      },
      "enum",
    ),
  ).toEqual({
    list: {
      semanticRole: "status",
      statusTones: { active: "success", deprecated: "warning" },
    },
    validation: {
      options: ["active", "deprecated"],
      optionLabels: { active: "Active", deprecated: "Deprecated" },
    },
  });
});
