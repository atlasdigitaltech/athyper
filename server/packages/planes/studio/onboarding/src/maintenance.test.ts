import { describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createGuestAccessExpiryHandler, EXPIRE_ONBOARDING_GUEST_ACCESS_JOB, OnboardingMaintenanceService, ONBOARDING_MAINTENANCE_QUEUE } from "./maintenance.js";

const context = { tenantId: "tenant-1", principalId: "principal-1", planeKey: "studio" } as VerifiedRequestContext;

describe("onboarding maintenance", () => {
  it("resolves work items inside the tenant transaction after authorization", async () => {
    const resolveWorkItem = vi.fn(async () => true);
    const service = createService({ resolveWorkItem });
    await expect(service.resolveWorkItem({ context, caseId: "case-1", workItemId: "work-1" })).resolves.toBe(true);
    expect(resolveWorkItem).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", actorId: "principal-1" }), expect.anything());
  });

  it("expires bounded guest-access batches and emits worker progress", async () => {
    const revokeExpiredGuestAccess = vi.fn(async () => ["guest-1", "guest-2"]);
    const service = createService({ revokeExpiredGuestAccess });
    const reportProgress = vi.fn(async () => undefined);
    const handler = createGuestAccessExpiryHandler(service);
    await expect(handler.handle({ id: "job-1", name: EXPIRE_ONBOARDING_GUEST_ACCESS_JOB, queue: ONBOARDING_MAINTENANCE_QUEUE, data: { tenantId: "tenant-1", actorId: "worker-1", limit: 100 }, attempt: 1, maxAttempts: 3, enqueuedAt: "2026-08-11T00:00:00Z" }, { signal: new AbortController().signal, attempt: 1, reportProgress })).resolves.toEqual({ status: "completed", output: { revoked: 2 } });
    expect(revokeExpiredGuestAccess).toHaveBeenCalledWith(expect.objectContaining({ limit: 100, now: "2026-08-11T00:00:00.000Z" }), expect.anything());
    expect(reportProgress).toHaveBeenCalledWith({ revoked: 2 });
  });
});

function createService(overrides: { resolveWorkItem?: (input: unknown, transaction: unknown) => Promise<boolean>; revokeExpiredGuestAccess?: (input: unknown, transaction: unknown) => Promise<readonly string[]> }) {
  const repository = { createDraft:vi.fn(),transition: vi.fn(), resolveWorkItem: overrides.resolveWorkItem ?? vi.fn(async () => false), revokeExpiredGuestAccess: overrides.revokeExpiredGuestAccess ?? vi.fn(async () => []) };
  return new OnboardingMaintenanceService(repository, { run: async (_actor, work) => work({}) }, { authorize: async () => ({ allowed: true }) }, () => new Date("2026-08-11T00:00:00Z"));
}
