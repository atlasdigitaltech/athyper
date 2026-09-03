import express from "express";
import { routeContracts } from "@athyper/server-runtime-http";
import { describe, expect, it, vi } from "vitest";
import { registerExperienceRoutes } from "./routes.js";

describe("experience route contract", () => {
  it("registers an authenticated OpenAPI-visible bootstrap route", () => {
    const application = express();
    registerExperienceRoutes(application, { authenticate: (_request, _response, next) => next(), readContext: vi.fn() as never, service: { bootstrap: vi.fn() } as never });
    expect(routeContracts(application)).toContainEqual(expect.objectContaining({ method: "get", path: "/api/platform/experience/bootstrap", operationId: "platformExperienceBootstrap", authenticated: true }));
    expect(routeContracts(application)).toContainEqual(expect.objectContaining({ method: "get", path: "/api/neon/work-contexts", operationId: "neonWorkContexts", authenticated: true }));
    expect(routeContracts(application)).toContainEqual(expect.objectContaining({ method: "get", path: "/api/neon/operating-organizations", operationId: "neonOperatingOrganizations", authenticated: true }));
    expect(routeContracts(application)).toContainEqual(expect.objectContaining({ method:"get",path:"/api/platform/localization/policies/:planeKey",operationId:"platformLocalePolicy",authenticated:true }));
    expect(routeContracts(application)).toContainEqual(expect.objectContaining({ method:"put",path:"/api/platform/localization/policies/:planeKey",operationId:"updatePlatformLocalePolicy",permission:"studio.platform.catalog.manage" }));
    expect(routeContracts(application)).toContainEqual(expect.objectContaining({ method:"patch",path:"/api/platform/profile/locale",operationId:"updatePrincipalLocale",authenticated:true }));
    expect(routeContracts(application)).toContainEqual(expect.objectContaining({method:"post",path:"/api/studio/experience-surfaces/drafts",operationId:"saveExperienceSurfaceDraft",permission:"studio.platform.catalog.manage"}));
    expect(routeContracts(application)).toContainEqual(expect.objectContaining({method:"post",path:"/api/studio/experience-surfaces/:releaseId/publish",operationId:"publishExperienceSurface",permission:"studio.platform.catalog.manage"}));
    expect(routeContracts(application)).toContainEqual(expect.objectContaining({method:"get",path:"/api/platform/experience/surfaces/:surfaceKey",operationId:"getExperienceSurface"}));
    expect(routeContracts(application)).toContainEqual(expect.objectContaining({method:"put",path:"/api/platform/experience/surfaces/:surfaceKey/arrangement",operationId:"savePersonalSurfaceArrangement"}));
    expect(routeContracts(application)).toContainEqual(expect.objectContaining({method:"get",path:"/api/studio/experience-surfaces",operationId:"listExperienceSurfaceHistory"}));
    expect(routeContracts(application)).toContainEqual(expect.objectContaining({method:"post",path:"/api/studio/experience-surfaces/:releaseId/rollback",operationId:"rollbackExperienceSurface"}));
    expect(routeContracts(application)).toContainEqual(expect.objectContaining({method:"get",path:"/api/platform/navigation/slug-redirect",operationId:"resolveRouteSlugRedirect"}));
    expect(routeContracts(application)).toContainEqual(expect.objectContaining({method:"post",path:"/api/studio/navigation/slug-redirects",operationId:"registerRouteSlugRedirect",permission:"studio.platform.catalog.manage"}));
  });
});
