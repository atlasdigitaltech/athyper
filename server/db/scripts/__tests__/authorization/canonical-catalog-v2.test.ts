import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildCanonicalCatalogV2,
  deterministicPermissionId,
} from "../../seed/canonical-catalog-v2-model.js";

const databaseRoot = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFile(resolve(databaseRoot, path), "utf8");

const sourcePermission = {
  canonicalCode: "studio.metadata.contract_draft.create",
  permissionKind: "capability",
  riskTier: "medium",
  requiresMfa: false,
};

test("creates exact four-coordinate codes and deterministic IDs", () => {
  const first = buildCanonicalCatalogV2({
    plane: "studio",
    permissions: [sourcePermission],
  });
  const second = buildCanonicalCatalogV2({
    plane: "studio",
    permissions: [sourcePermission],
  });
  const permission = first.catalog.permissions[0]!;
  assert.equal(permission.canonicalCode, sourcePermission.canonicalCode);
  assert.equal(
    permission.permissionId,
    deterministicPermissionId(permission.canonicalCode),
  );
  assert.deepEqual(first.catalog, second.catalog);
  assert.match(
    permission.permissionId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test("rejects incomplete and cross-plane permission coordinates", () => {
  assert.throws(
    () =>
      buildCanonicalCatalogV2({
        plane: "studio",
        permissions: [
          {
            ...sourcePermission,
            canonicalCode: "metadata.contract_draft.create",
          },
        ],
      }),
    /exact plane\.domain\.entity\.operation/,
  );
  assert.throws(
    () =>
      buildCanonicalCatalogV2({
        plane: "studio",
        permissions: [
          {
            ...sourcePermission,
            canonicalCode: "neon.metadata.contract_draft.create",
          },
        ],
      }),
    /exact plane\.domain\.entity\.operation/,
  );
});

test("rejects legacy and generic action permission identities", () => {
  assert.throws(
    () =>
      buildCanonicalCatalogV2({
        plane: "neon",
        permissions: [
          { ...sourcePermission, canonicalCode: "legacy.action.read" },
        ],
      }),
    /exact plane\.domain\.entity\.operation/,
  );
  assert.throws(
    () =>
      buildCanonicalCatalogV2({
        plane: "neon",
        permissions: [
          { ...sourcePermission, canonicalCode: "neon.action.read" },
        ],
      }),
    /exact plane\.domain\.entity\.operation/,
  );
});

test("rejects duplicate canonical permission identities", () => {
  assert.throws(
    () =>
      buildCanonicalCatalogV2({
        plane: "studio",
        permissions: [sourcePermission, sourcePermission],
      }),
    /duplicate studio canonical permission/,
  );
});

test("forward migrations complete Business Partner readiness permissions", async () => {
  const [migration, manifest] = await Promise.all([
    read(
      "migrations/20260829_neon_business_partner_permission_catalog_completion.sql",
    ),
    read("migrations/manifests/neon.txt"),
  ]);
  for (const permission of [
    "neon.business_partner_profile_match.create",
    "neon.business_partner_profile_match.read",
    "neon.business_partner_profile_match.request",
    "neon.relationship.business_partner.activate",
  ]) {
    assert.match(migration, new RegExp(permission.replaceAll(".", "\\.")));
  }
  assert.match(migration, /requires_mfa[\s\S]*requires_sod/);
  assert.match(migration, /operating_organization[\s\S]*subtree/);
  assert.match(
    manifest,
    /^20260829_neon_business_partner_permission_catalog_completion\.sql$/m,
  );
});
