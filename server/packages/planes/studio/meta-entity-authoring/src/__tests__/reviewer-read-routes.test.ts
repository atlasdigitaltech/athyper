import express from "express";
import { expect, it, vi } from "vitest";
import { registerMetaEntityAuthoringRoutes } from "../routes.js";
import { MetaEntityAuthoringService } from "../authoring-service.js";
const id = "00000000-0000-4000-8000-000000000001";
it("allows tenant-scoped reviewer reads while preserving author-only writes and MFA", async () => {
  let elevated = true,
    planeKey = "studio",
    tenantId = "tenant-a",
    reviewer = true;
  const row = { id, tenantId: "tenant-a", revision: 62, status: "in_review" };
  const repository = {
    listDraftSaves: vi.fn(async () => [{revision:1,capturedAt:"2026-09-16",kind:"saved"}]),
    readDraftSave: vi.fn(async () => ({entity:{entityCode:"bp"}})),
    get: vi.fn(async () => row),
    list: vi.fn(async () => [row]),
    loadGraph: vi.fn(async () => ({ entity: { entityCode: "bp" } })),
    listInspectionReleases: vi.fn(async () => [{ id }]),
    readInspectionRelease: vi.fn(async (t: string) =>
      t === "tenant-a" ? { release: { id }, graph: {} } : null,
    ),
    replaceGraph: vi.fn(),
    forkDraft: vi.fn(),
    createDraft: vi.fn(),
  };
  const authorize = vi.fn(async ({ permissionCode, resource }: any) => {
    if (permissionCode !== "metadata.entity.review" || !reviewer)
      return { allowed: false, reason: "missing_permission" };
    expect(resource.tenantId).toBe(tenantId);
    return elevated
      ? { allowed: true }
      : { allowed: false, reason: "mfa_required" };
  });
  const inspectionAuthorize = vi.fn((input: Parameters<typeof authorize>[0]) => authorize(input));
  const app = express();
  app.use(express.json());
  registerMetaEntityAuthoringRoutes(app, {
    addressPreviewChoices: async () => ({"iso.country": [], "shared.state_region": []}),
    authenticate: (_q, _s, n) => n(),
    readContext: () => ({ planeKey, tenantId, principalId: "owner" }) as never,
    authorizer: { authorize } as never,
    inspectionAuthorizer: { authorize: inspectionAuthorize } as never,
    service: new MetaEntityAuthoringService({
      repository: repository as never,
      signer: {} as never,
      publication: {} as never,
    }),
  });
  app.use((e: any, _q: any, s: any, _n: any) =>
    s.status(e.code === "FORBIDDEN" ? 403 : 500).json({ error: e.code }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/meta-entity-authoring`;
  const reads = [
    "/inspection/address-preview-choices",
    "/inspection/releases",
    `/inspection/releases/${id}`,
    "/change-sets",
    `/change-sets/${id}/history`,
    `/change-sets/${id}/history/1`,
    `/change-sets/${id}/graph`,
  ];
  try {
    for (const path of reads) {
      const res = await fetch(base + path);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
    inspectionAuthorize.mockClear();
    for (const [method, path] of [
      ["PUT", `/change-sets/${id}/graph`],
      ["POST", "/change-sets"],
      ["POST", `/change-sets/${id}/fork`],
      ["POST", `/change-sets/${id}/publish`],
    ])
      expect((await fetch(base + path, { method })).status).toBe(403);
    expect(inspectionAuthorize).not.toHaveBeenCalled();
    expect(repository.replaceGraph).not.toHaveBeenCalled();
    expect(repository.forkDraft).not.toHaveBeenCalled();
    expect(repository.createDraft).not.toHaveBeenCalled();
    tenantId = "tenant-b";
    expect(
      (await fetch(base + `/inspection/releases/${id}?tenantId=tenant-a`))
        .status,
    ).toBe(404);
    expect(
      (await fetch(base + `/change-sets/${id}/graph?tenantId=tenant-a`)).status,
    ).toBe(403);
    tenantId = "tenant-a";
    elevated = false;
    for (const path of [...reads, `/change-sets/${id}/approve`]) {
      const res = await fetch(
        base + path,
        path.endsWith("approve") ? { method: "POST" } : {},
      );
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ reason: "mfa_required" });
    }
    elevated = true;
    reviewer = false;
    for (const path of reads)
      expect((await fetch(base + path)).status).toBe(403);
    reviewer = true;
    planeKey = "neon";
    authorize.mockClear();
    expect((await fetch(base + reads[0])).status).toBe(403);
    expect(authorize).not.toHaveBeenCalled();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
