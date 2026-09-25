import { readFileSync } from "node:fs";
import express from "express";
import { expect, it, vi } from "vitest";
import { AuthoringConflictError } from "@athyper/server-contract-meta-entity-authoring";
import { MetaEntityAuthoringService } from "../authoring-service.js";
import { registerMetaEntityAuthoringRoutes } from "../routes.js";
import { validateGraph } from "../deterministic.js";
it("uses authenticated tenant/plane/revision guards for collection save and side-effect-free preview", async () => {
  let graph = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../../tooling/fixtures/collections/inbox.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const id = "00000000-0000-4000-8000-000000000001";
  let row = { id, tenantId: "tenant-a", revision: 0, status: "draft" },
    tenantId = "tenant-a",
    planeKey = "studio",
    authorized = true,
    authenticated = true;
  const repository = {
    get: vi.fn(async () => row),
    loadGraph: vi.fn(async () => structuredClone(graph)),
    replaceGraph: vi.fn(async (input: any) => {
      if (input.expectedRevision !== row.revision || row.status !== "draft")
        throw new AuthoringConflictError("Reload draft");
      expect(validateGraph(input.graph).issues).toEqual([]);
      graph = structuredClone(input.graph);
      row = { ...row, revision: row.revision + 1 };
      return row;
    }),
  };
  const publication = { publish: vi.fn() },
    signer = { sign: vi.fn() };
  const app = express();
  app.use(express.json());
  registerMetaEntityAuthoringRoutes(app, {
    authenticate: (_q, s, next) => {
      if (!authenticated) {
        s.sendStatus(401);
        return;
      }
      next();
    },
    readContext: () => ({ tenantId, planeKey, principalId: "author" }) as never,
    authorizer: { authorize: async () => ({ allowed: authorized }) } as never,
    service: new MetaEntityAuthoringService({
      repository: repository as never,
      publication: publication as never,
      signer: signer as never,
    }),
  });
  app.use((e: any, _q: any, s: any, _n: any) =>
    s.status(e.code === "FORBIDDEN" ? 403 : 500).json({ code: e.code }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/meta-entity-authoring/change-sets/${id}/collection`;
  const call = (path: string, method = "GET", body?: unknown) =>
    fetch(base + path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  try {
    const configuration =
      graph.surfaces[0].layoutConfig.collectionConfiguration;
    expect((await (await call("")).json()).configuration.collectionKey).toBe(
      "activity.inbox",
    );
    const changed = {
      ...configuration,
      defaultState: { ...configuration.defaultState, density: "compact" },
    };
    expect(
      (await call("", "PUT", { expectedRevision: 0, configuration: changed }))
        .status,
    ).toBe(200);
    expect(
      (await call("", "PUT", { expectedRevision: 0, configuration: changed }))
        .status,
    ).toBe(409);
    expect(
      (
        await call("", "PUT", {
          expectedRevision: 1,
          configuration: { ...changed, providerKey: "unknown" },
        })
      ).status,
    ).toBe(422);
    const preview = await (await call("/preview", "POST", {})).json();
    expect(preview).toMatchObject({
      revision: 1,
      synthetic: true,
      sent: false,
      actionsExecuted: false,
      configuration: { defaultState: { density: "compact" } },
    });
    expect(preview.rows).toHaveLength(1);
    expect((await (await call("/validate", "POST", {})).json()).valid).toBe(
      true,
    );
    row = { ...row, status: "published" };
    expect(
      (await call("", "PUT", { expectedRevision: 1, configuration: changed }))
        .status,
    ).toBe(409);
    expect(publication.publish).not.toHaveBeenCalled();
    expect(signer.sign).not.toHaveBeenCalled();
    tenantId = "tenant-b";
    expect((await call("")).status).toBe(403);
    tenantId = "tenant-a";
    authorized = false;
    expect((await call("")).status).toBe(403);
    authorized = true;
    planeKey = "neon";
    expect((await call("")).status).toBe(403);
    planeKey = "studio";
    authenticated = false;
    expect((await call("")).status).toBe(401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
