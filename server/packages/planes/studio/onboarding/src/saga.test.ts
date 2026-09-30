import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { OnboardingCase } from "@athyper/contract-athyper-onboarding";
import {
  createCommandEnvelopeFactory,
  createOnboardingSaga,
  reconcileOnboardingCase,
} from "./saga.js";

const baseCase: OnboardingCase = {
  id: "case-1",
  tenantId: "studio-tenant",
  caseCode: "supplier.acme",
  canonicalPartyId: "party-1",
  status: "provisioning",
  desiredVersion: 3,
  desiredHash: "desired-hash",
  targets: [
    {
      targetId: "neon-target",
      plane: "neon",
      targetTenantId: "neon-tenant",
      criticality: "activation_critical",
      resources: [
        {
          resourceKey: "primary",
          resourceKind: "tenant",
          retention: "retain_legal_and_audit",
          desiredState: { code: "acme" },
          accessGates: {
            subscriptionEntitlement: {
              planId: "plan-1",
              capabilityCodes: ["finance"],
            },
            iamMembership: {
              externalOrganizationId: "org-1",
              principalIds: ["principal-1"],
            },
            planeProjection: {
              projectionId: "projection-1",
              scopeTargetIds: ["scope-1"],
            },
            authorizationGrants: {
              principalId: "principal-1",
              roleCodes: ["accountant"],
              scopeTargetIds: ["scope-1"],
            },
          },
        },
      ],
    },
    {
      targetId: "mesh-target",
      plane: "mesh",
      targetTenantId: "mesh-tenant",
      criticality: "independent",
      resources: [
        {
          resourceKey: "primary",
          resourceKind: "network_account",
          retention: "deletable",
          desiredState: { role: "supplier" },
        },
      ],
    },
  ],
};

describe("onboarding saga", () => {
  it("reconciles resources by target coordinate and keeps all access gates independent", () => {
    const result = reconcileOnboardingCase(baseCase, [
      {
        targetId: "neon-target",
        resourceKey: "primary",
        status: "applied",
        appliedVersion: 3,
        appliedHash: "desired-hash",
        observedAt: "2026-08-10T00:00:00.000Z",
      },
    ]);

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toMatchObject({
      targetId: "mesh-target",
      resourceKey: "primary",
      operation: "apply",
    });
    expect(baseCase.targets[0]?.resources[0]?.accessGates).toEqual(
      expect.objectContaining({
        subscriptionEntitlement: expect.any(Object),
        iamMembership: expect.any(Object),
        planeProjection: expect.any(Object),
        authorizationGrants: expect.any(Object),
      }),
    );
  });

  it("retains legal evidence while revoking deletable resources during offboarding", () => {
    const result = reconcileOnboardingCase(
      { ...baseCase, status: "offboarding", desiredVersion: 4 },
      [],
    );
    expect(
      result.commands.map((command) => [command.targetId, command.operation]),
    ).toEqual([
      ["neon-target", "retain"],
      ["mesh-target", "revoke"],
    ]);
  });

  it("uses stable semantic idempotency coordinates across retries", async () => {
    const execute = vi.fn().mockImplementation(async (command) => ({
      commandId: command.commandId,
      executionId: "execution-1",
      duplicate: execute.mock.calls.length > 1,
      status: "applied",
      outboxEventId: "outbox-1",
    }));
    const recordReceipt = vi.fn().mockResolvedValue(undefined);
    const repository = {
      loadCase: vi.fn().mockResolvedValue(baseCase),
      listObservations: vi.fn().mockResolvedValue([]),
      recordReceipt,
    };
    const envelopes = createCommandEnvelopeFactory({
      serviceId: "studio-onboarding",
      audienceFor: (plane) => `${plane}-provisioner`,
      newCommandId: randomUUID,
      fingerprint: () => "request-hash",
      now: () => "2026-08-10T00:00:00.000Z",
    });
    const saga = createOnboardingSaga({
      repository,
      transport: { execute },
      envelopes,
    });

    await saga.reconcile(baseCase.id);
    await saga.reconcile(baseCase.id);
    expect(execute.mock.calls[0]?.[0].idempotencyKey).toBe(
      execute.mock.calls[2]?.[0].idempotencyKey,
    );
    expect(recordReceipt).toHaveBeenCalledWith(
      "case-1",
      "neon-target",
      "primary",
      "apply",
      expect.any(Object),
    );
  });

  it("stops a partial target run after a rejection and retries from durable observations", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        commandId: "one",
        executionId: "10000000-0000-4000-8000-000000000010",
        duplicate: false,
        status: "rejected",
        errorCode: "TARGET_UNAVAILABLE",
      })
      .mockResolvedValue({
        commandId: "two",
        executionId: "10000000-0000-4000-8000-000000000011",
        duplicate: true,
        status: "applied",
        appliedVersion: 3,
        appliedHash: "desired-hash",
      });
    const recordReceipt = vi.fn().mockResolvedValue(undefined);
    const repository = {
      loadCase: vi.fn().mockResolvedValue(baseCase),
      listObservations: vi.fn().mockResolvedValue([]),
      recordReceipt,
    };
    const saga = createOnboardingSaga({
      repository,
      transport: { execute },
      envelopes: createCommandEnvelopeFactory({
        serviceId: "studio-onboarding",
        audienceFor: (plane) => `${plane}-provisioner`,
        newCommandId: randomUUID,
        fingerprint: () => "request-hash",
        now: () => "2026-08-10T00:00:00.000Z",
      }),
    });
    await saga.reconcile(baseCase.id);
    expect(execute).toHaveBeenCalledTimes(1);
    await saga.reconcile(baseCase.id);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls[0]?.[0].idempotencyKey).toBe(
      execute.mock.calls[1]?.[0].idempotencyKey,
    );
  });
});

describe("reconciliation guards", () => {
  it.each([
    "draft",
    "submitted",
    "qualifying",
    "awaiting_approval",
    "approved",
    "rejected",
    "cancelled",
    "failed",
    "offboarded",
  ] as const)("does not provision a %s case", async (status) => {
    const execute = vi.fn(),
      recordReceipt = vi.fn();
    const saga = createOnboardingSaga({
      repository: {
        loadCase: vi.fn().mockResolvedValue({ ...baseCase, status }),
        listObservations: vi.fn().mockResolvedValue([]),
        recordReceipt,
      },
      transport: { execute },
      envelopes: { create: vi.fn() },
    });
    await expect(
      saga.reconcile(baseCase.id, baseCase.tenantId),
    ).rejects.toThrow("ONBOARDING_RECONCILIATION_STATUS_CONFLICT");
    expect(execute).not.toHaveBeenCalled();
    expect(recordReceipt).not.toHaveBeenCalled();
  });
  it("hides another tenant's case before reading observations or issuing commands", async () => {
    const execute = vi.fn(),
      listObservations = vi.fn();
    const saga = createOnboardingSaga({
      repository: {
        loadCase: vi.fn().mockResolvedValue(baseCase),
        listObservations,
        recordReceipt: vi.fn(),
      },
      transport: { execute },
      envelopes: { create: vi.fn() },
    });
    await expect(saga.reconcile(baseCase.id, "another-tenant")).rejects.toThrow(
      "Onboarding case not found:",
    );
    expect(listObservations).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
