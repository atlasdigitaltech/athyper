import { createServer } from "node:http";
import express from "express";
import { it, expect } from "vitest";
import { setup } from "../process-selection/setup.test-helper.js";
import { registerProcessSelectionPreviewRoutes } from "./process-selection-routes.js";

it("previews through real HTTP and the real selection service; rejects caller facts and anonymous access", async () => {
  const s = setup(),
    app = express();
  app.use(express.json());
  registerProcessSelectionPreviewRoutes(app, {
    authenticate: (req, res, next) => {
      if (req.headers.authorization !== "test-session") {
        res.status(401).end();
        return;
      }
      next();
    },
    readContext: () => s.context,
    transactions: { run: async (_plane, _actor, work) => work({}) },
    service: s.service,
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("address unavailable");
    const url = `http://127.0.0.1:${address.port}/api/governance/process-selection/cases/${s.facts.caseId}/preview`;
    expect((await fetch(url)).status).toBe(401);
    const ready = await fetch(url, {
      headers: { authorization: "test-session" },
    });
    expect(ready.status).toBe(200);
    expect(ready.headers.get("cache-control")).toBe("no-store");
    expect(await ready.json()).toMatchObject({
      status: "ready",
      selection: { candidateProfile: { code: "simple" } },
    });
    expect(
      (
        await fetch(url + "?minimumProfile=simple", {
          headers: { authorization: "test-session" },
        })
      ).status,
    ).toBe(400);
    expect(s.append).not.toHaveBeenCalled();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
