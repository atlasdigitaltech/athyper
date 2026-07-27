import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { registerNotificationRoutes } from "../routes/notification.route.js";

const servers: Array<ReturnType<ReturnType<typeof express>["listen"]>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    ),
  ));
});

describe("notification plane trust boundary", () => {
  it("rejects a client query plane when the trusted X-Plane header is absent", async () => {
    const app = express();
    app.use(express.json());
    const router = express.Router();
    registerNotificationRoutes(router, {
      db: {} as never,
      auth: { verifyToken: async () => ({ sub: "subject-1" }) },
    });
    app.use(router);

    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;

    const response = await fetch(
      `http://127.0.0.1:${port}/notifications/capabilities?plane=mesh`,
      { headers: { Authorization: "Bearer test" } },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "PLANE_CONTEXT_REQUIRED",
    });
  });
});
