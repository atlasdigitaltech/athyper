import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseSharedReferenceProduct, compileSharedReferenceProduct } from "../authoring/product.js";
import { amendSuccessorLocalization } from "../publication/amend-successor-localization.js";

const root = new URL("../../../../../../../metadata/products/shared/entities/country/", import.meta.url);
const product = () => parseSharedReferenceProduct(JSON.parse(readFileSync(new URL("definition.json", root), "utf8")),
  JSON.parse(readFileSync(new URL("capabilities.json", root), "utf8")));
const strip = (value: unknown): any => Array.isArray(value) ? value.map(strip)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "localizedLabel" && key !== "localizedLabels").map(([key, child]) => [key, strip(child)])) : value;

for (const plane of ["studio", "neon", "mesh"] as const) it(`${plane}: amends only references and preserves published capability settings`, () => {
  const candidate = product();
  const published = strip(compileSharedReferenceProduct(candidate, plane).graph);
  // A source proposal must not override the predecessor's deliberate default.
  const comments = published.capabilities.find((item: any) => item.capabilityKey === "comments");
  comments.binding.defaultAudience = "private";
  const before = structuredClone(published);
  const amended = amendSuccessorLocalization(published, candidate);
  expect(strip(amended)).toEqual(before);
  expect(amended.capabilities).toEqual(before.capabilities);
  expect(published).toEqual(before);
  expect(amendSuccessorLocalization(amended, candidate)).toEqual(amended);
  expect(amended.surfaces?.find(item => item.surfaceKind === "list")?.layoutConfig?.localizedLabels).toBeTruthy();
});

it("rejects mismatched identity, fallback labels and navigation structure", () => {
  const candidate = product();
  const published = strip(compileSharedReferenceProduct(candidate, "studio").graph);
  for (const mutate of [
    (graph: any) => { graph.entity.entityCode = "another_reference"; },
    (graph: any) => { graph.surfaceFieldBindings[0].labelOverride = "Different label"; },
    (graph: any) => { graph.surfaces.find((item: any) => item.surfaceKind === "detail").layoutConfig.recordPresentation.sections[0].fields = []; },
  ]) {
    const invalid = structuredClone(published); mutate(invalid);
    expect(() => amendSuccessorLocalization(invalid, candidate)).toThrow(/LOCALIZATION_/);
  }
});
