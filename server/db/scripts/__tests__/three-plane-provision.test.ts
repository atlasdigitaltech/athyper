import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ddlNativeRoleAllows } from "../provisioning/authorization-pack-applicator.js";
import {
  deterministicUuid,
  legalEntityResources,
  loadProvisionInputs,
  networkAccountResources,
  planeAssignments,
  planeOrder,
} from "../provisioning/three-plane-model.js";

describe("canonical three-plane provisioning contract", () => {
  it("plans exactly three stable tenant contexts in Studio, Neon, and Mesh", async () => {
    const inputs = await loadProvisionInputs();
    assert.deepEqual(inputs.manifest.tenants.map((tenant) => tenant.code), [
      "athyper",
      "technostat",
      "cirrusatlantic",
    ]);
    for (const tenant of inputs.manifest.tenants) {
      assert.equal(tenant.keycloakOrganizationAlias, tenant.id);
    }
    assert.deepEqual(planeOrder(), ["studio", "neon", "mesh"]);
  });

  it("resolves every scoped authorization resource before database application", async () => {
    const inputs = await loadProvisionInputs();
    assert.equal(legalEntityResources(inputs).length, 22);
    assert.equal(networkAccountResources(inputs).length, 24);
    const tenantCodes = new Set(inputs.manifest.tenants.map((tenant) => tenant.code));
    assert.equal(planeAssignments(inputs.authorizationPacks.studio, "studio", tenantCodes).length, 46);
    assert.equal(planeAssignments(inputs.authorizationPacks.neon, "neon", tenantCodes).length, 139);
    assert.equal(planeAssignments(inputs.authorizationPacks.mesh, "mesh", tenantCodes).length, 47);
  });

  it("derives tenant-local IDs instead of reusing Keycloak subjects", () => {
    const subject = "aa010107-0000-0000-0000-000000000000";
    const athyper = deterministicUuid("neon", "athyper", "principal", subject);
    const technostat = deterministicUuid("neon", "technostat", "principal", subject);
    const mesh = deterministicUuid("mesh", "athyper", "principal", subject);
    assert.notEqual(athyper, subject);
    assert.notEqual(athyper, technostat);
    assert.notEqual(athyper, mesh);
    assert.match(athyper, /^[0-9a-f-]{36}$/);
  });

  it("keeps DDL-native role policy bounded and explicit", () => {
    assert.equal(ddlNativeRoleAllows("neon.access.viewer", "records.invoice.read", "low"), true);
    assert.equal(ddlNativeRoleAllows("neon.access.viewer", "records.invoice.delete", "high"), false);
    assert.equal(ddlNativeRoleAllows("neon.access.requester", "records.invoice.create", "medium"), true);
    assert.equal(ddlNativeRoleAllows("neon.access.requester", "records.invoice.delete", "critical"), false);
    assert.equal(ddlNativeRoleAllows("neon.access.admin", "records.invoice.delete", "critical"), true);
  });
});
