import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(import.meta.dirname, "../meta-entity-runtime.ts"), "utf8");

describe("collapsed Neon runtime bootstrap", () => {
  it("uses one bootstrap request and only the optional record overlay", () => {
    const start = source.indexOf("async function loadBootstrapRuntimeDescriptor");
    const end = source.indexOf("async function loadLegacyRuntimeDescriptor", start);
    const implementation = source.slice(start, end);
    expect(implementation.indexOf("bootstrapSharedCache.get")).toBeLessThan(
      implementation.indexOf("/runtime-bootstrap"),
    );
    expect(implementation).toContain("bootstrapSharedCache.set");
    expect(implementation.indexOf("descriptorSharedCache.get")).toBeLessThan(
      implementation.indexOf("/record-operations?recordId="),
    );
    expect(implementation).toContain("/runtime-bootstrap");
    expect(implementation).toContain("/record-operations?recordId=");
    expect(implementation).not.toContain("/operations");
    expect(implementation).not.toContain("/policy");
    expect(implementation).not.toContain("/lifecycle-masks");
    expect(implementation).not.toContain("fetchRelationRuntimeProjections");
  });

  it("invalidates bootstrap and descriptor entries under the same security scope", () => {
    const start = source.indexOf("export function invalidateMetaEntityRuntimeCaches");
    const end = source.indexOf("function handleMetaEntityRuntimeInvalidationEvent", start);
    const implementation = source.slice(start, end);
    expect(implementation).toContain("descriptorSharedCache.invalidate(scope, generation)");
    expect(implementation).toContain("bootstrapSharedCache.invalidate(scope, generation)");
  });

  it("runs legacy fan-out only in shadow cohorts and falls back on drift", () => {
    expect(source).toContain("rollout.shadowRuntimeBootstrap === true");
    expect(source).toContain("runtimeDescriptorParity(projected, legacy)");
    expect(source).toContain("return legacy");
  });
});
