import { resolveSourcePath } from "../../../../../../../tooling/scripts/metadata/source-workspace.mjs";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  compileTableEntityProduct,
  parseTableEntityProduct,
} from "./table-product.js";

it("lowers entity permission codes and authorization profiles together for each target plane", () => {
  const source = JSON.parse(
    readFileSync(
      resolveSourcePath(new URL(
        "../../../../../../../metadata/entities/principal/definition.json",
        import.meta.url,
      )),
      "utf8",
    ),
  );
  for (const binding of source.definition.operationPermissions)
    binding.permissionCode = "studio.foundation.principal_probe.read";
  for (const surface of source.definition.surfaces) {
    for (const operation of surface.layoutConfig?.authorization?.operations ??
      [])
      operation.permissionCode = "studio.foundation.principal_probe.read";
  }
  const product = parseTableEntityProduct(source);
  for (const plane of ["studio", "neon", "mesh"] as const) {
    const { graph } = compileTableEntityProduct(product, plane);
    expect(
      graph.operationPermissions?.every(
        (binding) =>
          binding.permissionCode === `${plane}.foundation.principal_probe.read`,
      ),
    ).toBe(true);
    for (const surface of graph.surfaces ?? []) {
      const profile = surface.layoutConfig?.authorization as
        | {
            operations: { permissionCode: string }[];
          }
        | undefined;
      if (!profile) continue;
      expect(
        profile.operations.every(
          (operation) =>
            operation.permissionCode ===
            `${plane}.foundation.principal_probe.read`,
        ),
      ).toBe(true);
      expect(
        (
          surface.layoutConfig?.ownerAccess as
            { administerPermission: string } | undefined
        )?.administerPermission,
      ).toBe("common.identity.principal.administer");
    }
  }
  expect(source.definition.operationPermissions[0].permissionCode).toBe(
    "studio.foundation.principal_probe.read",
  );
});
