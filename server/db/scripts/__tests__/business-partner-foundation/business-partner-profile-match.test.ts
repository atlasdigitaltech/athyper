import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("WP11 persists pinned match, selective acceptance and recoverable request link", () => {
  const migration = read(
    "migrations/20260828_neon_mesh_business_partner_match_request.sql",
  );
  for (const value of [
    "document.mesh_business_partner_match",
    "document.mesh_business_partner_acceptance",
    "document.mesh_business_partner_acceptance_event",
    "business_partner_request_source_projection_fk",
    "UNIQUE NULLS NOT DISTINCT",
    "FORCE ROW LEVEL SECURITY",
    "trg_mesh_business_partner_match_immutable",
  ])
    assert.match(migration, new RegExp(value.replaceAll(".", "\\."), "i"));
});
test("WP11 adapter cannot directly mutate Business Partner master data", () => {
  const service = read(
    "../packages/planes/neon/src/business-partner-profile-match.ts",
  );
  assert.doesNotMatch(
    service,
    /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+master\.(?:business_partner|supplier|customer)\b/i,
  );
  assert.match(service, /businessPartnerRequests\.create/);
});
test("WP11 pins algorithm, snapshot and an explicit non-sensitive allowlist", () => {
  const service = read(
    "../packages/planes/neon/src/business-partner-profile-match.ts",
  );
  for (const value of [
    "mesh_business_partner_candidate_v1",
    "sourcePayloadHash",
    "partner.legalName",
    "partner.countryCode",
    "MESH_PROFILE_SNAPSHOT_NOT_ACTIVE",
  ])
    assert.match(service, new RegExp(value.replaceAll(".", "\\.")));
  for (const forbidden of [
    "bankAccount",
    "iban",
    "taxIdentifier",
    "email",
    "phone",
  ])
    assert.doesNotMatch(service, new RegExp(`partner\\.${forbidden}`));
});
test("WP11 migration and permission seed are ordered only in NEON", () => {
  assert.match(
    read("migrations/manifests/neon.txt"),
    /20260828_neon_mesh_business_partner_match_request\.sql/,
  );
  assert.match(
    read("ddl/planes/neon/_manifest.txt"),
    /18_business_partner_profile_match_permission_reference_seed\.sql/,
  );
  assert.doesNotMatch(
    read("migrations/manifests/mesh.txt"),
    /business_partner_match_request/,
  );
  assert.doesNotMatch(
    read("migrations/manifests/studio.txt"),
    /business_partner_match_request/,
  );
});
