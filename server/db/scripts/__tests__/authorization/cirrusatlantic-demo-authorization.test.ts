import assert from "node:assert/strict";
import test from "node:test";

import {
  CIRRUSATLANTIC_CONTEXT_PERMISSION,
  CIRRUSATLANTIC_DEMO_PERSONAS,
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
});
