import { describe, expect, it } from "vitest";

import {
  mutationKernelFlagName,
  resolveMutationKernelRollout,
  strictWriteValidationFlagName,
} from "../mutation/mutation-kernel-rollout.js";

describe("mutation kernel rollout policy", () => {
  it("builds tenant/entity/operation-scoped flag names", () => {
    expect(mutationKernelFlagName("purchase_invoice", "aggregate")).toBe("mutation_kernel.aggregate.purchase_invoice");
    expect(mutationKernelFlagName("company_code", "patch")).toBe("mutation_kernel.patch.company_code");
    expect(strictWriteValidationFlagName("company_code")).toBe("strict_write_validation.company_code");
  });

  it("keeps shadow validation read-only for the new kernel and never dual-writes business data", () => {
    const decision = resolveMutationKernelRollout({
      tenantKey: "tenant-1",
      entityCode: "purchase_invoice",
      operation: "aggregate",
      stage: "shadow_validation",
    });

    expect(decision).toEqual(expect.objectContaining({
      stage: "shadow_validation",
      oldPathWritesBusinessData: true,
      newKernelEvaluates: true,
      recordDifferences: true,
      comparePostMutationReads: true,
      executeNewMutation: false,
      allowDualWriteBusinessData: false,
      flags: {
        mutationKernel: "mutation_kernel.aggregate.purchase_invoice",
        strictWriteValidation: "strict_write_validation.purchase_invoice",
      },
    }));
  });

  it("promotes from internal tenants to small external cohorts before full rollout", () => {
    expect(resolveMutationKernelRollout({
      tenantKey: "internal-tenant",
      entityCode: "company_code",
      operation: "patch",
      stage: "internal_tenants",
    })).toMatchObject({
      recordDifferences: false,
      executeNewMutation: true,
    });

    expect(resolveMutationKernelRollout({
      tenantKey: "external-tenant",
      entityCode: "company_code",
      operation: "patch",
      stage: "small_external_cohort",
    })).toMatchObject({
      recordDifferences: false,
      executeNewMutation: true,
    });

    expect(resolveMutationKernelRollout({
      tenantKey: "external-tenant",
      entityCode: "company_code",
      operation: "patch",
      stage: "full_rollout",
    })).toMatchObject({
      recordDifferences: false,
      executeNewMutation: true,
      oldPathWritesBusinessData: false,
      comparePostMutationReads: false,
    });
  });

  it("does not execute internal/cohort stages for tenants outside the selected cohort", () => {
    expect(resolveMutationKernelRollout({
      tenantKey: "external-tenant", entityCode: "company_code", operation: "patch",
      stage: "internal_tenants", isInternalTenant: false, isExternalCohort: false,
    }).executeNewMutation).toBe(false);
    expect(resolveMutationKernelRollout({
      tenantKey: "external-tenant", entityCode: "company_code", operation: "patch",
      stage: "small_external_cohort", isInternalTenant: false, isExternalCohort: false,
    }).executeNewMutation).toBe(false);
  });
});
