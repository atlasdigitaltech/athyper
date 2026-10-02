import { expect, it, vi } from "vitest";
import type { CompiledEntityRegistry } from "@athyper/server-contract-publication";
import {
  compileEntityAiManifestBindings,
  assertEntityAiManifestBindings,
} from "./entity-ai-manifest-compiler.js";
const empty = {
  handlers: new Set<string>(),
  renderers: new Set<string>(),
  resolvers: new Set<string>(),
  evaluators: new Set<string>(),
};
const descriptor = {
  ai: { insightProviders: [{ id: "entity_read_record", version: 1 }] },
};
function fixture() {
  const resolve = vi.fn(
    (toolCode: string, version: string, plane: "studio" | "neon" | "mesh") => ({
      plane,
      manifest: { toolCode, version },
      manifestHash: "a".repeat(64),
      inputSchemaHash: "b".repeat(64),
      resultSchemaHash: "c".repeat(64),
    }),
  );
  return {
    resolve,
    registry: {
      ...empty,
      resolveAiToolManifest: resolve,
    } satisfies CompiledEntityRegistry,
  };
}
it("pins trusted exact identities without altering source or claiming readiness", () => {
  const f = fixture();
  const result = compileEntityAiManifestBindings(
    descriptor,
    "neon",
    f.registry,
  );
  expect(f.resolve).toHaveBeenCalledWith("entity_read_record", "1", "neon");
  expect(result).toMatchObject({
    aiManifestBindings: {
      schema: "entity-ai-manifest-bindings/1",
      plane: "neon",
      tools: [
        {
          id: "entity_read_record",
          version: "1",
          manifestHash: "a".repeat(64),
        },
      ],
    },
  });
  expect(descriptor).not.toHaveProperty("aiManifestBindings");
  expect(result).toEqual(
    compileEntityAiManifestBindings(descriptor, "neon", f.registry),
  );
  expect(() =>
    assertEntityAiManifestBindings(result, "neon", f.registry),
  ).not.toThrow();
});
it.each(["manifestHash", "inputSchemaHash", "resultSchemaHash"])(
  "rejects changed %s at signing/dispatch qualification",
  (key) => {
    const f = fixture(),
      result = compileEntityAiManifestBindings(descriptor, "neon", f.registry);
    const identity = f.resolve("entity_read_record", "1", "neon");
    f.resolve.mockReturnValue({ ...identity, [key]: "d".repeat(64) });
    expect(() =>
      assertEntityAiManifestBindings(result, "neon", f.registry),
    ).toThrow("ENTITY_AI_MANIFEST_CHANGED");
  },
);
it("rejects substituted versions/planes, malformed identities, caller pins and unavailable resolution", () => {
  const f = fixture();
  f.resolve.mockReturnValue({
    ...f.resolve("entity_read_record", "1", "neon"),
    plane: "mesh",
  });
  expect(() =>
    compileEntityAiManifestBindings(descriptor, "neon", f.registry),
  ).toThrow("RESOLUTION_MISMATCH");
  f.resolve.mockImplementation(() => {
    throw new Error("UNAVAILABLE");
  });
  expect(() =>
    compileEntityAiManifestBindings(descriptor, "neon", f.registry),
  ).toThrow("UNAVAILABLE");
  expect(() =>
    compileEntityAiManifestBindings(
      { ...descriptor, aiManifestBindings: {} },
      "neon",
      f.registry,
    ),
  ).toThrow("AUTHORING_FORBIDDEN");
  const valid = fixture();
  const pinned = compileEntityAiManifestBindings(
    descriptor,
    "neon",
    valid.registry,
  );
  expect(() => assertEntityAiManifestBindings(pinned, "neon", empty)).toThrow(
    "RESOLVER_UNAVAILABLE",
  );
  expect(() =>
    assertEntityAiManifestBindings(pinned, "mesh", valid.registry),
  ).toThrow("BINDINGS_INVALID");
});
it("preserves historical composition and non-AI descriptors", () => {
  expect(compileEntityAiManifestBindings(descriptor, "neon", empty)).toBe(
    descriptor,
  );
  expect(
    compileEntityAiManifestBindings({}, "neon", fixture().registry),
  ).toEqual({});
  expect(() =>
    assertEntityAiManifestBindings(descriptor, "neon", empty),
  ).not.toThrow();
});

it.each([true, false])(
  "pins explicit required=%s without reading deployment support",
  (required) => {
    const source = {
      ai: {
        insightProviders: [{ id: "entity_read_record", version: 1, required }],
      },
    };
    const f = fixture();
    expect(() => assertEntityAiManifestBindings(source, "neon", f.registry)).toThrow("BINDINGS_REQUIRED");
    const result = compileEntityAiManifestBindings(source, "neon", f.registry);
    expect(result).toMatchObject({
      aiManifestBindings: { tools: [{ required }] },
    });
    expect(() =>
      assertEntityAiManifestBindings(result, "neon", f.registry),
    ).not.toThrow();
    expect(() =>
      compileEntityAiManifestBindings(source, "neon", empty),
    ).toThrow("RESOLVER_UNAVAILABLE");
  },
);
