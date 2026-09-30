import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { registerAtlasExperienceRoutes } from "../atlas-experience-routes.js";
import { AtlasExperienceConfigurationService } from "../experience-configuration.js";
import type { AtlasExperienceConfigurationRepository } from "@athyper/server-contract-ai";
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
it("accepts missing Atlas configuration and rejects malformed scope under response enforcement", async () => {
  const getPublished = vi.fn(async () => null), getDraft = vi.fn(async () => null);
  const experience = new AtlasExperienceConfigurationService({ getPublished, getDraft } as unknown as AtlasExperienceConfigurationRepository);
  const app = createHttpApplication({ openApi: { title: "Review", version: "1", enforceResponses: true }, configure(app) {
    registerAtlasExperienceRoutes(app, { authenticate: (_req, _res, next) => next(), readContext: () => ({ planeKey: "studio" }) as never, authorizeAdmin: async () => true, experience });
  } });
  const server = createServer(app); servers.push(server); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing listener");
  const url = `http://127.0.0.1:${address.port}`;
  for (const path of ["/api/atlas/experience", "/api/admin/atlas/experience/draft"]) {
    const missing = await fetch(`${url}${path}`);
    expect(missing.status).toBe(200);
    expect(await missing.json()).toBeNull();
    for (const query of ["?scope=bad%20scope", "?scope=home&scope=other"]) {
      const response = await fetch(`${url}${path}${query}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "ATLAS_EXPERIENCE_INVALID_SCOPE" });
    }
  }
  expect(getPublished).toHaveBeenCalledTimes(2);
});
