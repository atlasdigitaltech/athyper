import express from "express";
import type { AddressInfo } from "node:net";
import { ExperienceAccessError } from "./service.js";
import { enforceContractResponses, routeContracts } from "@athyper/server-runtime-http";
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


describe("localization HTTP errors with response enforcement", () => {
  it.each([
    ["GET","/api/platform/localization/policies/neon","localePolicy",400],
    ["GET","/api/platform/localization/policies/neon","localePolicy",403],
    ["GET","/api/platform/localization/policies/neon","localePolicy",503],
    ["PUT","/api/platform/localization/policies/neon","updateLocalePolicy",403],
    ["PUT","/api/platform/localization/policies/neon","updateLocalePolicy",503],
    ["PATCH","/api/platform/profile/locale","updatePrincipalLocale",403],
    ["PATCH","/api/platform/profile/locale","updatePrincipalLocale",409],
    ["PATCH","/api/platform/profile/locale","updatePrincipalLocale",503],
  ] as const)("preserves %s %s error status %s %i", async (method,path,operation,status) => {
    const application=express();application.use(express.json());enforceContractResponses(application);
    const code=status===503?"EXPERIENCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE":"EXPERIENCE_TEST_DENIED";
    const service={[operation]:vi.fn().mockRejectedValue(status===503?Object.assign(new Error("offline"),{code}):new ExperienceAccessError(status,code,"Denied"))};
    registerExperienceRoutes(application,{authenticate:(_req,_res,next)=>next(),readContext:vi.fn() as never,service:service as never});
    application.use(((error:Error,_req:unknown,res:express.Response,_next:unknown)=>res.status(500).json({message:error.message})) as express.ErrorRequestHandler);
    const server=application.listen(0,"127.0.0.1");
    try {
      await new Promise<void>(resolve=>server.once("listening",resolve));
      const catalogs=["en","ar","ms","zh-Hans","hi","ta","fr","de"].map(localeCode=>({localeCode,status:"qualified",coveragePct:100,linguisticReviewPassed:true,layoutReviewPassed:true,automatedTestsPassed:true}));
      const body=method==="PUT"?{catalogs,enabledLocales:["en"],defaultLocale:"en",fallbackLocale:"en"}:{localeCode:"en"};
      const response=await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`,{method,...(method!=="GET"?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
      expect(response.status).toBe(status);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(await response.json()).toMatchObject({status,code});
    } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
  });
});
