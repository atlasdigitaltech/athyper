import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const materializer = readFileSync(
  new URL("../../../ddl/planes/neon/master/07_functions.sql", import.meta.url),
  "utf8",
);
const repository = readFileSync(
  new URL(
    "../../../../packages/services/master-data/src/kysely-business-partner-case-repository.ts",
    import.meta.url,
  ),
  "utf8",
);

describe("R2 governed role extension", () => {
  it("locks and reuses the active target identity while rejecting an existing role", () => {
    assert.match(repository, /bp\.status='active'/);
    assert.match(repository, /FOR SHARE/);
    assert.match(repository, /BUSINESS_PARTNER_ROLE_ALREADY_EXISTS/);
    assert.match(
      materializer,
      /bp_id:=current_case\.target_entity_id;[\s\S]*SELECT \* INTO bp[\s\S]*FOR UPDATE/,
    );
    assert.match(materializer, /Target Business Partner is not eligible/);
  });

  it("creates exactly the requested thin role in its initial state", () => {
    assert.match(
      materializer,
      /IF requested_role='supplier' THEN[\s\S]*INSERT INTO master\.supplier/,
    );
    assert.match(materializer, /'onboarding',p_actor_id/);
    assert.match(materializer, /ELSE[\s\S]*INSERT INTO master\.customer/);
    assert.match(materializer, /'prospect',p_actor_id/);
    assert.doesNotMatch(materializer, /INTO role_lifecycle/);
  });

  it("retains role-specific approved data and produces identity-reuse evidence", () => {
    assert.match(materializer, /payload->>'supplierType'/);
    assert.match(materializer, /payload->>'customerType'/);
    assert.match(
      materializer,
      /'businessPartnerId',bp_id,'roleId',new_role_id,'role',requested_role/,
    );
    assert.match(materializer, /authorityEvidenceId',authority_evidence_id/);
  });
});
