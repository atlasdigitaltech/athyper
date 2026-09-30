import { readFileSync } from "node:fs";
import express from "express";
import { expect, it, vi } from "vitest";
import { AuthoringConflictError } from "@athyper/server-contract-meta-entity-authoring";
import { MetaEntityAuthoringService } from "../authoring-service.js";
import { registerMetaEntityAuthoringRoutes } from "../routes.js";
import { validateGraph } from "../deterministic.js";
it("uses authenticated tenant/plane/revision guards for draft template save and side-effect-free preview", async () => {
  let graph = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../../tooling/fixtures/notifications/business-partner-inherit.json",
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
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/meta-entity-authoring/change-sets/${id}/notifications/comments`;
  const call = (path: string, method = "GET", body?: unknown) =>
    fetch(base + path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  try {
    expect((await (await call("/templates")).json()).shared.length).toBe(6);
    const template = {
      key: "bp_mention",
      channel: "email",
      locale: "en",
      version: 1,
      subject: "BP mention",
      bodyText: "{{excerpt}}",
      variables: { excerpt: "string" },
    };
    expect(
      (
        await call("/templates/bp_mention", "PUT", {
          expectedRevision: 0,
          template,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("/templates/bp_mention", "PUT", {
          expectedRevision: 0,
          template,
        })
      ).status,
    ).toBe(409);
    expect(
      (await call("/templates/bp_mention?channel=email&version=1")).status,
    ).toBe(200);
    const reference = {
      key: "bp_mention",
      channel: "email",
      locale: "en",
      version: 1,
    };
    const rendered = await (
      await call("/preview", "POST", {
        reference,
        variables: { excerpt: "<b>synthetic</b>" },
      })
    ).json();
    expect(rendered).toMatchObject({
      sent: false,
      preview: { bodyHtml: "<p>&lt;b&gt;synthetic&lt;/b&gt;</p>" },
    });
    expect(
      (await call("/preview", "POST", { reference, variables: {} })).status,
    ).toBe(422);
    expect(
      (
        await call("/policy", "PUT", {
          expectedRevision: 1,
          policy: {
            schemaVersion: 2,
            mode: "disabled",
            defaultPolicyRef: "platform.comments.notifications.v1",
            rules: [],
          },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call("/policy", "PUT", {
          expectedRevision: 1,
          policy: {
            schemaVersion: 1,
            mode: "disabled",
            defaultPolicyRef: "platform.comments.notifications.v1",
            rules: [],
          },
        })
      ).status,
    ).toBe(200);
    expect((await (await call("")).json()).projection.rules).toEqual([]);
    row = { ...row, status: "published" };
    expect(
      (
        await call("/templates/bp_mention", "PUT", {
          expectedRevision: 2,
          template,
        })
      ).status,
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
