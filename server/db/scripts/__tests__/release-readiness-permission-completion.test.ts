import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const databaseRoot = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFile(resolve(databaseRoot, path), "utf8");

test("forward migrations complete Business Partner readiness permissions", async () => {
  const [migration, manifest] = await Promise.all([
    read("migrations/20260829_neon_business_partner_permission_catalog_completion.sql"),
    read("migrations/manifests/neon.txt"),
  ]);
  for (const permission of [
    "neon.business_partner_profile_match.create",
    "neon.business_partner_profile_match.read",
    "neon.business_partner_profile_match.request",
    "neon.relationship.business_partner.activate",
  ]) assert.match(migration, new RegExp(permission.replaceAll(".", "\\.")));
  assert.match(migration, /requires_mfa[\s\S]*requires_sod/);
  assert.match(migration, /operating_organization[\s\S]*subtree/);
  assert.match(manifest, /^20260829_neon_business_partner_permission_catalog_completion\.sql$/m);
});

test("Atlas conversation access remains private but executable by runtime roles", async () => {
  const [migration, grants, studio, neon, mesh] = await Promise.all([
    read("migrations/20260829_atlas_conversation_access_grants.sql"),
    read("ddl/common/ai/11_grants.sql"),
    read("migrations/manifests/studio.txt"),
    read("migrations/manifests/neon.txt"),
    read("migrations/manifests/mesh.txt"),
  ]);
  for (const source of [migration, grants]) {
    assert.match(source, /REVOKE ALL ON FUNCTION ai\.fn_atlas_conversation_access\(uuid, uuid, boolean\) FROM PUBLIC/);
    assert.match(source, /GRANT EXECUTE ON FUNCTION ai\.fn_atlas_conversation_access\(uuid, uuid, boolean\) TO athyperapp/);
  }
  for (const manifest of [studio, neon, mesh]) {
    assert.match(manifest, /^20260829_atlas_conversation_access_grants\.sql$/m);
  }
});
