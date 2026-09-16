import express from "express";
import { expect, it, vi } from "vitest";
import { registerMetaEntityAuthoringRoutes } from "../routes.js";
import { MetaEntityAuthoringService } from "../authoring-service.js";
const id = "00000000-0000-4000-8000-000000000001";
it("reads immutable release evidence under the authenticated tenant and denies unauthorized callers", async () => {
  let tenantId = "tenant-a",
    authorized = true;
  const stored = {
    release: { id, releaseNo: 3 },
    graph: {
      entity: { entityCode: "business_partner" },
      fields: [{ fieldKey: "release_field" }],
    },
  };
  const repository = {
    listInspectionReleases: vi.fn(async (tenant: string) =>
      tenant === "tenant-a" ? [stored.release] : [],
    ),
    readInspectionRelease: vi.fn(async (tenant: string) =>
      tenant === "tenant-a" ? stored : null,
    ),
    loadGraph: vi.fn(),
  };
  const app = express();
  registerMetaEntityAuthoringRoutes(app, {
    authenticate: (_q, _s, next) => next(),
    readContext: () =>
      ({ planeKey: "studio", tenantId, principalId: "reader" }) as never,
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
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api/meta-entity-authoring/inspection/releases`;
  try {
    expect(await (await fetch(base)).json()).toEqual([stored.release]);
    const response = await fetch(`${base}/${id}`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(stored);
    expect(repository.loadGraph).not.toHaveBeenCalled();
    tenantId = "tenant-b";
    expect((await fetch(`${base}/${id}?tenantId=tenant-a`)).status).toBe(404);
    expect(repository.readInspectionRelease).toHaveBeenLastCalledWith(
      "tenant-b",
      id,
    );
    authorized = false;
    repository.readInspectionRelease.mockClear();
    expect((await fetch(`${base}/${id}`)).status).toBe(403);
    expect(repository.readInspectionRelease).not.toHaveBeenCalled();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
it("activation inspection requires deployment-view access and resolves source under the caller tenant", async () => {
  let allowed = false;
  const inspectActivation = vi.fn(async () => ({ targets: [] }));
  const readInspectionRelease = vi.fn(async (tenant: string) =>
    tenant === "tenant-a" ? { release: { id }, graph: {} } : null,
  );
  let tenantId = "tenant-a";
  const app = express();
  registerMetaEntityAuthoringRoutes(app, {
    authenticate: (_q, _s, next) => next(),
    readContext: () =>
      ({ planeKey: "studio", tenantId, principalId: "reader" }) as never,
    authorizer: {
      authorize: async ({ permissionCode }: any) => ({
        allowed: allowed && permissionCode === "publication.deployment.view",
      }),
    } as never,
    service: new MetaEntityAuthoringService({
      repository: { readInspectionRelease } as never,
      signer: {} as never,
      publication: {} as never,
    }),
    inspectActivation,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/meta-entity-authoring/inspection/releases/${id}/activation`;
  try {
    expect((await fetch(base)).status).toBe(403);
    expect(inspectActivation).not.toHaveBeenCalled();
    allowed = true;
    tenantId = "tenant-b";
    expect((await fetch(base)).status).toBe(404);
    expect(inspectActivation).not.toHaveBeenCalled();
    tenantId = "tenant-a";
    const response = await fetch(base);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(inspectActivation).toHaveBeenCalledOnce();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
