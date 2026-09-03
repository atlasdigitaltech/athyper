import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const dbRoot = resolve(import.meta.dirname, "../../..");
const canonicalPath = resolve(
  dbRoot,
  "ddl/planes/mesh/mesh/13_exchange_integrity_hardening.sql",
);
const migrationPath = resolve(
  dbRoot,
  "migrations/20260903_mesh_exchange_integrity_hardening.sql",
);
const canonical = readFileSync(canonicalPath, "utf8").trim();
const migration = readFileSync(migrationPath, "utf8")
  .replace(/^BEGIN;\s*/u, "")
  .replace(/\s*COMMIT;\s*$/u, "")
  .trim();

describe("Mesh exchange-integrity hardening", () => {
  it("bootstraps the administrative role without login or RLS bypass", () => {
    const roles = readFileSync(
      resolve(dbRoot, "ddl/common/_database/01_service_roles.sql"),
      "utf8",
    );
    assert.match(roles, /CREATE ROLE athyperadmin\s+NOLOGIN[^;]+NOBYPASSRLS;/su);
  });

  it("keeps clean provisioning and forward migration definitions identical", () => {
    assert.equal(migration, canonical);
  });

  it("owns lifecycle writes through versioned exact-replay commands", () => {
    for (const contract of [
      "row_version bigint NOT NULL DEFAULT 1",
      "network_command_evidence_idempotency_uq",
      "command_fingerprint char(64)",
      "FOR UPDATE",
      "pg_advisory_xact_lock",
      "different command",
      "trg_enforce_network_command",
      "REVOKE UPDATE ON mesh.network_account, mesh.network_relationship",
    ]) assert.ok(canonical.includes(contract), `missing ${contract}`);
  });

  it("requires counterparty acceptance and supports non-overlapping episodes", () => {
    assert.match(
      canonical,
      /p_action = 'accept'[\s\S]+v_actor_tenant_id <> v_relationship\.created_by_tenant_id/u,
    );
    assert.match(canonical, /CREATE TABLE mesh\.network_relationship_identity/u);
    assert.match(canonical, /network_relationship_identity_episode_uq/u);
    assert.match(canonical, /network_relationship_effective_period_excl/u);
    assert.match(canonical, /DROP CONSTRAINT network_relationship_coordinate_uq/u);
  });

  it("freezes published catalogs and rejects overlapping active prices", () => {
    assert.match(canonical, /CREATE TABLE mesh\.catalog_revision/u);
    assert.match(canonical, /trg_guard_published_catalog_content/u);
    assert.match(canonical, /catalog_price_effective_quantity_excl/u);
    assert.match(canonical, /CREATE OR REPLACE FUNCTION mesh\.command_publish_catalog/u);
  });

  it("separates document participant actions and fingerprints requests", () => {
    assert.match(canonical, /request_fingerprint char\(64\)/u);
    assert.match(canonical, /CREATE OR REPLACE FUNCTION mesh\.command_submit_document_envelope/u);
    assert.match(canonical, /Only the sender may submit a document envelope/u);
    assert.match(canonical, /p_actor_kind NOT IN \('sender','receiver','routing_service'\)/u);
    assert.match(canonical, /Routing transition requires the projection-applier role/u);
    assert.match(canonical, /REVOKE UPDATE[\s\S]+mesh\.document_envelope/u);
    assert.match(canonical, /REVOKE INSERT ON mesh\.document_envelope/u);
  });

  it("bounds all reviewed Mesh extension payloads", () => {
    for (const constraint of [
      "network_account_capabilities_size_chk",
      "network_relationship_metadata_size_chk",
      "catalog_item_metadata_size_chk",
      "document_envelope_metadata_size_chk",
      "document_event_payload_size_chk",
      "network_lifecycle_event_evidence_size_chk",
      "certification_metadata_size_chk",
    ]) assert.ok(canonical.includes(constraint), `missing ${constraint}`);
  });
});
