import { describe, expect, it, vi } from "vitest";
import type {
  EmailProviderSuppressionControlPlane,
  EmailProviderTenantControlPlane,
  EmailProviderTenantSnapshot,
} from "@athyper/server-contract-notifications";
import {
  createEmailSuppressionSynchronizer,
  createEmailTenantProvisioner,
  deterministicEmailProviderTenantName,
} from "../email-provider-tenancy.js";

const tenantId = "0198e116-cd4f-7d31-89a4-13103b76f3fd";

function control(snapshot?: EmailProviderTenantSnapshot): EmailProviderTenantControlPlane & { readonly calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    read: vi.fn(async () => snapshot),
    ensureTenant: vi.fn(async (input) => { calls.push(input); }),
    ensureResourceAssociation: vi.fn(async (input) => { calls.push(input); }),
    ensureSuppressionPolicy: vi.fn(async (input) => { calls.push(input); }),
  };
}

function desired() {
  return {
    tenantId,
    lifecycle: "active" as const,
    identity: { resourceName: "arn:aws:ses:ap-southeast-1:111111111111:identity/notify.stg.athyper.com", verified: true as const },
    configurationSet: { resourceName: "athyper-transactional-stg" },
    suppressionReasons: ["complaint", "bounce", "complaint"] as const,
  };
}

describe("email provider tenant reconciliation", () => {
  it("derives a stable non-PII provider name and provisions every desired association", async () => {
    const provider = control();
    const result = await createEmailTenantProvisioner(provider).reconcile(desired());

    expect(result.outcome).toBe("created");
    expect(result.providerTenantName).toMatch(/^t-[a-f0-9]{40}$/);
    expect(result.providerTenantName).not.toContain(tenantId);
    expect(result.desiredStateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(provider.calls).toHaveLength(4);
    expect(provider.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerTenantName: result.providerTenantName, lifecycle: "active" }),
      expect.objectContaining({ resourceType: "identity", resourceName: desired().identity.resourceName }),
      expect.objectContaining({ resourceType: "configuration_set", resourceName: desired().configurationSet.resourceName }),
      expect.objectContaining({ reasons: ["bounce", "complaint"] }),
    ]));
    for (const call of provider.calls as { idempotencyKey: string }[]) expect(call.idempotencyKey).toContain(result.desiredStateHash);
  });

  it("is a no-op when provider state already equals desired state", async () => {
    const name = deterministicEmailProviderTenantName(tenantId);
    const provider = control({
      providerTenantName: name,
      lifecycle: "active",
      identityResourceNames: [desired().identity.resourceName],
      configurationSetResourceNames: [desired().configurationSet.resourceName],
      suppressionReasons: ["complaint", "bounce"],
    });

    await expect(createEmailTenantProvisioner(provider).reconcile(desired())).resolves.toMatchObject({ outcome: "unchanged", providerTenantName: name });
    expect(provider.calls).toEqual([]);
  });

  it("repairs only drifted associations and refuses unverified identities", async () => {
    const provider = control({
      providerTenantName: deterministicEmailProviderTenantName(tenantId),
      lifecycle: "active",
      identityResourceNames: [],
      configurationSetResourceNames: [desired().configurationSet.resourceName],
      suppressionReasons: ["bounce", "complaint"],
    });
    await expect(createEmailTenantProvisioner(provider).reconcile(desired())).resolves.toMatchObject({ outcome: "updated" });
    expect(provider.calls).toEqual([expect.objectContaining({ resourceType: "identity" })]);
    await expect(createEmailTenantProvisioner(provider).reconcile({ ...desired(), identity: { ...desired().identity, verified: false as true } })).rejects.toThrow("verified");
  });
});

describe("email suppression synchronization", () => {
  it("sends the recipient only to the injected control plane and returns a hash", async () => {
    const apply = vi.fn<EmailProviderSuppressionControlPlane["apply"]>(async () => ({ changed: true }));
    const result = await createEmailSuppressionSynchronizer({ apply }).synchronize({
      tenantId,
      recipientAddress: "Person@Example.test",
      operation: "suppress",
      reason: "bounce",
      sourceEventId: "ses-event-1",
    });

    expect(result.recipientRef).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain("example.test");
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      providerTenantName: deterministicEmailProviderTenantName(tenantId),
      recipientAddress: "person@example.test",
      operation: "suppress",
      reason: "bounce",
      idempotencyKey: expect.stringMatching(/^suppression-[a-f0-9]{64}$/),
    }));
  });

  it("uses stable idempotency and validates recipient and source event", async () => {
    const apply = vi.fn<EmailProviderSuppressionControlPlane["apply"]>(async () => ({ changed: false }));
    const service = createEmailSuppressionSynchronizer({ apply });
    const input = { tenantId, recipientAddress: "person@example.test", operation: "release" as const, reason: "complaint" as const, sourceEventId: "event-7" };
    await service.synchronize(input);
    await service.synchronize(input);
    expect(apply.mock.calls[0]![0].idempotencyKey).toBe(apply.mock.calls[1]![0].idempotencyKey);
    await expect(service.synchronize({ ...input, recipientAddress: "not-an-email" })).rejects.toThrow("recipient");
    await expect(service.synchronize({ ...input, sourceEventId: "" })).rejects.toThrow("sourceEventId");
  });
});
