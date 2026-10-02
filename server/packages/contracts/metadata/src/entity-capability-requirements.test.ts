import { expect, it } from "vitest";
import { entityCapabilityRequirements } from "./entity-readiness.js";
import type { EntityAiDescriptorV1 } from "./entity-ai.js";

it.each([true, false])(
  "rejects unpinned availability declarations from a trusted reader override (%s)",
  (required) => {
    const ai: EntityAiDescriptorV1 = {
      schemaVersion: 1,
      enabled: true,
      aliases: [],
      summaryFieldKeys: [],
      searchFieldKeys: [],
      relationshipKeys: [],
      contextKinds: ["record"],
      actions: [],
      presentationProfiles: [],
      insightProviders: [{ id: "entity_read_record", version: 1, required }],
    };
    expect(() => entityCapabilityRequirements({ ai })).toThrow(
      "ENTITY_AI_MANIFEST_BINDINGS_REQUIRED",
    );
  },
);

it("derives detached release requirements without treating legacy pins as readiness", () => {
  const binding = {
    id: "entity_read_record",
    version: "1",
    manifestHash: "a".repeat(64),
    inputSchemaHash: "b".repeat(64),
    resultSchemaHash: "c".repeat(64),
  };
  const descriptor = {
    aiManifestBindings: {
      schema: "entity-ai-manifest-bindings/1" as const,
      plane: "neon" as const,
      tools: [
        binding,
        { ...binding, id: "entity_lookup", required: true },
        { ...binding, id: "entity_read_comments", required: false },
      ],
    },
  };
  const requirements = entityCapabilityRequirements(descriptor);
  expect(requirements.map((item) => [item.id, item.required])).toEqual([
    ["entity_read_record", false],
    ["entity_lookup", true],
    ["entity_read_comments", false],
  ]);
  binding.manifestHash = "d".repeat(64);
  expect(requirements[0]!.manifestHash).toBe("a".repeat(64));
  expect(Object.isFrozen(requirements)).toBe(true);
  expect(requirements.every(Object.isFrozen)).toBe(true);
  expect(entityCapabilityRequirements({})).toEqual([]);
});
