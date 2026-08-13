import assert from "node:assert/strict";
import test from "node:test";
import {
  planKeycloakReconciliation,
  planTenantOrganizationReconciliation,
} from "./reconcile-keycloak-authorization-v2.mjs";

test("reconciler is additive and leaves unmanaged users/resources untouched", () => {
  const current = {
    clients: [
      { id: "client-1", clientId: "neon-web", enabled: true },
      { id: "unmanaged-client", clientId: "customer-owned", enabled: true },
    ],
    groups: [
      {
        id: "group-1",
        name: "grp:workbench:user",
        attributes: { "customer.attribute": ["preserve-me"] },
      },
      { id: "unmanaged-group", name: "customer-group", attributes: {} },
    ],
    users: [{ id: "unmanaged-user", username: "customer.user" }],
  };
  const desired = {
    contractVersion: "wave6.keycloak-additive.v1",
    realm: "athyper",
    clients: [
      {
        clientId: "neon-web",
        createIfMissing: false,
        expected: { enabled: true },
      },
    ],
    groups: [
      {
        name: "grp:workbench:user",
        attributes: { "athyper.authorization-v2.managed": ["true"] },
      },
      {
        name: "grp:workbench:partner",
        attributes: { "athyper.authorization-v2.managed": ["true"] },
      },
    ],
    destructiveOperations: [],
    userOperations: [],
  };

  const plan = planKeycloakReconciliation(current, desired);
  assert.equal(plan.deletes, 0);
  assert.equal(plan.userMutations, 0);
  assert.equal(plan.unmanagedResourcesPreserved, true);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.operations.length, 2);
  const patch = plan.operations.find((operation) => operation.kind === "patch");
  assert.deepEqual(
    patch.body.attributes["customer.attribute"],
    ["preserve-me"],
  );
  assert.equal(
    JSON.stringify(plan).includes("unmanaged-user"),
    false,
  );
});

test("existing client field drift fails instead of being overwritten", () => {
  const plan = planKeycloakReconciliation(
    { clients: [{ clientId: "mesh-web", enabled: false }], groups: [] },
    {
      contractVersion: "wave6.keycloak-additive.v1",
      realm: "athyper",
      clients: [
        {
          clientId: "mesh-web",
          createIfMissing: false,
          expected: { enabled: true },
        },
      ],
      groups: [],
      destructiveOperations: [],
      userOperations: [],
    },
  );
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.operations[0].kind, "conflict");
});

test("tenant organizations use stable tenant UUID aliases and preserve legal-entity organizations", () => {
  const manifest = {
    contractVersion: "athyper.three-plane-provision.v1",
    realmKey: "athyper",
    keycloak: {
      organizationModel: "tenant",
      businessScopesRemainPlaneLocal: true,
    },
    tenants: [
      { id: "11111111-1111-4111-8111-111111111111", code: "athyper", displayName: "Athyper", keycloakOrganizationAlias: "11111111-1111-4111-8111-111111111111" },
      { id: "22222222-2222-4222-8222-222222222222", code: "technostat", displayName: "Technostat", keycloakOrganizationAlias: "22222222-2222-4222-8222-222222222222" },
      { id: "44444444-4444-4444-8444-444444444444", code: "cirrusatlantic", displayName: "CirrusAtlantic", keycloakOrganizationAlias: "44444444-4444-4444-8444-444444444444" },
    ],
  };
  const plan = planTenantOrganizationReconciliation([
    { id: "legacy-org", alias: "ORG-1000000001", name: "Legal entity fixture" },
    {
      id: "tenant-org",
      alias: "11111111-1111-4111-8111-111111111111",
      name: "Old Athyper Name",
      enabled: true,
      attributes: { "customer.attribute": ["preserved"] },
    },
  ], manifest, "athyper");
  assert.equal(plan.tenantOrganizationCount, 3);
  assert.equal(plan.legalEntityOrganizationsMutated, 0);
  assert.equal(plan.deletes, 0);
  assert.equal(plan.operations.length, 3);
  const patch = plan.operations.find((operation) => operation.kind === "patch");
  assert.deepEqual(patch.body.attributes["customer.attribute"], ["preserved"]);
  assert.equal(JSON.stringify(plan).includes("legacy-org"), false);
});
