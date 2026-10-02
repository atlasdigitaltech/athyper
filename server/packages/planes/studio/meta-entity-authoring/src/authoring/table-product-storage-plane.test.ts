import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  compileTableEntityProduct,
  parseTableEntityProduct,
} from "./table-product.js";

function neonProduct() {
  const source = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../../metadata/products/shared/entities/principal/definition.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  source.planes = ["neon"];
  source.definition.runtimeProfiles[0].storagePlane = "neon";
  for (const binding of source.definition.operationPermissions) {
    binding.targetPlane = "neon";
    binding.permissionCode = "neon.workforce.identity.read";
  }
  for (const binding of source.definition.operationScopeBindings ?? [])
    binding.targetPlane = "neon";
  for (const surface of source.definition.surfaces) {
    const authorization = surface.layoutConfig?.authorization;
    if (!authorization) continue;
    authorization.planeKey = "neon";
    for (const operation of authorization.operations)
      operation.permissionCode = "neon.workforce.identity.read";
  }
  return source;
}

it("supports a Neon-only table without inventing Studio or Mesh deployment targets", () => {
  const source = neonProduct();
  const product = parseTableEntityProduct(source);
  expect(product.planes).toEqual(["neon"]);
  const { graph } = compileTableEntityProduct(product, "neon");
  expect(graph.runtimeProfiles![0]!.storagePlane).toBe("neon");
  expect(
    graph.operationPermissions!.every(
      (binding) => binding.permissionCode === "neon.workforce.identity.read",
    ),
  ).toBe(true);
  expect(() => compileTableEntityProduct(product, "studio")).toThrow(
    "TARGET_EXCLUDED",
  );
  expect(() => compileTableEntityProduct(product, "mesh")).toThrow(
    "TARGET_EXCLUDED",
  );
  expect(source.planes).toEqual(["neon"]);
});

it("remaps source-plane permissions only when another plane is explicitly admitted", () => {
  const source = neonProduct();
  source.planes.push("mesh");
  const { graph } = compileTableEntityProduct(
    parseTableEntityProduct(source),
    "mesh",
  );
  expect(
    graph.operationPermissions!.every(
      (binding) => binding.permissionCode === "mesh.workforce.identity.read",
    ),
  ).toBe(true);
  for (const surface of graph.surfaces ?? []) {
    const authorization = surface.layoutConfig?.authorization as
      | { planeKey: string; operations: { permissionCode: string }[] }
      | undefined;
    if (!authorization) continue;
    expect(authorization.planeKey).toBe("mesh");
    expect(
      authorization.operations.every(
        (operation) =>
          operation.permissionCode === "mesh.workforce.identity.read",
      ),
    ).toBe(true);
  }
});

it("rejects a storage authority excluded from the declared product targets", () => {
  const source = neonProduct();
  source.planes = ["mesh"];
  expect(() => parseTableEntityProduct(source)).toThrow(
    "TENANT_STORAGE_REQUIRED",
  );
});
