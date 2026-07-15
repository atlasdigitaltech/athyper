import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(import.meta.dirname, "../meta-entity-runtime.ts"), "utf8");

describe("collapsed Neon runtime bootstrap", () => {
  it("uses one bootstrap request and only the optional record overlay", () => {
    const start = source.indexOf("async function loadBootstrapRuntimeDescriptor");
    const end = source.indexOf("async function loadLegacyRuntimeDescriptor", start);
    const implementation = source.slice(start, end);
    expect(implementation).toContain("/runtime-bootstrap");
    expect(implementation).toContain("/record-operations?recordId=");
    expect(implementation).not.toContain("/operations");
    expect(implementation).not.toContain("/policy");
    expect(implementation).not.toContain("/lifecycle-masks");
    expect(implementation).not.toContain("fetchRelationRuntimeProjections");
  });

  it("runs legacy fan-out only in shadow cohorts and falls back on drift", () => {
    expect(source).toContain("rollout.shadowRuntimeBootstrap === true");
    expect(source).toContain("runtimeDescriptorParity(projected, legacy)");
    expect(source).toContain("return legacy");
  });
});
