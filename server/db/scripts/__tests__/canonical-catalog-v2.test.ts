import assert from "node:assert/strict";
import test from "node:test";

import { buildCanonicalCatalogV2, deterministicPermissionId } from "../seed/canonical-catalog-v2-model.js";

const sourcePermission = {
  canonicalCode: "studio.metadata.contract_draft.create",
  permissionKind: "capability",
  riskTier: "medium",
  requiresMfa: false,
};

test("creates exact four-coordinate codes and deterministic IDs", () => {
  const first = buildCanonicalCatalogV2({ plane: "studio", permissions: [sourcePermission] });
  const second = buildCanonicalCatalogV2({ plane: "studio", permissions: [sourcePermission] });
  const permission = first.catalog.permissions[0]!;
  assert.equal(permission.canonicalCode, sourcePermission.canonicalCode);
  assert.equal(permission.permissionId, deterministicPermissionId(permission.canonicalCode));
  assert.deepEqual(first.catalog, second.catalog);
  assert.match(permission.permissionId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("rejects incomplete and cross-plane permission coordinates", () => {
  assert.throws(
    () => buildCanonicalCatalogV2({ plane: "studio", permissions: [{ ...sourcePermission, canonicalCode: "metadata.contract_draft.create" }] }),
    /exact plane\.domain\.entity\.operation/,
  );
  assert.throws(
    () => buildCanonicalCatalogV2({ plane: "studio", permissions: [{ ...sourcePermission, canonicalCode: "neon.metadata.contract_draft.create" }] }),
    /exact plane\.domain\.entity\.operation/,
  );
});

test("rejects legacy and generic action permission identities", () => {
  assert.throws(
    () => buildCanonicalCatalogV2({ plane: "neon", permissions: [{ ...sourcePermission, canonicalCode: "legacy.action.read" }] }),
    /exact plane\.domain\.entity\.operation/,
  );
  assert.throws(
    () => buildCanonicalCatalogV2({ plane: "neon", permissions: [{ ...sourcePermission, canonicalCode: "neon.action.read" }] }),
    /exact plane\.domain\.entity\.operation/,
  );
});

test("rejects duplicate canonical permission identities", () => {
  assert.throws(
    () => buildCanonicalCatalogV2({ plane: "studio", permissions: [sourcePermission, sourcePermission] }),
    /duplicate studio canonical permission/,
  );
});
