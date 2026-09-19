import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildR2DatabaseFixtures } from "../../provisioning/provision-business-partner-r2-fixtures.js";

describe("R2 resettable database fixture plan", () => {
  it("provides four stable and distinct target identities", () => {
    const fixtures = buildR2DatabaseFixtures();
    assert.deepEqual(
      fixtures.map((item) => item.scenario),
      ["BP-SUP-002", "BP-SUP-003", "BP-CUS-002", "BP-CUS-003"],
    );
    assert.equal(
      new Set(fixtures.map((item) => item.businessPartnerId)).size,
      4,
    );
  });

  it("pins the expected existing and requested role states", () => {
    assert.deepEqual(
      buildR2DatabaseFixtures().map(({ existingRole, requestedRole }) => ({
        existingRole,
        requestedRole,
      })),
      [
        { existingRole: "none", requestedRole: "supplier" },
        { existingRole: "customer", requestedRole: "supplier" },
        { existingRole: "none", requestedRole: "customer" },
        { existingRole: "supplier", requestedRole: "customer" },
      ],
    );
  });

  it("leaves role-free identities unassigned until governed materialization", () => {
    for (const fixture of buildR2DatabaseFixtures())
      assert.equal(
        fixture.assignmentId !== undefined,
        fixture.existingRole !== "none",
      );
  });
});
