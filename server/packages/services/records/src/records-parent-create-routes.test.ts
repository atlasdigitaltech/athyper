import { createServer } from "node:http";
import express from "express";
import { expect, it, vi } from "vitest";
import { registerRecordsRoutes } from "./records-routes.js";

it("forwards the pinned parent to ordinary creation and rejects malformed or incomplete scope", async () => {
  const create = vi.fn(async () => ({
    kind: "Committed",
    action: "create",
    entityCode: "sample_child",
    recordId: "20000000-0000-4000-8000-000000000001",
    replayed: false,
  }));
  const app = express();
  app.use(express.json());
  registerRecordsRoutes(app, {
    authenticate: (_req, _res, next) => next(),
    readContext: () =>
      ({
        tenantId: "tenant",
        principalId: "principal",
        planeKey: "neon",
      }) as never,
    queries: {} as never,
    mutations: { create } as never,
  });
  app.use(
    (
      error: { statusCode?: number; status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(error.statusCode ?? error.status ?? 500)
        .json({ rejected: true });
    },
  );
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("Missing test address");
    const url = `http://127.0.0.1:${address.port}/api/records/sample_child`;
    const scope = {
      parentEntityCode: "sample_owner",
      parentRecordId: "10000000-0000-4000-8000-000000000001",
      relationshipKey: "settings",
      parentDescriptorHash: "a".repeat(64),
    };
    const post = (query: Record<string, string>) =>
      fetch(`${url}?${new URLSearchParams(query)}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "test-create-key-0001",
        },
        body: JSON.stringify({ name: "Saved setting" }),
      });
    expect((await post(scope)).status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeCoordinate: scope,
        input: { name: "Saved setting" },
        origin: "classic",
        validationMode: "strict",
      }),
    );
    create.mockClear();
    for (const query of [
      { ...scope, parentDescriptorHash: "invalid" },
      { parentDescriptorHash: scope.parentDescriptorHash },
    ]) {
      expect((await post(query)).status).toBe(400);
      expect(create).not.toHaveBeenCalled();
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
