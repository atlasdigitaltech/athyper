import { createServer } from "node:http";
import { afterEach, expect, it } from "vitest";
import { createHttpApplication } from "../http-runtime.js";
import { HttpError } from "../http-error.js";
import { registerContractRoute } from "../route-contract.js";
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
it("documents and preserves authentication, rate-limit and request errors under response enforcement", async () => {
  const app = createHttpApplication({ openApi: { title: "Review", version: "1", enforceResponses: true, authenticatedHeaders: { type: "object", required: ["x-plane"], properties: { "x-plane": { enum: ["studio", "neon", "mesh"] } } } }, configure(app) {
    for (const status of [400, 401, 403, 429, 503]) registerContractRoute(app, { method: "get", path: `/status/${status}`, operationId: `review.status${status}`, summary: "Review", authenticated: true, responses: { 200: { description: "Success", body: { type: "object" } } } }, (_request, _response, next) => next(new HttpError(status, "EXPECTED_ERROR", "Expected middleware error")));
  } });
  const server = createServer(app); servers.push(server); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing listener");
  const url = `http://127.0.0.1:${address.port}`;
  const document = await (await fetch(`${url}/openapi.json`)).json() as { paths: Record<string, { get: { responses: Record<string, unknown>; parameters: unknown[] } }> };
  for (const status of [400, 401, 403, 429, 503]) {
    const response = await fetch(`${url}/status/${status}`);
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.json()).toMatchObject({ code: "EXPECTED_ERROR" });
    expect(document.paths[`/status/${status}`]?.get.responses[String(status)]).toBeDefined();
    expect(document.paths[`/status/${status}`]?.get.parameters).toContainEqual({ name: "x-plane", in: "header", required: true, schema: { enum: ["studio", "neon", "mesh"] } });
  }
});
