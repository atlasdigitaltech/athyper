import { describe, expect, it } from "vitest";
import { createSavedViewService, SavedViewVersionConflict, type SavedView, type SavedViewRepository } from "./index.js";

describe("saved views", () => {
  it("forces principal/tenant scope and optimistic versions", async () => {
    let row: SavedView | undefined;
    const preferences = new Map<string, unknown>();
    const repo: SavedViewRepository = {
      list: async () => row ? [row] : [],
      get: async (query) => row?.tenantId === query.tenantId && (row.scope !== "personal" || row.ownerPrincipalId === query.principalId) ? row : undefined,
      create: async (_plane, view) => { row = view; },
      replace: async (_plane, view, expected) => { if (row?.version !== expected) return undefined; row = { ...view, version: expected + 1 }; return expected + 1; },
      archive: async () => { if (!row) return false; row = { ...row, status: "archived" }; return true; },
      setScope: async (_scope, _id, nextScope) => { if (!row) return false; row = { ...row, scope: nextScope, ...(nextScope === "shared" ? { ownerPrincipalId: undefined } : {}) }; return true; },
      clone: async (_scope, _source, clone) => { row = clone; },
      getPreference: async (_scope, code, surface) => preferences.get(`${code}:${surface}`),
      setPreference: async (_scope, code, surface, value) => { preferences.set(`${code}:${surface}`, value); },
      clearPreference: async (_scope, code, surface) => { preferences.delete(`${code}:${surface}`); },
    };
    let sequence = 0;
    const service = createSavedViewService(repo, () => `view-${++sequence}`), scope = { planeKey: "neon" as const, tenantId: "t1", principalId: "p1" };
    const made = await service.create(scope, { surfaceCode: "records", entityCode: "supplier", code: "mine", name: "Mine", state: { filters: [] } });
    expect(made).toMatchObject({ tenantId: "t1", ownerPrincipalId: "p1", scope: "personal", status: "active", version: 1 });
    await expect(service.replace(scope, "view-1", 0, { name: "New", state: {} })).rejects.toBeInstanceOf(SavedViewVersionConflict);
    expect((await service.replace(scope, "view-1", 1, { name: "New", state: {} })).version).toBe(2);
  });

  it("supports default, pin, star, share, archive, and clone operations", async () => {
    const rows = new Map<string, SavedView>(); const preferences = new Map<string, unknown>(); let sequence = 0;
    const repository: SavedViewRepository = {
      list: async () => [...rows.values()], get: async ({ id }) => rows.get(id), create: async (_plane, view) => { rows.set(view.id, view); }, replace: async () => undefined,
      archive: async (_scope, id) => { const row = rows.get(id); if (!row) return false; rows.set(id, { ...row, status: "archived" }); return true; },
      setScope: async (_scope, id, nextScope) => { const row = rows.get(id); if (!row) return false; rows.set(id, { ...row, scope: nextScope, ...(nextScope === "shared" ? { ownerPrincipalId: undefined } : {}) }); return true; },
      clone: async (_scope, _source, clone) => { rows.set(clone.id, clone); }, getPreference: async (_scope, code, surface) => preferences.get(`${code}:${surface}`), setPreference: async (_scope, code, surface, value) => { preferences.set(`${code}:${surface}`, value); }, clearPreference: async (_scope, code, surface) => { preferences.delete(`${code}:${surface}`); },
    };
    const service = createSavedViewService(repository, () => `view-${++sequence}`), scope = { planeKey: "studio" as const, tenantId: "tenant", principalId: "principal" };
    const view = await service.create(scope, { surfaceCode: "entity_list", entityCode: "supplier", code: "all", name: "All", state: {} });
    await service.setDefault(scope, "supplier", view.id); expect((await service.list(scope))[0]?.isDefault).toBe(true);
    expect(await service.toggleFlag(scope, view.id, "pinned")).toEqual({ enabled: true }); expect((await service.list(scope))[0]?.isPinned).toBe(true);
    await service.setShared(scope, view.id, true); expect(rows.get(view.id)?.scope).toBe("shared");
    const cloned = await service.clone(scope, view.id); expect(cloned).toMatchObject({ scope: "personal", ownerPrincipalId: "principal" });
    await service.archive(scope, cloned.id); expect(rows.get(cloned.id)?.status).toBe("archived");
  });
});
