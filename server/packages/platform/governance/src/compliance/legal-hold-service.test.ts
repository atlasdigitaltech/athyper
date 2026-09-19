import { describe, expect, it, vi } from "vitest";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { LegalHold, LegalHoldRepository, LegalHoldResource } from "@athyper/server-contract-governance";
import { createLegalHoldService } from "./legal-hold-service.js";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";

const context = { tenantId: "tenant-1", principalId: "principal-1", planeKey: "neon" } as VerifiedRequestContext;
const allow: Authorizer = { async authorize() { return { allowed: true }; } };
const clock = () => new Date("2026-08-11T12:00:00.000Z");

describe("LegalHoldService", () => {
  it("enforces draft/active/released transitions and integrates resource retention", async () => {
    const repository = memoryRepository(); const apply = vi.fn(); const release = vi.fn(); let sequence = 0;
    const service = createLegalHoldService({ authorizer: allow, repositories: createExactPlaneRepositoryProvider({ neon: repository }), retention: { apply, release }, now: clock, createId: () => `id-${++sequence}` });
    const draft = await service.createDraft({ context, code: "case-7", name: "Case 7", issuedAt: "2026-08-10T00:00:00Z" });
    const resource = await service.addResource({ context, holdId: draft.id, resource: { kind: "storage_object", uri: "objects/evidence-7", contentHash: "abc" } });
    const active = await service.activate(context, draft.id, "2026-08-11T00:00:00Z");
    expect(active.status).toBe("active"); expect(apply).toHaveBeenCalledWith(expect.objectContaining({ resource, effectiveAt: "2026-08-11T00:00:00.000Z" }));
    await expect(service.removeResource(context, draft.id, resource.id)).rejects.toMatchObject({ code: "GOVERNANCE_INVALID_TRANSITION" });
    const released = await service.release(context, draft.id);
    expect(released.status).toBe("released"); expect(release).toHaveBeenCalledOnce();
    await expect(service.addResource({ context, holdId: draft.id, resource: { kind: "document", resourceId: "doc-2" } })).rejects.toMatchObject({ code: "GOVERNANCE_INVALID_TRANSITION" });
  });

  it("allows manifest reduction only in draft and validates effective/release times", async () => {
    const repository = memoryRepository(); let sequence = 0;
    const service = createLegalHoldService({ authorizer: allow, repositories: createExactPlaneRepositoryProvider({ neon: repository }), retention: { async apply() {}, async release() {} }, now: clock, createId: () => `id-${++sequence}` });
    const draft = await service.createDraft({ context, code: "HOLD_8", name: "Hold 8", issuedAt: "2026-08-10T00:00:00Z" });
    const resource = await service.addResource({ context, holdId: draft.id, resource: { kind: "document", resourceId: "doc-1" } });
    await expect(service.removeResource(context, draft.id, resource.id)).resolves.toBeUndefined();
    await expect(service.activate(context, draft.id, "2026-08-09T00:00:00Z")).rejects.toMatchObject({ code: "GOVERNANCE_INVALID_COMMAND" });
    await expect(service.activate(context, draft.id, "2026-08-12T00:00:00Z")).rejects.toMatchObject({ code: "GOVERNANCE_INVALID_COMMAND" });
  });
  it("rolls back active manifest additions when retention fails, allowing retry", async () => {
    const repository = memoryRepository(); const apply = vi.fn(async () => {}); let sequence = 0;
    const service = createLegalHoldService({ authorizer: allow, repositories: createExactPlaneRepositoryProvider({ neon: repository }), retention: { apply, release: async () => {} }, now: clock, createId: () => `id-${++sequence}` });
    const hold = await service.createDraft({ context, code: "HOLD", name: "Hold" });
    await service.addResource({ context, holdId: hold.id, resource: { kind: "document", resourceId: "first" } });
    await service.activate(context, hold.id);
    apply.mockRejectedValueOnce(new Error("retention unavailable"));
    const command = { context, holdId: hold.id, resource: { kind: "document" as const, resourceId: "second" } };
    await expect(service.addResource(command)).rejects.toThrow("retention unavailable");
    expect((await service.get(context, hold.id)).resources).toHaveLength(1);
    await service.addResource(command);
    expect((await service.get(context, hold.id)).resources).toHaveLength(2);
  });
  it("denies every legal-hold action before repository access", async () => {
    const service = createLegalHoldService({ authorizer: { authorize: async () => ({ allowed: false as const, reason: "denied" }) }, repositories: createExactPlaneRepositoryProvider({}), retention: { apply: async () => {}, release: async () => {} } });
    const calls = [() => service.createDraft({ context, code: "HOLD", name: "Hold" }), () => service.get(context,"hold"), () => service.activate(context,"hold"), () => service.release(context,"hold"), () => service.addResource({context,holdId:"hold",resource:{kind:"document",resourceId:"doc"}}), () => service.removeResource(context,"hold","resource")];
    for (const call of calls) await expect(call()).rejects.toMatchObject({code:"GOVERNANCE_PERMISSION_DENIED"});
  });

});

function memoryRepository(): LegalHoldRepository {
  const holds = new Map<string, LegalHold>();
  const update = (hold: LegalHold) => { holds.set(hold.id, hold); return hold; };
  const repository: LegalHoldRepository = {
    async withHoldLock(_tenantId, _holdId, work) {
      const before = new Map(holds);
      try { return await work(repository); }
      catch (error) { holds.clear(); for (const [id, hold] of before) holds.set(id, hold); throw error; }
    },
    async createDraft(input) { return update({ ...input, resources: [] }); },
    async get(tenantId, id) { const hold = holds.get(id); return hold?.tenantId === tenantId ? hold : undefined; },
    async addResource(_tenantId, id, resource) { const hold = holds.get(id)!; update({ ...hold, resources: [...hold.resources, resource] }); return resource; },
    async removeDraftResource(_tenantId, id, resourceId) { const hold = holds.get(id); if (!hold || hold.status !== "draft" || !hold.resources.some((item) => item.id === resourceId)) return false; update({ ...hold, resources: hold.resources.filter((item) => item.id !== resourceId) }); return true; },
    async activate(_tenantId, id, _principalId, effectiveAt) { const hold = holds.get(id); return hold?.status === "draft" ? update({ ...hold, status: "active", effectiveAt }) : undefined; },
    async release(_tenantId, id, _principalId, releasedAt) { const hold = holds.get(id); return hold?.status === "active" ? update({ ...hold, status: "released", releasedAt, resources: hold.resources.map((resource): LegalHoldResource => ({ ...resource, releasedAt })) }) : undefined; },
  };
  return repository;
}
