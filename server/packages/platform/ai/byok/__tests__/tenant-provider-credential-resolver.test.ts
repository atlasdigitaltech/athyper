import { describe, expect, it, vi } from "vitest";
import { TenantByokCredentialResolver } from "../tenant-provider-credential-resolver.js";

const tenantA = "10000000-0000-4000-8000-000000000001";
const tenantB = "10000000-0000-4000-8000-000000000002";
const fingerprintKey = "byok-fingerprint-key-that-is-definitely-long-enough";

function target() {
  const epochs = new Map([[`${tenantA}:openai`, 1], [`${tenantB}:openai`, 1]]);
  const store = {
    currentEpoch: vi.fn(async ({ tenantId, providerId }) => epochs.get(`${tenantId}:${providerId}`) ?? 0),
    readActive: vi.fn(async ({ tenantId, providerId }) => tenantId === tenantA
      ? { tenantId, providerId, credentialId: "credential-a", rotationEpoch: epochs.get(`${tenantId}:${providerId}`)!, secret: "tenant-a-secret" }
      : null),
  };
  const audit = { record: vi.fn(async () => undefined) };
  return { epochs, store, audit, resolver: new TenantByokCredentialResolver(store, audit, { fingerprintKey }) };
}

describe("TenantByokCredentialResolver", () => {
  it("does not allow a tenant credential to cross into another tenant", async () => {
    const value = target();
    const a = await value.resolver.resolve({ tenantId: tenantA, providerId: "openai" });
    const b = await value.resolver.resolve({ tenantId: tenantB, providerId: "openai" });
    expect(a?.secret).toBe("tenant-a-secret");
    expect(b).toBeNull();
    expect(JSON.stringify(value.audit.record.mock.calls)).not.toContain("tenant-a-secret");
  });

  it("evicts a cached lease when the authoritative epoch changes", async () => {
    const value = target();
    await value.resolver.resolve({ tenantId: tenantA, providerId: "openai" });
    value.epochs.set(`${tenantA}:openai`, 2);
    await value.resolver.resolve({ tenantId: tenantA, providerId: "openai" });
    expect(value.store.readActive).toHaveBeenCalledTimes(2);
    expect(value.audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: "cache_evicted", epoch: 2 }));
  });

  it("has no cache entry after explicit revocation notification", async () => {
    const value = target();
    await value.resolver.resolve({ tenantId: tenantA, providerId: "openai" });
    await value.resolver.invalidate({ tenantId: tenantA, providerId: "openai" });
    await value.resolver.resolve({ tenantId: tenantA, providerId: "openai" });
    expect(value.store.readActive).toHaveBeenCalledTimes(2);
  });

  it("invalidates cached leases across replicas through the shared epoch after rotation", async () => {
    const value = target();
    const replica = new TenantByokCredentialResolver(value.store, value.audit, { fingerprintKey });
    await value.resolver.resolve({ tenantId: tenantA, providerId: "openai" });
    await replica.resolve({ tenantId: tenantA, providerId: "openai" });
    value.epochs.set(`${tenantA}:openai`, 2);
    await expect(replica.resolve({ tenantId: tenantA, providerId: "openai" }))
      .resolves.toMatchObject({ metadata: { rotationEpoch: 2 } });
    expect(value.store.readActive).toHaveBeenCalledTimes(3);
  });

  it("starts with an empty cache after process restart", async () => {
    const value = target();
    await value.resolver.resolve({ tenantId: tenantA, providerId: "openai" });
    const restarted = new TenantByokCredentialResolver(value.store, value.audit, { fingerprintKey });
    await restarted.resolve({ tenantId: tenantA, providerId: "openai" });
    expect(value.store.readActive).toHaveBeenCalledTimes(2);
  });
});
