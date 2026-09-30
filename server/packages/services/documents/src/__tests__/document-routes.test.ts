import { createServer } from "node:http";
import express from "express";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { DocumentService, RenderDocumentCommand } from "@athyper/server-contract-documents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDocumentRoutes } from "../document-routes.js";
import { DocumentError } from "../errors.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }))); });
async function setup() {
  const context = { tenantId: "verified-tenant" } as VerifiedRequestContext;
  const render = vi.fn<DocumentService["render"]>();
  const createDownload = vi.fn<DocumentService["createDownload"]>();
  const app = express();
  app.use(express.json({ strict: false }));
  registerDocumentRoutes(app, {
    authenticate: (req, res, next) => { if (req.headers.authorization !== "Bearer test") { res.sendStatus(401); return; } next(); },
    readContext: () => context, documents: { render, createDownload },
  });
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(500).json({ error: "INTERNAL_ERROR" }); });
  const server = createServer(app); servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No address");
  const post = (path: string, body?: unknown, headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${address.port}/api/documents/${path}`, { method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json", ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { context, render, createDownload, post };
}
const valid = { entityType: "invoice", entityId: "33333333-3333-4333-8333-333333333333", operationCode: "print", data: {} };
describe("Documents HTTP routes", () => {
  it.each(["render", "document/download"])("requires authentication for %s", async (path) => {
    const { post, render, createDownload } = await setup();
    expect((await post(path, valid, { authorization: "" })).status).toBe(401);
    expect(render).not.toHaveBeenCalled(); expect(createDownload).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { ...valid, data: [] }, { ...valid, entityType: 1 }, ...["variant", "locale", "fileName"].flatMap((field) => [null, 12, [], {}, " "].map((value) => ({ ...valid, [field]: value })))])("rejects invalid render input %j", async (body) => {
    const { post, render } = await setup();
    expect((await post("render", body)).status).toBe(400);
    expect(render).not.toHaveBeenCalled();
  });
  it.each(["", "x".repeat(129)])("rejects malformed idempotency keys", async (key) => {
    const { post, render } = await setup();
    const response = await post("render", valid, { "idempotency-key": key });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_IDEMPOTENCY_KEY" });
    expect(render).not.toHaveBeenCalled();
  });
  it("passes verified context and normalized fields to render", async () => {
    const { post, render, context } = await setup();
    const response = await post("render", { ...valid, variant: " compact ", locale: " en ", fileName: " invoice.pdf ", context: { tenantId: "attacker" } }, { "idempotency-key": "request-1" });
    expect(response.status).toBe(201);
    expect(render).toHaveBeenCalledWith({ ...valid, context, variant: "compact", locale: "en", fileName: "invoice.pdf", idempotencyKey: "request-1" } satisfies RenderDocumentCommand);
  });
  it("marks signed download responses as non-cacheable", async () => {
    const { post, createDownload, context } = await setup();
    const response = await post("document/download");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(createDownload).toHaveBeenCalledWith({ context, documentId: "document" });
  });
  it.each([400, 403, 404, 409, 422, 503])("preserves domain error status %s", async (statusCode) => {
    const { post, render, createDownload } = await setup();
    render.mockRejectedValue(new DocumentError(statusCode, "DOCUMENT_ERROR", "Test message"));
    createDownload.mockRejectedValue(new DocumentError(statusCode, "DOCUMENT_ERROR", "Test message"));
    for (const path of ["render", "document/download"]) {
      const response = await post(path, valid);
      expect(response.status).toBe(statusCode);
      expect(await response.json()).toEqual({ error: "DOCUMENT_ERROR", message: "Test message" });
    }
  });
  it("forwards unexpected errors to the host", async () => {
    const { post, render } = await setup();
    render.mockRejectedValue(new Error("private storage detail"));
    const response = await post("render", valid);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "INTERNAL_ERROR" });
  });
});
