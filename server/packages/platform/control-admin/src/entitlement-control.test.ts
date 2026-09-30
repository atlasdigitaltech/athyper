import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntitlementPlan, EntitlementRepository, TenantEntitlementOverride } from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { describe, expect, it, vi } from "vitest";
import { createEntitlementControlService } from "./entitlement-control.js";

const context = { tenantId: "tenant-1", principalId: "principal-1", planeKey: "neon" } as VerifiedRequestContext;
const plan: EntitlementPlan = { code: "BASE", version: 1, modules: ["core"], limits: { users: 10, storage: null }, effectiveFrom: "2026-01-01T00:00:00Z" };
const value = { id: "override-1", planCode: "BASE", limitCode: "users", limitValue: 20, reason: " Temporary capacity ", effectiveFrom: "2026-09-01T00:00:00Z" };
const stored: TenantEntitlementOverride = { ...value, tenantId: context.tenantId, version: 1, status: "active" };
function fixture(current?: TenantEntitlementOverride, authorizer: Authorizer = { authorize: async () => ({ allowed: true }) }) {
  const repository = {
    listPlans: vi.fn(async () => [plan]), listModules: vi.fn(async () => ["core", "analytics"]), getPlan: vi.fn<EntitlementRepository["getPlan"]>(async () => plan),
    getOverride: vi.fn<EntitlementRepository["getOverride"]>(async () => current),
    saveOverride: vi.fn<EntitlementRepository["saveOverride"]>(async ({ expectedVersion, ...input }) => ({ ...input, version: expectedVersion + 1, status: "active" })),
    expireOverride: vi.fn<EntitlementRepository["expireOverride"]>(async (_tenant, _id, expectedVersion) => ({ ...current!, version: expectedVersion + 1, status: "expired" })),
  };
  const cache = { invalidate: vi.fn(async () => undefined) };
  return { repository, cache, service: createEntitlementControlService({ authorizer, repositories: createExactPlaneRepositoryProvider({ neon: repository }), cache }) };
}

