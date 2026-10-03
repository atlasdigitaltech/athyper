import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { AuthoringConflictError } from "@athyper/server-contract-meta-entity-authoring";
import { registerProductReviewRoutes } from "./product-review-routes.js";
let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((resolve) =>
    server ? server.close(() => resolve()) : resolve(),
  );
  server = undefined;
});
async function fixture() {
  const app = express();
  app.use(express.json());
  const inspect = vi.fn(async () => ({ contractHash: "a".repeat(64) })),
    execute = vi.fn(async () => ({ status: "draft" }));
  registerProductReviewRoutes(app, {
    basePath: "/api/platform-control/meta-entity-authoring",
    authenticate: (req, res, next) => {
      if (req.headers.authorization !== "Bearer test") {
        res.sendStatus(401);
        return;
      }
      next();
    },
    readContext: () => ({ principalId: "admin" }) as VerifiedRequestContext,
    inspect,
    execute,
  });
  server = app.listen(0);
  await new Promise<void>((r) => server!.once("listening", r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/platform-control/meta-entity-authoring/change-sets/${randomUUID()}`,
    inspect,
    execute,
    headers: {
      authorization: "Bearer test",
      "content-type": "application/json",
    },
    body: {
      requestId: randomUUID(),
      expectedRevision: 1,
      expectedContractHash: "a".repeat(64),
    },
  };
}
it("requires authentication and retains a read-only graph endpoint", async () => {
  const f = await fixture();
  expect((await fetch(f.url + "/graph")).status).toBe(401);
  expect(f.inspect).not.toHaveBeenCalled();
  const r = await fetch(f.url + "/graph", { headers: f.headers });
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
});
it("does not expose publishing, activation or graph editing on the control review surface", async () => {
  const f = await fixture();
  for (const action of ["publish", "activate", "fork", "graph"])
    expect(
      (
        await fetch(f.url + "/" + action, {
          method: "POST",
          headers: f.headers,
          body: JSON.stringify(f.body),
        })
      ).status,
    ).toBe(404);
  expect(f.execute).not.toHaveBeenCalled();
});
it("rejects privilege, break-glass and unpinned command input", async () => {
  const f = await fixture();
  for (const body of [
    { ...f.body, breakGlass: {} },
    { ...f.body, actorId: "owner" },
    { ...f.body, expectedRevision: -1 },
    { ...f.body, expectedContractHash: "invalid" },
  ])
    expect(
      (
        await fetch(f.url + "/adopt", {
          method: "POST",
          headers: f.headers,
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(400);
  expect(f.execute).not.toHaveBeenCalled();
});
it("dispatches only validated commands with the authenticated context", async () => {
  const f = await fixture();
  expect(
    (
      await fetch(f.url + "/submit", {
        method: "POST",
        headers: f.headers,
        body: JSON.stringify(f.body),
      })
    ).status,
  ).toBe(200);
  expect(f.execute.mock.calls[0]?.slice(0, 1)).toEqual([
    { principalId: "admin" },
  ]);
});
it("returns a conflict for a stale or rebound review command", async () => {
  const f = await fixture();
  f.execute.mockRejectedValueOnce(new AuthoringConflictError("stale"));
  expect(
    (
      await fetch(f.url + "/approve", {
        method: "POST",
        headers: f.headers,
        body: JSON.stringify(f.body),
      })
    ).status,
  ).toBe(409);
});
