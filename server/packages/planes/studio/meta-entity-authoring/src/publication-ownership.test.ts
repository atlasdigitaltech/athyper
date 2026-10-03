import express from "express";
import { expect, it, vi } from "vitest";
import { MetaEntityAuthoringService } from "./authoring-service.js";
import { registerMetaEntityAuthoringRoutes } from "./routes.js";

it("inherited product inspection does not grant tenant authors product write authority", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const release = { id, sourceScope: "product", sourceTenantId: null };
  const transition = vi.fn();
  const repository = {
    readInspectionRelease: vi.fn(async () => ({ release, graph: {} })),
    get: async () => ({ id, tenantId: null, status: "in_review", createdBy: "platform-author", submittedBy: "platform-author" }),
    transition,
  };
  const app = express();
  app.use(express.json());
  registerMetaEntityAuthoringRoutes(app, {
    authenticate: (_request, _response, next) => next(),
    readContext: () => ({ planeKey: "studio", tenantId: "tenant-a", principalId: "tenant-owner" }) as never,
    authorizer: { authorize: async ({ permissionCode }: { permissionCode: string }) => ({ allowed: permissionCode !== "studio.platform.catalog.manage" }) } as never,
    service: new MetaEntityAuthoringService({ repository: repository as never, signer: {} as never, publication: {} as never }),
  });
  app.use((error: { code?: string }, _request: unknown, response: express.Response, _next: unknown) => response.status(error.code === "FORBIDDEN" ? 403 : 409).json({ code: error.code }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const inspection = await fetch(`${origin}/api/meta-entity-authoring/inspection/releases/${id}`);
    expect(inspection.status).toBe(200);
    expect((await inspection.json()).release).toEqual(release);
    const approval = await fetch(`${origin}/api/meta-entity-authoring/change-sets/${id}/approve`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: 1 }),
    });
    expect(approval.status).toBe(403);
    expect(transition).not.toHaveBeenCalled();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

it("platform catalog authority permits product maintenance but never another tenant's change set", async () => {
  let sourceTenantId: string | null = null;
  const service = new MetaEntityAuthoringService({
    repository: { get: async () => ({ tenantId: sourceTenantId }) } as never,
    signer: {} as never, publication: {} as never,
  });
  await expect(service.assertTenant("source", "authority-tenant", true)).resolves.toBeUndefined();
  sourceTenantId = "another-tenant";
  await expect(service.assertTenant("source", "authority-tenant", true)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
