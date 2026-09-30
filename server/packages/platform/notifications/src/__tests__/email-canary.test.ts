import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedEmailCanaryRequest } from "@athyper/server-contract-notifications";
import { createStagingEmailCanary, validateStagingEmailCanaryEvidence } from "../email-canary.js";

const request: AuthenticatedEmailCanaryRequest = {
  environment: "stg",
  sourceRevision: "a".repeat(40),
  tenantId: "0198e116-cd4f-7d31-89a4-13103b76f3fd",
  principalId: "0198e116-cd4f-7d31-89a4-13103b76f3fe",
  planeKey: "neon",
  recipientAddress: "staging-canary@athyper.test",
};
const deliveryId = "0198e116-cd4f-7d31-89a4-13103b76f3ff";
const providerMessageId = "01000191-provider-message-id";

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authorizer: { authorize: vi.fn(async () => ({ authenticated: true as const, authorized: true })) },
    delivery: { dispatch: vi.fn(async () => ({ deliveryId, providerMessageId })) },
    observations: { observe: vi.fn(async () => ({ providerAccepted: true, providerEventObserved: true, delivered: true, activityCenterPublished: true })) },
    now: () => new Date("2026-08-25T08:09:10.000Z"),
    ...overrides,
  };
}

describe("staging SES email canary evidence", () => {
  it("executes under an authenticated principal and emits schema-safe redacted evidence", async () => {
    const deps = dependencies();
    const evidence = await createStagingEmailCanary(deps).run(request);

    expect(deps.authorizer.authorize).toHaveBeenCalledWith({
      tenantId: request.tenantId,
      principalId: request.principalId,
      planeKey: "neon",
      action: "notifications.email_canary.execute",
    });
    expect(deps.delivery.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: expect.stringMatching(/^stg-email-canary-[a-f0-9]{64}$/),
    }));
    expect(evidence).toMatchObject({
      metadata: { gate: "email-canary" },
      spec: {
        status: "passed",
        recordedAt: "2026-08-25T08:09:10.000Z",
        assertions: { authenticatedDispatch: true, delivered: true, activityCenterPublished: true },
      },
    });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(request.recipientAddress);
    expect(serialized).not.toContain(providerMessageId);
    expect(evidence.spec.canaryIdentity.recipientRef).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(evidence.spec.providerReference).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => validateStagingEmailCanaryEvidence(evidence)).not.toThrow();
  });

  it("fails closed before dispatch when authorization is denied", async () => {
    const deps = dependencies({ authorizer: { authorize: vi.fn(async () => ({ authenticated: true as const, authorized: false })) } });
    await expect(createStagingEmailCanary(deps).run(request)).rejects.toThrow("EMAIL_CANARY_FORBIDDEN");
    expect(deps.delivery.dispatch).not.toHaveBeenCalled();
  });

  it("does not create passing evidence for partial provider or Activity Center observations", async () => {
    const deps = dependencies({ observations: { observe: vi.fn(async () => ({ providerAccepted: true, providerEventObserved: true, delivered: true, activityCenterPublished: false })) } });
    await expect(createStagingEmailCanary(deps).run(request)).rejects.toThrow("EMAIL_CANARY_ASSERTIONS_FAILED");
  });

  it("rejects unknown input/evidence fields and invalid revisions", async () => {
    await expect(createStagingEmailCanary(dependencies()).run({ ...request, credential: "must-not-enter-evidence" } as AuthenticatedEmailCanaryRequest)).rejects.toThrow("Invalid staging email canary evidence");
    await expect(createStagingEmailCanary(dependencies()).run({ ...request, sourceRevision: "dirty" })).rejects.toThrow("sourceRevision");
    const evidence = await createStagingEmailCanary(dependencies()).run(request);
    expect(() => validateStagingEmailCanaryEvidence({ ...evidence, recipientAddress: request.recipientAddress })).toThrow();
    expect(() => validateStagingEmailCanaryEvidence({ ...evidence, spec: { ...evidence.spec, assertions: { ...evidence.spec.assertions, delivered: false } } })).toThrow();
  });
});
