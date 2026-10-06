import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  compileSharedReferenceProduct,
  parseSharedReferenceProduct,
} from "./authoring/product.js";
import { compileNativeFieldReferenceBindings } from "./native-field-reference-compilation.js";

function source(name: string) {
  const product = parseSharedReferenceProduct(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../../../../metadata/entities/common/reference/" +
            name +
            "/definition.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const graph = compileSharedReferenceProduct(product, "studio").graph;
  // Test-only independent target roster; not deployed target-key qualification.
  const references = product.definition.fields.flatMap((field) =>
    field.keyReference
      ? [
          {
            fieldId: graph.fields.find((row) => row.fieldKey === field.key)!
              .id!,
            targetEntityCode: field.keyReference.targetEntity,
          },
        ]
      : [],
  );
  return { bindings: graph.fieldReferenceBindings ?? [], references };
}
it.each(["country", "state_region"])(
  "preserves %s's complete retained reference-binding family",
  (name) => {
    const f = source(name),
      before = structuredClone(f.bindings);
    const compiled = compileNativeFieldReferenceBindings(
      f.bindings,
      f.references,
    );
    expect(compiled).toEqual(before);
    expect(f.bindings).toEqual(before);
    if (name === "state_region")
      expect(compiled.map((binding) => binding.bindingKey)).toEqual([
        "country_code_reference",
        "parent_code_reference",
      ]);
  },
);
it("rejects unavailable targets, changed target codes and duplicate memberships", () => {
  const f = source("state_region");
  expect(() => compileNativeFieldReferenceBindings(f.bindings, [])).toThrow(
    "NATIVE_REFERENCE_BINDING_MISMATCH",
  );
  expect(() =>
    compileNativeFieldReferenceBindings(
      f.bindings.map((row) => ({ ...row, targetEntityCode: "foreign_target" })),
      f.references,
    ),
  ).toThrow("NATIVE_REFERENCE_BINDING_MISMATCH");
  expect(() =>
    compileNativeFieldReferenceBindings(
      [...f.bindings, f.bindings[0]!],
      f.references,
    ),
  ).toThrow("NATIVE_REFERENCE_BINDING_MISMATCH");
});
it("rejects unimplemented resolver/lookup variants and hidden property bags", () => {
  const f = source("state_region");
  for (const patch of [
    { referenceKind: "resolver", resolverKey: "uninstalled" },
    { status: "deprecated" },
    { config: {} },
    { lookupDomain: "uninstalled" },
  ])
    expect(() =>
      compileNativeFieldReferenceBindings(
        f.bindings.map((row) => ({ ...row, ...patch })) as never,
        f.references,
      ),
    ).toThrow();
});
