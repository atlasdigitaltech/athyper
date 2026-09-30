import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  parseSharedReferenceProduct,
  compileSharedReferenceProduct,
} from "../authoring/product.js";
import { amendSuccessorAi } from "./amend-successor-ai.js";
const product = () =>
  parseSharedReferenceProduct(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../../../../../metadata/products/shared/entities/country/definition.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
it("amends only AI on a read-only system reference successor", () => {
  const p = product();
  const { graph } = compileSharedReferenceProduct(p, "studio");
  const original = {
    ...graph,
    surfaces: graph.surfaces!.map((surface) => {
      const { ai, ...layoutConfig } = surface.layoutConfig ?? {};
      return { ...surface, layoutConfig };
    }),
  };
  const changed = amendSuccessorAi(original, p);
  expect(changed.operations).toEqual(original.operations);
  expect(changed.operationPermissions).toEqual(original.operationPermissions);
  expect(changed.fields).toEqual(original.fields);
  expect(changed.capabilities).toEqual(original.capabilities);
  expect(
    changed.surfaces?.find((s) => s.surfaceKind === "detail")?.layoutConfig?.ai,
  ).toEqual(p.definition.ai);
  expect(
    original.surfaces.find((s) => s.surfaceKind === "detail")?.layoutConfig,
  ).not.toHaveProperty("ai");
  expect(() =>
    amendSuccessorAi(
      { ...original, entity: { ...original.entity, entityCode: "principal" } },
      p,
    ),
  ).toThrow("AI_PRODUCT_SOURCE_MISMATCH");
});
