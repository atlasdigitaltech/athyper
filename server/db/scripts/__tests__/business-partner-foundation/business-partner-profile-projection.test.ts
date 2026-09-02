import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
test("WP10 provides immutable inbox, attempts and snapshots plus a tenant-local projection head", () => {
  const migration = read(
    "migrations/20260828_neon_mesh_business_partner_profile_projection.sql",
  );
  for (const value of [
    "control.mesh_business_partner_profile_inbox",
    "control.mesh_business_partner_profile_processing_attempt",
    "snapshot.mesh_business_partner_profile_received",
    "control.mesh_business_partner_profile_projection",
    "MESH Business Partner inbox and processing evidence are immutable",
    "FORCE ROW LEVEL SECURITY",
    "neon.business_partner_profile_projection.replay",
  ])
    assert.match(migration, new RegExp(value.replaceAll(".", "\\.")));
});
test("WP10 does not bind the recipient projection to or mutate the NEON Business Partner master", () => {
  const migration = read(
    "migrations/20260828_neon_mesh_business_partner_profile_projection.sql",
  );
  const service = read(
    "../packages/planes/neon/src/business-partner-profile-projection.ts",
  );
  assert.doesNotMatch(migration, /REFERENCES\s+master\.business_partner/i);
  assert.doesNotMatch(
    `${migration}\n${service}`,
    /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+master\.business_partner\b/i,
  );
});
test("WP10 uses a forward-only MESH payload-guard correction", () => {
  const correction = read(
    "migrations/20260828_mesh_business_partner_profile_payload_guard_correction.sql",
  );
  assert.match(correction, /commodityCapabilities/);
  assert.match(correction, /bankAccount/);
  assert.match(
    read("migrations/manifests/mesh.txt"),
    /20260828_mesh_business_partner_profile_payload_guard_correction\.sql/,
  );
});
