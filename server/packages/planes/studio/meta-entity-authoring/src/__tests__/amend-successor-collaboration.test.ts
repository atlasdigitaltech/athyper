import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseSharedReferenceProduct, compileSharedReferenceProduct } from "../authoring/product.js";
import { amendSuccessorCollaboration } from "../publication/amend-successor-collaboration.js";

const root = new URL("../../../../../../../metadata/products/shared/entities/country/", import.meta.url);
const product = () => parseSharedReferenceProduct(
  JSON.parse(readFileSync(new URL("definition.json", root), "utf8")),
  JSON.parse(readFileSync(new URL("capabilities.json", root), "utf8")),
);

for (const plane of ["studio", "neon", "mesh"] as const) it(`${plane}: changes only collaboration, preserves inputs and replays identically`, () => {
  const candidate = product();
  const graph = { ...compileSharedReferenceProduct(candidate, plane).graph, capabilities: [] };
  const before = structuredClone(graph);
  const amended = amendSuccessorCollaboration(graph, candidate);
  expect(graph).toEqual(before);
  expect({ ...amended, capabilities: [] }).toEqual(before);
  expect(amended.capabilities).toEqual(candidate.definition.capabilities);
  expect(amendSuccessorCollaboration(amended, candidate)).toEqual(amended);
  expect(amended.capabilities).not.toBe(candidate.definition.capabilities);
});

it("rejects wrong parent, storage and writable runtime", () => {
  const candidate = product();
  const source = compileSharedReferenceProduct(candidate, "studio").graph;
  for (const graph of [
    { ...source, entity: { ...source.entity, entityCode: "other_reference" } },
    { ...source, runtimeProfiles: [{ ...source.runtimeProfiles![0]!, storageObject: "other_reference" }] },
    { ...source, runtimeProfiles: [{ ...source.runtimeProfiles![0]!, writeMode: "generic" as const }] },
  ]) {
    expect(() => amendSuccessorCollaboration(graph, candidate)).toThrow("COLLABORATION_PRODUCT_SOURCE_MISMATCH");
  }
});

it("rejects missing capabilities and invalid permission mappings", () => {
  const candidate = product();
  const graph = compileSharedReferenceProduct(candidate, "studio").graph;
  expect(() => amendSuccessorCollaboration(graph, { ...candidate, definition: { ...candidate.definition, capabilities: [] } })).toThrow("COLLABORATION_PRODUCT_SOURCE_MISMATCH");
  const invalid = JSON.parse(JSON.stringify(candidate));
  invalid.definition.capabilities[0].binding.actions[0].permissionCode = "common.platform.reference.view";
  expect(() => amendSuccessorCollaboration(graph, invalid)).toThrow();
});
