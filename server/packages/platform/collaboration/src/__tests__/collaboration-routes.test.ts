import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { CollaborationService } from "@athyper/server-contract-collaboration";
import { registerCollaborationRoutes } from "../collaboration-routes.js";

const id = "44444444-4444-4444-8444-444444444444";
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});
async function harness() {
  const service = {
    create: vi.fn(async () => ({ id })),
    edit: vi.fn(async () => ({ id })),
    remove: vi.fn(async () => true),
    putReaction: vi.fn(async () => true),
    deleteReaction: vi.fn(async () => true),
    putDraft: vi.fn(async () => undefined),
    deleteDraft: vi.fn(async () => true),
    markRead: vi.fn(async () => undefined),
    flag: vi.fn(async () => id),
  };
  const app = express();
  app.use(express.json());
  registerCollaborationRoutes(app, {
    authenticate: (_r, _s, next) => next(),
    readContext: () =>
      ({
        tenantId: "trusted-tenant",
        principalId: "trusted-user",
      }) as VerifiedRequestContext,
    collaboration: service as unknown as CollaborationService,
  });
  app.use(((error, _req, res, _next) => {
    res.status(500).json({ error: error.message });
  }) as express.ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing address");
  return {
    service,
    request: (method: string, path: string, body?: unknown) =>
      fetch(`http://127.0.0.1:${address.port}/api/collab${path}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
  };
}
const body = {
  entityType: "content.item",
  entityId: "article-1",
  text: "hello",
};
describe("collaboration HTTP boundary", () => {
  it.each([
    ["POST", "/comments", { ...body, intent: 1 }],
    ["POST", "/comments", { ...body, content: [] }],
    ["PATCH", `/comments/${id}`, { text: "edit", expectedUpdatedAt: 123 }],
    ["POST", "/comments/mark-all-read", { ...body, readAt: {} }],
    [
      "DELETE",
      "/drafts?entityType=content.item&entityId=article-1&parentCommentId=bad",
      undefined,
    ],
  ])("rejects malformed %s %s", async (method, path, payload) => {
    const h = await harness();
    const response = await h.request(method as string, path as string, payload);
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    for (const handler of Object.values(h.service))
      expect(handler).not.toHaveBeenCalled();
  });
  it("dispatches all ten mutation routes with trusted context", async () => {
    const h = await harness();
    const requests = [
      ["POST", "/comments", body, 201],
      ["PATCH", `/comments/${id}`, { text: "edit" }, 200],
      ["DELETE", `/comments/${id}`, undefined, 204],
      ["POST", `/comments/${id}/flag`, { reasonCode: "spam" }, 201],
      ["POST", `/comments/${id}/reactions`, { code: "thumbs_up" }, 201],
      ["DELETE", `/comments/${id}/reactions/thumbs_up`, undefined, 200],
      ["POST", `/comments/${id}/replies`, body, 201],
      ["POST", "/comments/mark-all-read", body, 204],
      ["POST", "/drafts", body, 204],
      [
        "DELETE",
        "/drafts?entityType=content.item&entityId=article-1",
        undefined,
        200,
      ],
    ] as const;
    for (const [method, path, payload, status] of requests)
      expect((await h.request(method, path, payload)).status).toBe(status);
    expect(h.service.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        parentCommentId: id,
        context: { tenantId: "trusted-tenant", principalId: "trusted-user" },
      }),
    );
  });
  it("does not misreport internal TypeErrors as client validation errors", async () => {
    const h = await harness();
    h.service.create.mockRejectedValueOnce(new TypeError("internal failure"));
    expect((await h.request("POST", "/comments", body)).status).toBe(500);
  });
});
