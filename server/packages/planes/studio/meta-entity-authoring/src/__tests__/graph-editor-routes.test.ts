import { expect, it, vi } from "vitest";
import express from "express";
import { registerMetaEntityAuthoringRoutes } from "../routes.js";
import { MetaEntityAuthoringService } from "../authoring-service.js";
const id = "00000000-0000-4000-8000-000000000001";
it("graph loading and forking enforce the authenticated tenant and author permission", async () => {
  let tenantId = "tenant-a",
    authorized = true;
  const graph = { entity: { entityCode: "invoice" } },
    row = { id, tenantId: "tenant-a", revision: 1, status: "published" };
  const repository = {
    get: vi.fn(async () => row),
    list: vi.fn(async () => [row]),
    loadGraph: vi.fn(async () => graph),
    forkDraft: vi.fn(async () => ({ ...row, status: "draft" })),
  };
  const app = express();
  app.use(express.json());
  registerMetaEntityAuthoringRoutes(app, {
    authenticate: (_q, _s, next) => next(),
    readContext: () =>
      ({ planeKey: "studio", tenantId, principalId: "author" }) as never,
    authorizer: {
      authorize: async ({ permissionCode }: any) => ({
        allowed: authorized && permissionCode === "metadata.entity.author",
      }),
    } as never,
    service: new MetaEntityAuthoringService({
      repository: repository as never,
      signer: {} as never,
      publication: {} as never,
    }),
  });
  app.use((error: any, _q: any, s: any, _n: any) =>
    s.status(error.code === "FORBIDDEN" ? 403 : 409).json({ code: error.code }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/meta-entity-authoring/change-sets`;
  try {
    expect((await fetch(base)).status).toBe(200);
    expect(repository.list).toHaveBeenCalledWith("tenant-a");
    expect(await (await fetch(`${base}/${id}/graph`)).json()).toMatchObject({
      changeSet: row,
      graph,
    });
    expect((await fetch(`${base}/${id}/fork`, { method: "POST" })).status).toBe(
      201,
    );
    tenantId = "tenant-b";
    expect((await fetch(`${base}/${id}/graph`)).status).toBe(403);
    expect((await fetch(`${base}/${id}/fork`, { method: "POST" })).status).toBe(
      403,
    );
    expect(repository.forkDraft).toHaveBeenCalledTimes(1);
    expect(repository.loadGraph).toHaveBeenCalledTimes(1);
    authorized = false;
    expect((await fetch(base)).status).toBe(403);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
it("graph reads reject a revision that advances during loading", async () => {
  const get = vi
    .fn()
    .mockResolvedValueOnce({ id, revision: 1 })
    .mockResolvedValueOnce({ id, revision: 2 });
  const service = new MetaEntityAuthoringService({
    repository: { get, loadGraph: async () => ({}) } as never,
    signer: {} as never,
    publication: {} as never,
  });
  await expect(service.readGraph(id)).rejects.toThrow("changed while loading");
});
