import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { compileSharedReferenceProduct, parseSharedReferenceProduct } from "@athyper/server-plane-studio-meta-entity-authoring";

it("compiles Country's public tenant-record bindings on all three planes", () => {
  const source = JSON.parse(readFileSync(new URL("../../../../../../../../metadata/entities/country/definition.json", import.meta.url), "utf8"));
  const product = parseSharedReferenceProduct(source);
  for (const plane of ["studio", "neon", "mesh"] as const) {
    const { artifact } = compileSharedReferenceProduct(product, plane);
    const descriptor = artifact.descriptor;
    expect(descriptor.referenceCapability).toBe("common.platform.reference.view");
    expect(descriptor.authorization).toMatchObject({
      entityCode: "country",
      planeKey: plane,
      ownership: "tenant.record.v1",
    });
    expect(descriptor.authorizationRuntime).toMatchObject({
      bindings: [
        { operation: "list", handler: "entity.record.list.v1", resolver: "tenant.record.v1" },
        { operation: "read", handler: "entity.record.read.v1", resolver: "tenant.record.v1" },
      ],
    });
  }
});
