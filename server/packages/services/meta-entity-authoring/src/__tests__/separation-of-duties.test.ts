import { describe, expect, it, vi } from "vitest";
import {
  MetaEntityAuthoringError,
  MetaEntityAuthoringService,
  type MetaEntityAuthoringRepository,
  type MetaEntitySeparationOfDutiesFacts,
} from "../meta-entity-authoring.service.js";

const actor = "018f0000-0000-7000-8000-000000000001";
const other = "018f0000-0000-7000-8000-000000000002";
const tenant = "018f0000-0000-7000-8000-000000000003";
const changeSet = "018f0000-0000-7000-8000-000000000004";

function facts(overrides: Partial<MetaEntitySeparationOfDutiesFacts> = {}): MetaEntitySeparationOfDutiesFacts {
  return {
    entityTenantId: tenant,
    createdBy: other,
    submittedBy: other,
    reviewedBy: null,
    approvedBy: null,
    latestRevisionCapturedBy: other,
    latestReleasePublishedBy: null,
    rollbackTargetPublishedBy: null,
    ...overrides,
  };
}

function service(value: MetaEntitySeparationOfDutiesFacts): MetaEntityAuthoringService {
  return new MetaEntityAuthoringService({
    loadSeparationOfDutiesFacts: vi.fn().mockResolvedValue(value),
  } as unknown as MetaEntityAuthoringRepository);
}

describe("Meta Entity separation of duties", () => {
  it("rejects an author attempting to review their own change set", async () => {
    await expect(service(facts({ createdBy: actor })).assertSeparationOfDuties(
      { tenantId: tenant, principalId: actor }, "review", changeSet,
    )).rejects.toMatchObject<Partial<MetaEntityAuthoringError>>({
      code: "SEPARATION_OF_DUTIES_FAILED",
      status: 403,
      detail: { conflictingRoles: ["change_set_author"] },
    });
  });

  it("allows an independent reviewer", async () => {
    await expect(service(facts()).assertSeparationOfDuties(
      { tenantId: tenant, principalId: actor }, "review", changeSet,
    )).resolves.toBeUndefined();
  });

  it("rejects rollback by the publisher of the rollback target", async () => {
    await expect(service(facts({ rollbackTargetPublishedBy: actor })).assertSeparationOfDuties(
      { tenantId: tenant, principalId: actor }, "rollback", changeSet, other,
    )).rejects.toMatchObject({
      code: "SEPARATION_OF_DUTIES_FAILED",
      detail: { conflictingRoles: ["rollback_target_publisher"] },
    });
  });

  it("keeps global package contracts outside tenant mutation authority", async () => {
    await expect(service(facts({ entityTenantId: null })).assertSeparationOfDuties(
      { tenantId: tenant, principalId: actor }, "publish", changeSet,
    )).rejects.toMatchObject({ code: "GLOBAL_PACKAGE_READ_ONLY", status: 403 });
  });
});
