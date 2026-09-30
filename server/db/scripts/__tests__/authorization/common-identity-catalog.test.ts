import assert from "node:assert/strict";
import test from "node:test";
import { IDENTITY_PERMISSION_CATALOG } from "@athyper/server-contract-metadata";
import { buildCanonicalCatalogV2 } from "../../seed/canonical-catalog-v2-model.js";
import { buildExactScopeCompatibility } from "../../seed/exact-scope-compatibility-model.js";

test("identity capabilities have stable IDs and exact tenant scope on all planes", () => {
  for (const [canonicalCode, riskTier] of Object.entries(
    IDENTITY_PERMISSION_CATALOG,
  )) {
    const ids = new Set<string>();
    for (const plane of ["studio", "neon", "mesh"] as const) {
      const { catalog } = buildCanonicalCatalogV2({
        plane,
        permissions: [
          {
            canonicalCode,
            permissionKind: "capability",
            riskTier,
            requiresMfa: false,
          },
        ],
      });
      ids.add(catalog.permissions[0]!.permissionId);
      assert.deepEqual(
        buildExactScopeCompatibility({
          plane,
          permissionCodes: [canonicalCode],
        }).permissions[0]!.scopes,
        [{ kind: "tenant", propagation: "exact" }],
      );
      assert.throws(() =>
        buildExactScopeCompatibility({
          plane,
          permissionCodes: [canonicalCode],
          requiredScopesByPermission: {
            [canonicalCode]: [{ kind: "company_code", propagation: "exact" }],
          },
        }),
      );
    }
    assert.equal(ids.size, 1);
  }
});
test("the identity namespace does not allow new permissions or reduced administrator risk", () => {
  for (const canonicalCode of [
    "common.identity.principal.delete",
    "common.identity.principal.administer",
  ]) {
    assert.throws(() =>
      buildCanonicalCatalogV2({
        plane: "neon",
        permissions: [
          {
            canonicalCode,
            permissionKind: "capability",
            riskTier: "low",
            requiresMfa: false,
          },
        ],
      }),
    );
  }
});
