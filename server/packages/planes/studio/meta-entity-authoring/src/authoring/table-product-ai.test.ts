import { resolveSourcePath } from "../../../../../../../tooling/scripts/metadata/source-workspace.mjs";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { compileTableEntityProduct, parseTableEntityProduct } from "./table-product.js";
import { amendSuccessorAi } from "../publication/amend-successor-ai.js";
const source = (code: string) => JSON.parse(readFileSync(resolveSourcePath(new URL(`../../../../../../../metadata/entities/${code}/definition.json`, import.meta.url)), "utf8"));
it.each(["principal", "principal_notification_preference"])("projects %s AI authoring and amends only that projection on every plane", code => {
  const product = parseTableEntityProduct(source(code));
  for (const plane of ["neon", "studio", "mesh"] as const) {
    const { graph, artifact } = compileTableEntityProduct(product, plane);
    expect(artifact.descriptor.ai).toEqual(product.definition.ai);
    expect(graph).not.toHaveProperty("ai");
    const baseline = { ...graph, surfaces: graph.surfaces!.map(surface => {
      const { ai: _, ...layoutConfig } = surface.layoutConfig ?? {};
      return { ...surface, layoutConfig };
    }) };
    const amended = amendSuccessorAi(baseline, product);
    expect(amended.fields).toEqual(baseline.fields);
    expect(amended.operations).toEqual(baseline.operations);
    expect(amended.operationPermissions).toEqual(baseline.operationPermissions);
    expect(amended.operationScopeBindings).toEqual(baseline.operationScopeBindings);
    expect(amended.runtimeProfiles).toEqual(baseline.runtimeProfiles);
    expect(amended.capabilities).toEqual(baseline.capabilities);
    expect(amended.surfaces?.map(surface => surface.layoutConfig?.authorization)).toEqual(baseline.surfaces.map(surface => surface.layoutConfig.authorization));
    expect(amended.surfaces?.map(surface => surface.layoutConfig?.recordPresentation)).toEqual(baseline.surfaces.map(surface => surface.layoutConfig.recordPresentation));
    expect(() => amendSuccessorAi({ ...baseline, entity: { ...baseline.entity, entityCode: "other" } }, product)).toThrow("AI_PRODUCT_SOURCE_MISMATCH");
  }
});
it("rejects a competing surface authority and leaves Profile PII unenrolled", () => {
  const value = source("principal");
  value.definition.surfaces.find((surface: { surfaceKind: string }) => surface.surfaceKind === "detail").layoutConfig.ai = { ...value.definition.ai, enabled: false };
  expect(() => parseTableEntityProduct(value)).toThrow("TABLE_PRODUCT_AI_AUTHORITY_CONFLICT");
  const profile = parseTableEntityProduct(source("principal_profile"));
  expect(compileTableEntityProduct(profile, "neon").artifact.descriptor.ai).toBeUndefined();
});
