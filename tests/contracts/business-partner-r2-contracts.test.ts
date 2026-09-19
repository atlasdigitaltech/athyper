import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../packages/contracts/platform/fixtures/business-partner-r2-role-extension.v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  $schema: string;
  scenarios: Array<{
    id: string;
    existingRoles: string[];
    requestedRole: string;
    expectedInitialStatus: string;
  }>;
  invariants: Record<string, unknown>;
};

test("R2 freezes all existing and dual-role outcomes", () => {
  assert.equal(fixture.$schema, "athyper.business-partner-r2-fixture/1");
  assert.deepEqual(
    fixture.scenarios.map((scenario) => scenario.id),
    ["BP-SUP-002", "BP-SUP-003", "BP-CUS-002", "BP-CUS-003"],
  );
  for (const scenario of fixture.scenarios) {
    assert.ok(!scenario.existingRoles.includes(scenario.requestedRole));
    assert.equal(
      scenario.expectedInitialStatus,
      scenario.requestedRole === "supplier" ? "onboarding" : "prospect",
    );
  }
});

test("R2 forbids identity duplication and authority crossover", () => {
  assert.deepEqual(fixture.invariants, {
    reuseTargetBusinessPartnerId: true,
    createBusinessPartnerCount: 0,
    createRequestedRoleCount: 1,
    preserveOppositeRole: true,
    preserveOppositeRoleStatus: true,
    preserveOppositeRoleDecisions: true,
    automaticRoleActivation: false,
  });
});
