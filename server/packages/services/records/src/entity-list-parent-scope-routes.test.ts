import { createServer } from "node:http";
import express from "express";
import { expect, it, vi } from "vitest";
import { registerEntityListRoutes } from "./entity-list-routes.js";

it("admits the parent publication pin through the HTTP contract and rejects incomplete scope", async () => {
  const list = vi.fn(async () => ({ rows: [] }));
  const app = express();
  registerEntityListRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    readContext: () => ({ tenantId: "tenant", principalId: "principal", planeKey: "neon" }) as never,
    lists: { list } as never,
  });
  app.use((error: { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ rejected: true });
  });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw Error("Missing test address");
    const url = `http://127.0.0.1:${address.port}/api/entity-runtime/principal_notification_preference/list`;
    const scope = {
      parentEntityCode: "principal",
      parentRecordId: "d04198ac-53cf-5e94-969f-b6f75f176fa2",
      relationshipKey: "notifications",
      parentDescriptorHash: "a".repeat(64),
    };
    expect((await fetch(`${url}?${new URLSearchParams(scope)}`)).status).toBe(200);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ scopeCoordinate: scope }));
    list.mockClear();
    expect((await fetch(`${url}?parentDescriptorHash=${scope.parentDescriptorHash}`)).status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
