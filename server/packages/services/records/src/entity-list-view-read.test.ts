import express from "express";
import { expect, it } from "vitest";
import { readEvidence } from "@athyper/server-foundation/context";
import { registerEntityListRoutes } from "./entity-list-routes.js";

it("combines views only after scope authorization, sharing evidence within each read", async () => {
  const context = { tenantId: "tenant", principalId: "actor", planeKey: "neon" };
  const provider = {};
  let reads = 0, descriptors = 0, catalogs = 0, denied = false;
  const evidence = () => readEvidence(provider, context, "metadata", async () => ++reads);
  const app = express();
  registerEntityListRoutes(app, {
    diagnostics: true,
    authenticate: (_req, _res, next) => next(),
    readContext: () => context as never,
    lists: { descriptor: async (_context: unknown, _entity: string, scope: unknown) => {
      descriptors++;
      expect(scope).toEqual({ parentEntityCode: "principal", parentRecordId: "01a0d433-806b-7874-862d-49a9b955f6a1", relationshipKey: "notifications" });
      await evidence();
      return { entity: { code: "principal_notification_preference" }, serverViews: true,
        scope: { status: denied ? "denied" : "ready" }, surface: { key: "entity_list" } };
    } } as never,
    viewCatalog: async (_context, _descriptor, surface) => {
      catalogs++;
      expect(surface).toBe("principal.notifications");
      await evidence();
      return { views: [], personalDefault: "system" };
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No address");
  const url = `http://127.0.0.1:${address.port}/api/entity-runtime/principal_notification_preference/list-descriptor?includeViews=true&surface=principal.notifications&parentEntityCode=principal&parentRecordId=01a0d433-806b-7874-862d-49a9b955f6a1&relationshipKey=notifications`;
  try {
    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect((await response.json()).viewCatalog.personalDefault).toBe("system");
      expect(response.headers.get("server-timing")).toMatch(/descriptor;dur=.*views;dur=.*total;dur=/);
    }
    expect({ reads, descriptors, catalogs }).toEqual({ reads: 2, descriptors: 2, catalogs: 2 });
    denied = true;
    expect((await (await fetch(url)).json()).viewCatalog).toBeUndefined();
    expect(catalogs).toBe(2);
    expect((await fetch(url.replace("surface=principal.notifications", "surface=INVALID"))).status).toBe(400);
    expect(descriptors).toBe(3);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
