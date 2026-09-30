import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalCatalogV2 } from "../../seed/canonical-catalog-v2-model.js";
import { buildExactScopeCompatibility } from "../../seed/exact-scope-compatibility-model.js";

const canonicalCode = "common.platform.reference.view";
test("common reference catalog identity is stable and its scope remains plane-local", () => {
  const ids = ["studio", "neon", "mesh"].map(plane => {
    const p = plane as "studio" | "neon" | "mesh";
    const { catalog } = buildCanonicalCatalogV2({ plane: p, permissions: [{ canonicalCode, permissionKind: "capability", riskTier: "low", requiresMfa: false }] });
    assert.equal(catalog.plane, plane);
    assert.equal(catalog.permissions[0]!.product, "common");
    const scopes = buildExactScopeCompatibility({ plane: p, permissionCodes: [canonicalCode] });
    assert.deepEqual(scopes.permissions[0]!.scopes, [{ kind: "tenant", propagation: "exact" }]);
    return catalog.permissions[0]!.permissionId;
  });
  assert.equal(new Set(ids).size, 1);
});
test("the common namespace is not a general exception", () => {
  for (const code of ["common.platform.reference.edit", "common.platform.country.view", "common.iam.role.manage", "mesh.platform.reference.view"]) {
    assert.throws(() => buildCanonicalCatalogV2({ plane: "neon", permissions: [{ canonicalCode: code, permissionKind: "capability", riskTier: "low", requiresMfa: false }] }));
  }
  assert.throws(() => buildCanonicalCatalogV2({ plane: "neon", permissions: [{ canonicalCode, permissionKind: "entity_operation", riskTier: "low", requiresMfa: false }] }));
  assert.throws(() => buildExactScopeCompatibility({ plane: "neon", permissionCodes: [canonicalCode], requiredScopesByPermission: { [canonicalCode]: [{ kind: "company_code", propagation: "exact" }] } }));
});
