import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  parseSharedReferenceProduct,
  compileSharedReferenceProduct,
} from "../authoring/product.js";
import { amendSuccessorChoices } from "./amend-successor-choices.js";
const source = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../../metadata/entities/country/definition.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
it("amends only finite field domains and presentation on a pinned successor", () => {
  const next = parseSharedReferenceProduct(source());
  const old = source();
  const status = old.definition.fields.find(
    (field: any) => field.key === "status",
  );
  status.type = "string";
  delete status.choices;
  delete status.domainCode;
  delete status.semanticRole;
  const graph = compileSharedReferenceProduct(
    parseSharedReferenceProduct(old),
    "studio",
  ).graph;
  const before = structuredClone(graph);
  const amended = amendSuccessorChoices(graph, next);
  expect(graph).toEqual(before);
  expect(
    amended.fields.find((field) => field.fieldKey === "status")?.dataType,
  ).toBe("enum");
  for (const key of [
    "operations",
    "operationPermissions",
    "operationScopeBindings",
    "runtimeProfiles",
    "capabilities",
    "keys",
    "keyFields",
  ] as const)
    expect(amended[key]).toEqual(before[key]);
  expect(amendSuccessorChoices(amended, next)).toEqual(amended);
  expect(
    amended.surfaces?.find((surface) => surface.surfaceKind === "list")
      ?.layoutConfig?.authorization,
  ).toEqual(
    before.surfaces?.find((surface) => surface.surfaceKind === "list")
      ?.layoutConfig?.authorization,
  );
  expect(() =>
    amendSuccessorChoices(
      { ...graph, entity: { ...graph.entity, entityCode: "other" } },
      next,
    ),
  ).toThrow("CHOICE_PRODUCT_SOURCE_MISMATCH");
  expect(() =>
    amendSuccessorChoices(
      {
        ...graph,
        fields: graph.fields.map((field) =>
          field.fieldKey === "status"
            ? { ...field, writeMode: "editable" }
            : field,
        ),
      },
      next,
    ),
  ).toThrow("CHOICE_PRODUCT_FIELD_MISMATCH");
});
