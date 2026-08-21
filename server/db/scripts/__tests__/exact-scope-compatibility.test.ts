import assert from "node:assert/strict";
import test from "node:test";
import { buildExactScopeCompatibility, validateExactScopeCompatibility } from "../seed/exact-scope-compatibility-model.js";

test("declares exact permission-specific Neon scopes", () => {
  const code = "neon.procurement.purchase_invoice.read";
  const contract = buildExactScopeCompatibility({ plane: "neon", permissionCodes: [code] });
  assert.deepEqual(contract.permissions[0], { permissionCode: code, scopes: [
    { kind: "tenant", propagation: "exact" },
    { kind: "legal_entity", propagation: "exact" },
    { kind: "operating_organization", propagation: "subtree" },
  ] });
});

test("declares legal entity and subtree organization scopes only for evidenced Neon domains", () => {
  const code = "neon.relationship.business_partner.read";
  const contract = buildExactScopeCompatibility({ plane: "neon", permissionCodes: [code] });
  assert.deepEqual(contract.permissions[0]?.scopes, [
    { kind: "tenant", propagation: "exact" },
    { kind: "legal_entity", propagation: "exact" },
    { kind: "operating_organization", propagation: "subtree" },
  ]);
});

test("declares independent Neon catalog visibility coordinates without member-company propagation", () => {
  const code = "neon.context.catalog.read";
  const contract = buildExactScopeCompatibility({ plane: "neon", permissionCodes: [code] });
  assert.deepEqual(contract.permissions[0]?.scopes, [
    { kind: "tenant", propagation: "exact" },
    { kind: "legal_entity", propagation: "exact" },
    { kind: "company_code", propagation: "exact" },
    { kind: "operating_organization", propagation: "subtree" },
  ]);
  assert.equal(contract.permissions[0]?.scopes.some((scope) => scope.propagation === "member_companies"), false);
});

test("rejects non-canonical permission identities", () => {
  assert.throws(
    () => buildExactScopeCompatibility({ plane: "neon", permissionCodes: ["relationship.business_partner.read"] }),
    /must be exact neon\.domain\.entity\.operation/,
  );
});

test("rejects incomplete declarations and cross-plane scope kinds", () => {
  const contract = buildExactScopeCompatibility({ plane: "studio", permissionCodes: ["studio.metadata.contract.view"] });
  assert.throws(() => validateExactScopeCompatibility(contract, ["studio.metadata.contract.view", "studio.metadata.contract.edit"]), /coverage mismatch/);
  const invalid = structuredClone(contract);
  invalid.permissions[0]!.scopes = [{ kind: "legal_entity", propagation: "exact" }];
  assert.throws(() => validateExactScopeCompatibility(invalid, ["studio.metadata.contract.view"]), /not supported by studio/);
});

test("rejects broad propagation for exact-only scope kinds", () => {
  const contract = buildExactScopeCompatibility({ plane: "mesh", permissionCodes: ["mesh.catalog.attachment.read"] });
  const invalid = structuredClone(contract);
  invalid.permissions[0]!.scopes = [{ kind: "resource", propagation: "subtree" }];
  assert.throws(() => validateExactScopeCompatibility(invalid, ["mesh.catalog.attachment.read"]), /resource requires exact propagation/);
});
