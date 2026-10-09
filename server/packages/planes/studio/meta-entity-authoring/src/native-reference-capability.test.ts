import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { NativeMetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { coreFixtureRow } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import {
  compileSharedReferenceProduct,
  parseSharedReferenceProduct,
} from "./authoring/product.js";
import { createHistoricalNativeReferenceCapabilityAdapter } from "./native-reference-capability.js";
import { sha256 } from "./deterministic.js";
function fixture(name = "country") {
  const source = compileSharedReferenceProduct(
    parseSharedReferenceProduct(
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
    ),
    "studio",
  ).graph;
  const key = source.surfaces!.find((s) => s.layoutConfig?.referenceCapability)!
    .layoutConfig!.referenceCapability as string;
  const resource = {
    owner: "synthetic-tests",
    key,
    version: 1,
    hash: "a".repeat(64),
  };
  const input = {
    source,
    sourceHash: sha256(source),
    resource: { ...resource, key: "reference-marker-conversion" },
    binding: {
      runtimeId: source.runtimeProfiles![0]!.id!,
      key,
      version: 1,
      resource,
    },
  };
  const target = {
    runtimeProfiles: [
      coreFixtureRow("runtime", input.binding.runtimeId, {
        referenceCapabilityKey: key,
        referenceCapabilityVersion: 1,
      }),
    ],
    surfaces: source.surfaces,
  } as unknown as NativeMetaEntityGraph;
  return { source, input, target };
}
it.each(["country", "state_region"])(
  "converts %s marker to an exact typed runtime pin and back",
  (name) => {
    const f = fixture(name),
      adapter = createHistoricalNativeReferenceCapabilityAdapter(f.input),
      prepared = adapter.forward(f.source);
    expect(
      prepared.surfaces!.every(
        (s) => !Object.hasOwn(s.layoutConfig ?? {}, "referenceCapability"),
      ),
    ).toBe(true);
    expect(prepared.runtimeProfiles).toEqual(f.source.runtimeProfiles);
    expect(adapter.reverse(prepared, f.target)).toEqual(f.source);
    Reflect.set(f.input.binding, "key", "caller_mutation");
    expect(adapter.forward(f.source)).toEqual(prepared);
  },
);
it("rejects altered declarations, unavailable runtime identity, wrong resource pin and lossy target", () => {
  const f = fixture();
  expect(() =>
    createHistoricalNativeReferenceCapabilityAdapter({
      ...f.input,
      binding: { ...f.input.binding, runtimeId: "unavailable" },
    }),
  ).toThrow("NATIVE_REFERENCE_CAPABILITY_INVALID");
  expect(() =>
    createHistoricalNativeReferenceCapabilityAdapter({
      ...f.input,
      binding: { ...f.input.binding, version: 2 },
    }),
  ).toThrow("NATIVE_REFERENCE_CAPABILITY_INVALID");
  const adapter = createHistoricalNativeReferenceCapabilityAdapter(f.input),
    prepared = adapter.forward(f.source);
  expect(() =>
    adapter.reverse(prepared, {
      ...f.target,
      runtimeProfiles: f.target.runtimeProfiles.map((r) => ({
        ...r,
        referenceCapabilityVersion: 2,
      })),
    }),
  ).toThrow("NATIVE_REFERENCE_CAPABILITY_INVALID");
  expect(() =>
    adapter.reverse(prepared, { ...f.target, surfaces: [] }),
  ).toThrow("NATIVE_REFERENCE_CAPABILITY_INVALID");
  expect(() => adapter.forward({ ...f.source, fields: [] })).toThrow(
    "NATIVE_REFERENCE_CAPABILITY_INVALID",
  );
});
