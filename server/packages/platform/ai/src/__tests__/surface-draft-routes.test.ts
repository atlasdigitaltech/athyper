import express from "express";
import { routeContracts } from "@athyper/server-runtime-http";
import { describe, expect, it } from "vitest";
import { registerAtlasSurfaceDraftRoutes } from "../atlas-surface-draft-routes.js";

describe("Atlas surface draft route", () => {
  it("is Studio-authorized and exposes generation without a publication route", () => {
    const application = express();
    registerAtlasSurfaceDraftRoutes(application, { authenticate: ((_request, _response, next) => next()), readContext: () => ({} as never), generator: {} as never });
    expect(routeContracts(application)).toEqual([expect.objectContaining({ method: "post", path: "/api/studio/experience-surfaces/atlas-drafts", operationId: "generateAtlasExperienceSurfaceDraft", permission: "studio.platform.catalog.manage" })]);
  });
});
