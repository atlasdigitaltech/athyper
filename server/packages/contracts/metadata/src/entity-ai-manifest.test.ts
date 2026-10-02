import { expect, it } from "vitest";
import type { EntityAiDescriptorV1 } from "./entity-ai.js";
import { parseEntityAiManifestBindings } from "./entity-ai-manifest.js";
const ai = {
  insightProviders: [{ id: "entity_read_record", version: 1 }],
} as unknown as EntityAiDescriptorV1;
const binding = {
  id: "entity_read_record",
  version: "1",
  manifestHash: "a".repeat(64),
  inputSchemaHash: "b".repeat(64),
  resultSchemaHash: "c".repeat(64),
};
const value = {
  schema: "entity-ai-manifest-bindings/1",
  plane: "neon",
  tools: [binding],
};
it("validates exact declared tool coverage and owns immutable parsed requirements", () => {
  const result = parseEntityAiManifestBindings(value, ai, "neon");
  expect(result).toEqual(value);
  expect(Object.isFrozen(result.tools[0])).toBe(true);
  expect(Object.isFrozen(result.tools)).toBe(true);
});
it.each([
  { ...value, plane: "mesh" },
  { ...value, schema: "future" },
  { ...value, installed: true },
  { ...value, tools: [] },
  { ...value, tools: [binding, binding] },
  { ...value, tools: [{ ...binding, id: "arbitrary_handler" }] },
  { ...value, tools: [{ ...binding, version: "latest" }] },
  {
    ...value,
    tools: [{ ...binding, manifestHash: "sha256:" + binding.manifestHash }],
  },
  { ...value, tools: [{ ...binding, inputSchemaHash: "" }] },
  { ...value, tools: [{ ...binding, resultSchemaHash: "" }] },
  { ...value, tools: [{ ...binding, granted: true }] },
])("rejects invalid or caller-expanded binding %#", (candidate) => {
  expect(() => parseEntityAiManifestBindings(candidate, ai, "neon")).toThrow(
    "BINDINGS_INVALID",
  );
});
it("rejects binding requirements without an AI declaration", () => {
  expect(() => parseEntityAiManifestBindings(value, undefined, "neon")).toThrow(
    "BINDINGS_INVALID",
  );
});

it.each([true, false])(
  "preserves explicit required=%s and rejects changed declaration",
  (required) => {
    const declaration = {
      ...ai,
      insightProviders: [{ ...ai.insightProviders[0]!, required }],
    };
    const published = { ...value, tools: [{ ...binding, required }] };
    expect(
      parseEntityAiManifestBindings(published, declaration, "neon"),
    ).toEqual(published);
    expect(() => parseEntityAiManifestBindings(published, ai, "neon")).toThrow(
      "BINDINGS_INVALID",
    );
    expect(() =>
      parseEntityAiManifestBindings(value, declaration, "neon"),
    ).toThrow("BINDINGS_INVALID");
  },
);
