import express, { type ErrorRequestHandler } from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enforceContractResponses } from "@athyper/server-runtime-http";
import { normalizeSharedReferenceLookup } from "../shared-reference-directory.js";
import { registerSharedReferenceDirectoryRoutes } from "../shared-reference-directory-routes.js";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
  )));
});

async function fixture() {
  const app = express();
  enforceContractResponses(app);
  const lookup = vi.fn(async (input: any) => {
    normalizeSharedReferenceLookup(input);
    return { sourceKey: input.sourceKey, items: [] };
  });
  registerSharedReferenceDirectoryRoutes(app, {
    authenticate: (_request, _response, next) => next(),
    readContext: () => ({}) as never,
    directory: () => ({ lookup }),
  });
  app.use(((error, _request, response, _next) => response
    .status(error.statusCode ?? 500)
    .json({ code: error.code ?? "INTERNAL_ERROR" })) satisfies ErrorRequestHandler);
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  servers.push(server);
  return { lookup, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
}

describe("shared reference directory HTTP contract", () => {
  it("passes only declared country/state scope and returns a private response", async () => {
    const { lookup, url } = await fixture();
    const response = await fetch(`${url}/api/reference-directory/shared.state_region?filter=${encodeURIComponent(JSON.stringify({ countryCode: "MY" }))}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(lookup).toHaveBeenCalledWith(expect.objectContaining({
      sourceKey: "shared.state_region",
      filters: { countryCode: "MY" },
    }));
  });

  it("rejects unknown sources, forged fields, and missing dependent scope", async () => {
    const { lookup, url } = await fixture();
    for (const suffix of [
      "/api/reference-directory/shared.not-real",
      `/api/reference-directory/shared.state_region?filter=${encodeURIComponent(JSON.stringify({ country: "MY" }))}`,
      "/api/reference-directory/shared.state_region",
    ]) {
      const response = await fetch(`${url}${suffix}`);
      expect(response.status).toBe(suffix.includes("not-real") ? 404 : 400);
    }
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
