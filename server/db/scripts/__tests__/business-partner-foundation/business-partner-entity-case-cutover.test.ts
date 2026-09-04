import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const repository = readFileSync(
  new URL("../../../../packages/services/master-data/src/kysely-business-partner-case-repository.ts", import.meta.url),
  "utf8",
);
const invitation = readFileSync(
  new URL("../../../../packages/services/master-data/src/kysely-business-partner-invitation-repository.ts", import.meta.url),
  "utf8",
);
const mesh = readFileSync(
  new URL("../../../../packages/planes/neon/src/business-partner-profile-match.ts", import.meta.url),
  "utf8",
);
const runtime = readFileSync(
  new URL("../../../ddl/planes/neon/document/07_functions.sql", import.meta.url),
  "utf8",
);
const retirement = readFileSync(
  new URL("../../../ddl/planes/neon/document/11_grants.sql", import.meta.url),
  "utf8",
);
const generated = readFileSync(
  new URL("../../../../packages/adapters/database/neon-postgres/src/generated/kysely/types.ts", import.meta.url),
  "utf8",
);

describe("Business Partner entity-case cutover", () => {
  it("uses entity_case as the only request lifecycle persistence port", () => {
    assert.match(repository, /document\.entity_case/);
    assert.match(repository, /document\.command_entity_case_draft/);
    assert.match(repository, /document\.command_entity_case_validation/);
    assert.match(repository, /document\.command_entity_case_lifecycle/);
    assert.doesNotMatch(repository, /document\.business_partner_request/);
  });

  it("binds invitation and Mesh replay evidence to entity_case_id", () => {
    assert.match(invitation, /entity_case_id/);
    assert.doesNotMatch(invitation, /business_partner_request_id/);
    assert.match(mesh, /case_created/);
    assert.match(mesh, /entity_case_id/);
    assert.match(mesh, /to_jsonb\(event\)->>'business_partner_request_id'/);
    assert.doesNotMatch(mesh, /event\.business_partner_request_id/);
  });

  it("supports validation, correction, maker-checker decisions, and replay", () => {
    assert.match(runtime, /'submit','approve','reject','return'/);
    assert.match(runtime, /ENTITY_CASE_RETURNED/);
    assert.match(runtime, /entity\.case\.validation/);
    assert.match(runtime, /request_fingerprint<>fingerprint/);
  });

  it("retires legacy canonical objects and generated types", () => {
    assert.match(retirement, /DROP TABLE IF EXISTS document\.business_partner_request CASCADE/);
    assert.doesNotMatch(generated, /export type business_partner_request(?:_| =)/);
    assert.doesNotMatch(generated, /"document\.business_partner_request"/);
  });
});
