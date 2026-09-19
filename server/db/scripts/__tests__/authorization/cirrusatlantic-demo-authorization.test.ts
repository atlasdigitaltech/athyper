import assert from "node:assert/strict";
import test from "node:test";

import {
  CIRRUSATLANTIC_CONTEXT_PERMISSION,
  CIRRUSATLANTIC_DEMO_PERSONAS,
  CIRRUSATLANTIC_NORTHWIND_ACCOUNT_LINK,
  CIRRUSATLANTIC_OWNER_REVIEWER,
  validateCirrusAtlanticDemoAuthorizationModel,
} from "../../provisioning/cirrusatlantic-demo-authorization-model.js";

test("CirrusAtlantic demo authorization gives all three users explicit business coordinates", () => {
  assert.doesNotThrow(validateCirrusAtlanticDemoAuthorizationModel);
  assert.equal(CIRRUSATLANTIC_CONTEXT_PERMISSION, "neon.context.catalog.read");
  assert.deepEqual(
    CIRRUSATLANTIC_DEMO_PERSONAS.map((persona) => persona.username),
    ["catl.admin", "catl.owner", "catl.finance"],
  );
  for (const persona of CIRRUSATLANTIC_DEMO_PERSONAS) {
    assert.deepEqual(
      new Set(persona.scopes.map((scope) => scope.kind)),
      new Set([
        ...(persona.username === "catl.admin" ? ["tenant"] : []),
        "legal_entity",
        "company_code",
        "operating_organization",
      ]),
    );
    assert.equal(
      persona.scopes.some(
        (scope) => (scope.propagation as string) === "member_companies",
      ),
      false,
    );
  }
  assert.equal(CIRRUSATLANTIC_OWNER_REVIEWER.username, "catl.owner");
  assert.deepEqual(CIRRUSATLANTIC_OWNER_REVIEWER.permissions, [
    "neon.relationship.business_partner.read",
    "neon.relationship.entity_case.read",
    "neon.relationship.entity_case.decide",
    "workflow.work_item.read",
  ]);
  assert.deepEqual(CIRRUSATLANTIC_OWNER_REVIEWER.scope, {
    kind: "operating_organization",
    key: "operating_organization:catl.operations",
    propagation: "subtree",
  });
  assert.equal(CIRRUSATLANTIC_NORTHWIND_ACCOUNT_LINK.requester.username, "catl.admin");
  assert.deepEqual(CIRRUSATLANTIC_NORTHWIND_ACCOUNT_LINK.requester.permissions, [
    "neon.mesh_account_link.read",
    "neon.mesh_account_link.request",
  ]);
  assert.equal(CIRRUSATLANTIC_NORTHWIND_ACCOUNT_LINK.reviewer.username, "catl.owner");
  assert.deepEqual(CIRRUSATLANTIC_NORTHWIND_ACCOUNT_LINK.reviewer.permissions, [
    "neon.mesh_account_link.read",
    "neon.mesh_account_link.decide",
  ]);
  assert.equal(CIRRUSATLANTIC_NORTHWIND_ACCOUNT_LINK.scope.propagation, "exact");
  assert.deepEqual(CIRRUSATLANTIC_NORTHWIND_ACCOUNT_LINK.projectionReader, {
    username: "catl.owner",
    roleCode: "catl.demo.business_partner_profile_projection_reader",
    roleName: "CirrusAtlantic Business Partner Profile Projection Reader",
    permissions: ["neon.business_partner_profile_projection.read"],
  });
});
