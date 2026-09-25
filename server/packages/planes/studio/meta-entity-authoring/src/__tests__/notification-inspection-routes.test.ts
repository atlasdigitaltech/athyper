import express from "express";
import { expect, it, vi } from "vitest";
import { registerMetaEntityAuthoringRoutes } from "../routes.js";
it("gates Neon configuration inspection with Studio publication authority and authenticated tenant", async () => {
  let planeKey = "studio",
    allowed = true;
  const authorize = vi.fn(async (input: any) => ({
    allowed: allowed && !input.resource?.entityCode,
  }));
  const inspect = vi.fn(
    async () =>
      ({ entityCode: "business_partner", releaseId: "release" }) as
        unknown | null,
  );
  const app = express();
  app.use(express.json());
  registerMetaEntityAuthoringRoutes(app, {
    authenticate: (_q, _s, n) => n(),
    readContext: () =>
      ({ planeKey, tenantId: "tenant-a", principalId: "publisher" }) as never,
    authorizer: { authorize } as never,
    service: {} as never,
    inspectNotificationConfiguration: inspect,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/meta-entity-authoring/inspection/notifications/business_partner`;
  try {
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(authorize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        permissionCode: "publication.deployment.view",
        resource: { tenantId: "tenant-a" },
      }),
    );
    expect(inspect).toHaveBeenLastCalledWith(
      expect.objectContaining({ tenantId: "tenant-a", planeKey: "studio" }),
      "business_partner",
    );
    inspect.mockResolvedValueOnce(null);
    expect((await fetch(url)).status).toBe(404);
    allowed = false;
    expect((await fetch(url)).status).toBe(403);
    allowed = true;
    planeKey = "neon";
    expect((await fetch(url)).status).toBe(403);
    expect(inspect).toHaveBeenCalledTimes(2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
