import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  parseSharedReferenceProduct,
  compileSharedReferenceProduct,
} from "./product.js";
const source = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../../metadata/products/shared/entities/country/definition.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
it.each(["studio", "neon", "mesh"] as const)(
  "publishes Country AI on %s without granting writes",
  (plane) => {
    const { graph, artifact } = compileSharedReferenceProduct(
      parseSharedReferenceProduct(source()),
      plane,
    );
    expect(artifact.descriptor.ai).toEqual(source().definition.ai);
    expect(graph.operations?.map((op) => op.operationKey).sort()).toEqual([
      "list",
      "read",
    ]);
    expect(graph.fields.every((field) => field.writeMode === "read_only")).toBe(
      true,
    );
    expect(
      graph.operationPermissions?.every(
        (binding) =>
          binding.permissionCode === "common.platform.reference.view",
      ),
    ).toBe(true);
    const disabled = source();
    disabled.definition.ai.enabled = false;
    expect(
      compileSharedReferenceProduct(
        parseSharedReferenceProduct(disabled),
        plane,
      ).artifact.descriptorHash,
    ).not.toBe(artifact.descriptorHash);
  },
);
it("rejects unknown providers, fields and mutation actions at authoring", () => {
  for (const patch of [
    { insightProviders: [{ id: "sql_query", version: 1 }] },
    { summaryFieldKeys: ["secret"] },
    { actions: [{ id: "delete", version: 1, operationKey: "delete" }] },
  ]) {
    const value = source();
    Object.assign(value.definition.ai, patch);
    expect(() => parseSharedReferenceProduct(value)).toThrow();
  }
});
