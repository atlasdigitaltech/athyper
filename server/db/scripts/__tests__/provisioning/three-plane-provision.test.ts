import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deterministicUuid,
  legalEntityResources,
  loadProvisionInputs,
  networkAccountResources,
  planeAssignments,
  planeOrder,
} from "../../provisioning/three-plane-model.js";

describe("canonical three-plane provisioning contract", () => {
  it("plans exactly three stable tenant contexts in Studio, Neon, and Mesh", async () => {
    const inputs = await loadProvisionInputs();
    assert.deepEqual(
      inputs.manifest.tenants.map((tenant) => tenant.code),
      ["athyper", "technostat", "cirrusatlantic"],
    );
    for (const tenant of inputs.manifest.tenants) {
      assert.equal(tenant.keycloakOrganizationAlias, tenant.id);
      assert.deepEqual(tenant.subscriptionPlans, {
        studio: "platform_internal",
        neon: "erp_enterprise",
        mesh: "network_enterprise",
      });
    }
    assert.deepEqual(planeOrder(), ["studio", "neon", "mesh"]);
  });

  it("resolves every scoped authorization resource before database application", async () => {
    const inputs = await loadProvisionInputs();
    assert.equal(legalEntityResources(inputs).length, 22);
    const accounts = networkAccountResources(inputs);
    assert.equal(accounts.length, 46);
    const coreAccounts = new Set(
      Array.from({ length: 22 }, (_, index) =>
        String(1_000_000_001 + index),
      ).flatMap((suffix) => [`BNA-${suffix}`, `SNA-${suffix}`]),
    );
    assert.equal(
      accounts.filter((account) => coreAccounts.has(account.scopeKey)).length,
      44,
    );
    const tenantCodes = new Set(
      inputs.manifest.tenants.map((tenant) => tenant.code),
    );
    assert.equal(
      planeAssignments(inputs.authorizationPacks.studio, "studio", tenantCodes)
        .length,
      28,
    );
    assert.equal(
      planeAssignments(inputs.authorizationPacks.neon, "neon", tenantCodes)
        .length,
      151,
    );
    assert.equal(
      planeAssignments(inputs.authorizationPacks.mesh, "mesh", tenantCodes)
        .length,
      54,
    );
  });

  it("loads distinct simple, medium, and complex Neon tenant scenarios", async () => {
    const inputs = await loadProvisionInputs();
    assert.equal(inputs.scenarioPacks.cirrusatlantic?.complexity, "simple");
    assert.equal(inputs.scenarioPacks.technostat?.complexity, "medium");
    assert.equal(inputs.scenarioPacks.athyper?.complexity, "complex");
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(inputs.scenarioPacks).map(([code, pack]) => [
          code,
          {
            legalEntities: pack.legalEntities.length,
            companyCodes: pack.companyCodes.length,
            operatingOrganizations: pack.operatingOrganizations.length,
            organizationCompanyAssignments:
              pack.operatingOrganizationCompanyAssignments.length,
            orgUnits: pack.orgUnits.length,
          },
        ]),
      ),
      {
        athyper: {
          legalEntities: 17,
          companyCodes: 34,
          operatingOrganizations: 10,
          organizationCompanyAssignments: 102,
          orgUnits: 12,
        },
        technostat: {
          legalEntities: 4,
          companyCodes: 4,
          operatingOrganizations: 3,
          organizationCompanyAssignments: 12,
          orgUnits: 9,
        },
        cirrusatlantic: {
          legalEntities: 1,
          companyCodes: 1,
          operatingOrganizations: 1,
          organizationCompanyAssignments: 1,
          orgUnits: 3,
        },
      },
    );
    for (const pack of Object.values(inputs.scenarioPacks)) {
      assert.equal(
        pack.legalEntities.every((entity) => Boolean(entity.regionCode)),
        true,
      );
      assert.equal(
        pack.companyCodes.every(
          (company) => company.readinessProfile === "finance_baseline_v1",
        ),
        true,
      );
    }
    const athyper = inputs.scenarioPacks.athyper!;
    assert.equal(
      athyper.companyCodes.filter(
        (company) => company.companyPurpose === "operations",
      ).length,
      17,
    );
  });

  it("enriches authorization-backed legal entities from scenario data", async () => {
    const inputs = await loadProvisionInputs();
    const resources = legalEntityResources(inputs);
    const cirrus = resources.find(
      (resource) => resource.tenantCode === "cirrusatlantic",
    )!;
    const technostatEgypt = resources.find(
      (resource) => resource.scopeKey === "ORG-1000000020",
    )!;
    const athyperIndia = resources.find(
      (resource) => resource.scopeKey === "ORG-1000000010",
    )!;
    assert.deepEqual(
      [
        cirrus.registrationCountryCode,
        cirrus.functionalCurrency,
        cirrus.reportingCurrency,
      ],
      ["GB", "GBP", "GBP"],
    );
    assert.equal(technostatEgypt.parentScopeKey, "ORG-1000000018");
    assert.deepEqual(
      [athyperIndia.registrationCountryCode, athyperIndia.functionalCurrency],
      ["IN", "INR"],
    );
    assert.equal(athyperIndia.logoAssetRef, "/brand/tenants/athyper/aitm.png");
    assert.equal(
      resources.filter(
        (resource) =>
          resource.tenantCode === "athyper" && resource.logoAssetRef,
      ).length,
      17,
    );
    const athyperAccounts = networkAccountResources(inputs).filter(
      (account) => account.tenantCode === "athyper" && account.logoAssetRef,
    );
    assert.equal(athyperAccounts.length, 34);
    assert.equal(
      athyperAccounts.every((account) =>
        account.logoAssetRef?.startsWith("/brand/tenants/athyper/"),
      ),
      true,
    );
  });

  it("derives tenant-local IDs instead of reusing Keycloak subjects", () => {
    const subject = "aa010107-0000-0000-0000-000000000000";
    const athyper = deterministicUuid("neon", "athyper", "principal", subject);
    const technostat = deterministicUuid(
      "neon",
      "technostat",
      "principal",
      subject,
    );
    const mesh = deterministicUuid("mesh", "athyper", "principal", subject);
    assert.notEqual(athyper, subject);
    assert.notEqual(athyper, technostat);
    assert.notEqual(athyper, mesh);
    assert.match(athyper, /^[0-9a-f-]{36}$/);
  });

  it("separates lifecycle resources and admission identity from clean-slate authority", async () => {
    const inputs = await loadProvisionInputs();
    for (const plane of planeOrder()) {
      const projection =
        inputs.authorizationPacks[plane].tenantAuthorityProjection;
      assert.equal(projection.plane, plane);
      assert.equal(
        projection.contractVersion,
        "athyper.authorization.tenant-authority-projection.v1",
      );
      assert.equal(projection.definitions.roles.length, 0);
      assert.equal(projection.definitions.rolePermissions.length, 0);
      assert.equal(projection.definitions.principalGroups.length > 0, true);
      assert.equal(
        projection.definitions.principalGroups.every(
          (group) => group.zeroGrant,
        ),
        true,
      );
      assert.equal(projection.assignments.planeMemberships.length > 0, true);
      assert.equal(
        projection.assignments.scopeTargets.length >=
          inputs.manifest.tenants.length,
        true,
      );
      assert.equal(projection.assignments.groupRoles.length, 0);

      const roleIds = new Set(
        projection.definitions.roles.map((row) => row.id),
      );
      const groupIds = new Set(
        projection.definitions.principalGroups.map((row) => row.id),
      );
      const scopeIds = new Set(
        projection.assignments.scopeTargets.map((row) => row.id),
      );
      for (const grant of projection.definitions.rolePermissions)
        assert.equal(roleIds.has(grant.roleId), true);
      for (const member of projection.assignments.groupMembers)
        assert.equal(groupIds.has(member.groupId), true);
      for (const grant of projection.assignments.groupRoles) {
        assert.equal(roleIds.has(grant.roleId), true);
        assert.equal(groupIds.has(grant.groupId), true);
        assert.equal(scopeIds.has(grant.scopeTargetId), true);
        assert.equal(grant.propagationMode, "exact");
      }

      for (const role of projection.definitions.roles)
        assert.equal("keycloakSubject" in role, false);
      for (const group of projection.definitions.principalGroups)
        assert.equal("scopeTargetId" in group, false);
    }
  });
});