describe("entitlement override validation", () => {
  it.each([0, 20, Number.MAX_SAFE_INTEGER])("accepts nonnegative safe-integer limit value %s and stamps verified tenant and actor", async limitValue => {
    const { service, repository, cache } = fixture();
    await expect(service.saveOverride({ context, override: { ...value, limitValue }, expectedVersion: 0 })).resolves.toMatchObject({ limitValue, tenantId: "tenant-1", version: 1, reason: "Temporary capacity" });
    expect(repository.saveOverride).toHaveBeenCalledExactlyOnceWith({ ...value, limitValue, reason: "Temporary capacity", tenantId: context.tenantId, expectedVersion: 0 }, context.principalId);
    expect(cache.invalidate).toHaveBeenCalledWith({ namespace: "entitlements", tenantId: context.tenantId, keys: ["BASE"] });
  });
  it("allows a known catalog module outside the base plan", async () => {
    const { service, repository } = fixture();
    const { limitCode: _code, limitValue: _value, ...module } = value;
    await expect(service.saveOverride({ context, override: { ...module, moduleCode: "analytics" }, expectedVersion: 0 })).resolves.toMatchObject({ moduleCode: "analytics" });
    expect(repository.listModules).toHaveBeenCalledOnce();
  });
  it.each([
    { limitCode: undefined }, { limitValue: undefined }, { moduleCode: "core" }, { limitCode: " " }, { limitValue: -1 }, { limitValue: 0.5 }, { limitValue: Number.MAX_SAFE_INTEGER + 1 }, { limitValue: Number.NaN }, { limitValue: Infinity }, { limitValue: null },
    { reason: " " }, { planCode: " " }, { id: " " }, { effectiveFrom: "bad" }, { effectiveUntil: "bad" }, { effectiveUntil: "" }, { effectiveUntil: "2026-09-01T00:00:00Z" }, { effectiveUntil: "2026-08-01T00:00:00Z" },
    { tenantId: "forged" }, { status: "expired" }, { version: 999 },
  ])("rejects malformed override %j", async fields => {
    const { service, repository } = fixture();
    await expect(service.saveOverride({ context, override: { ...value, ...fields } as typeof value, expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.saveOverride).not.toHaveBeenCalled();
  });
  it("rejects module overrides carrying a limit value and unknown catalog modules", async () => {
    const { service, repository } = fixture();
    const { limitCode: _code, limitValue: _value, ...module } = value;
    await expect(service.saveOverride({ context, override: { ...module, moduleCode: "core", limitValue: 1 }, expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.saveOverride({ context, override: { ...module, moduleCode: "unknown" }, expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.saveOverride).not.toHaveBeenCalled();
  });
  it.each(["unknown", "toString", "constructor"])("rejects non-plan limit %s including inherited keys", async limitCode => {
    const { service, repository } = fixture();
    await expect(service.saveOverride({ context, override: { ...value, limitCode }, expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.saveOverride).not.toHaveBeenCalled();
  });
  it("checks plan identity and effective period", async () => {
    const { service, repository } = fixture();
    for (const found of [undefined, { ...plan, code: "OTHER" }, { ...plan, effectiveFrom: "2027-01-01T00:00:00Z" }, { ...plan, effectiveUntil: value.effectiveFrom }, { ...plan, effectiveUntil: "bad" }]) {
      repository.getPlan.mockResolvedValue(found);
      await expect(service.saveOverride({ context, override: value, expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 404 });
    }
    expect(repository.saveOverride).not.toHaveBeenCalled();
  });
  it.each([undefined, null, "0", true, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid expected version %s", async expectedVersion => {
    const { service, repository } = fixture();
    await expect(service.saveOverride({ context, override: value, expectedVersion: expectedVersion as number })).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.saveOverride).not.toHaveBeenCalled();
  });
});

describe("entitlement scope, concurrency and expiration", () => {
  it("requires create/update intent to match the current row and version", async () => {
    const { service, repository } = fixture(stored);
    await expect(service.saveOverride({ context, override: value, expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.saveOverride({ context, override: value, expectedVersion: 2 })).rejects.toMatchObject({ statusCode: 409 });
    repository.getOverride.mockResolvedValue(undefined);
    await expect(service.saveOverride({ context, override: value, expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.saveOverride).not.toHaveBeenCalled();
  });
  it("invalidates old and new plans when retargeting an active override", async () => {
    const { service, repository, cache } = fixture(stored);
    repository.getPlan.mockResolvedValue({ ...plan, code: "PRO" });
    await service.saveOverride({ context, override: { ...value, planCode: "PRO" }, expectedVersion: 1 });
    expect(cache.invalidate).toHaveBeenCalledExactlyOnceWith({ namespace: "entitlements", tenantId: context.tenantId, keys: ["BASE", "PRO"] });
  });
  it("expires an active override with verified scope and expected version", async () => {
    const { service, repository, cache } = fixture(stored);
    await expect(service.expireOverride(context, value.id, 1)).resolves.toMatchObject({ status: "expired", version: 2 });
    expect(repository.expireOverride).toHaveBeenCalledExactlyOnceWith(context.tenantId, value.id, 1, context.principalId);
    expect(cache.invalidate).toHaveBeenCalledWith({ namespace: "entitlements", tenantId: context.tenantId, keys: ["BASE"] });
  });
  it("keeps expired overrides terminal and treats a matching-version repeat expiry as a no-op", async () => {
    const { service, repository, cache } = fixture({ ...stored, status: "expired" });
    await expect(service.saveOverride({ context, override: value, expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.expireOverride(context, value.id, 1)).resolves.toMatchObject({ status: "expired" });
    expect(repository.expireOverride).not.toHaveBeenCalled(); expect(repository.saveOverride).not.toHaveBeenCalled(); expect(cache.invalidate).not.toHaveBeenCalled();
  });
  it("rejects missing rows and stale or invalid expiry versions", async () => {
    const { service, repository } = fixture();
    await expect(service.expireOverride(context, value.id, 1)).rejects.toMatchObject({ statusCode: 404 });
    repository.getOverride.mockResolvedValue(stored);
    await expect(service.expireOverride(context, value.id, 2)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.expireOverride(context, value.id, 0)).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.expireOverride).not.toHaveBeenCalled();
  });
  it.each([{ tenantId: "other" }, { id: "other" }])("rejects a repository row outside verified coordinates %j", async fields => {
    const { service, repository } = fixture({ ...stored, ...fields });
    await expect(service.saveOverride({ context, override: value, expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.expireOverride(context, value.id, 1)).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.saveOverride).not.toHaveBeenCalled(); expect(repository.expireOverride).not.toHaveBeenCalled();
  });
  it("maps commit-time conflicts without invalidating cache", async () => {
    const { service, repository, cache } = fixture(stored);
    repository.saveOverride.mockRejectedValue(Object.assign(new Error("private row"), { code: "CONTROL_ADMIN_VERSION_CONFLICT" }));
    await expect(service.saveOverride({ context, override: value, expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
    expect(cache.invalidate).not.toHaveBeenCalled();
  });
  it("denies all operations before accessing repositories", async () => {
    const { service, repository } = fixture(undefined, { authorize: async () => ({ allowed: false, reason: "denied" }) });
    await expect(service.listPlans(context)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.listModules(context)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.saveOverride({ context, override: value, expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.expireOverride(context, value.id, 1)).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.listPlans).not.toHaveBeenCalled(); expect(repository.listModules).not.toHaveBeenCalled(); expect(repository.getOverride).not.toHaveBeenCalled();
  });
  it("does not fall back to another plane for catalog reads", async () => {
    const { service, repository } = fixture();
    await expect(service.listPlans({ ...context, planeKey: "mesh" })).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.listPlans).not.toHaveBeenCalled();
  });
});
