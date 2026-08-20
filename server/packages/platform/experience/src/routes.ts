import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { defineRouteContract, registerContractRoute } from "@athyper/server-runtime-http";
import type { Application, RequestHandler, Response } from "express";
import { experienceBootstrapSchema, neonOperatingOrganizationCatalogSchema, neonWorkContextBootstrapSchema } from "./contracts.js";
import { ExperienceAccessError, type createExperienceService } from "./service.js";

type ExperienceService = ReturnType<typeof createExperienceService>;

export const getExperienceBootstrapContract = defineRouteContract({
  method: "get",
  path: "/api/platform/experience/bootstrap",
  operationId: "platformExperienceBootstrap",
  summary: "Resolve the sanitized effective application experience",
  tags: ["Platform experience"],
  authenticated: true,
  permission: "platform.experience.bootstrap",
  request: { headers: { type: "object", properties: { "x-athyper-client-version": { type: "string", maxLength: 64 } } } },
  responses: {
    200: { description: "Resolved experience or context-not-ready projection", body: experienceBootstrapSchema },
    403: { description: "Verified identity is not admitted to this plane", contentType: "application/problem+json" },
    503: { description: "Exact-plane experience repository unavailable", contentType: "application/problem+json" },
  },
});
export const getNeonWorkContextsContract = defineRouteContract({ method:"get",path:"/api/neon/work-contexts",operationId:"neonWorkContexts",summary:"Resolve permitted Neon company work contexts",tags:["Neon experience"],authenticated:true,permission:"platform.experience.bootstrap",request:{},responses:{200:{description:"Permitted localized company work contexts",body:neonWorkContextBootstrapSchema},403:{description:"Context is not admitted to Neon",contentType:"application/problem+json"},503:{description:"Exact-plane experience repository unavailable",contentType:"application/problem+json"}} });
export const getNeonOperatingOrganizationsContract = defineRouteContract({ method:"get",path:"/api/neon/operating-organizations",operationId:"neonOperatingOrganizations",summary:"Resolve permitted effective Neon operating organizations",tags:["Neon experience"],authenticated:true,permission:"platform.experience.bootstrap",request:{},responses:{200:{description:"Permitted effective operating-organization catalog",body:neonOperatingOrganizationCatalogSchema},403:{description:"Context is not admitted to Neon",contentType:"application/problem+json"},503:{description:"Exact-plane experience repository unavailable",contentType:"application/problem+json"}} });

export interface ExperienceRouteOptions {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly service: ExperienceService;
}

export function registerExperienceRoutes(application: Application, options: ExperienceRouteOptions): void {
  const handler: RequestHandler = async (request, response, next) => {
    try {
      const rawVersion = request.header("x-athyper-client-version");
      const result = await options.service.bootstrap(options.readContext(response), rawVersion ? { clientVersion: rawVersion } : {});
      response.setHeader("ETag", `"${result.revision}"`);
      response.setHeader("Cache-Control", "private, no-store");
      response.status(200).json(result);
    } catch (error) {
      if (error instanceof ExperienceAccessError) { problem(response, error.status, error.code, error.message); return; }
      if (isUnavailable(error)) { problem(response, 503, errorCode(error), "The exact-plane experience repository is unavailable"); return; }
      next(error);
    }
  };
  registerContractRoute(application, getExperienceBootstrapContract, options.authenticate, handler);
  registerContractRoute(application,getNeonWorkContextsContract,options.authenticate,async(_request,response,next)=>{try{const result=await options.service.neonWorkContexts(options.readContext(response));response.setHeader("ETag",`"${result.revision}"`);response.setHeader("Cache-Control","private, no-store");response.status(200).json(result);}catch(error){if(error instanceof ExperienceAccessError){problem(response,error.status,error.code,error.message);return;}if(isUnavailable(error)){problem(response,503,errorCode(error),"The exact-plane experience repository is unavailable");return;}next(error);}});
  registerContractRoute(application,getNeonOperatingOrganizationsContract,options.authenticate,async(_request,response,next)=>{try{const result=await options.service.neonOperatingOrganizations(options.readContext(response));response.setHeader("ETag",`"${result.revision}"`);response.setHeader("Cache-Control","private, no-store");response.status(200).json(result);}catch(error){if(error instanceof ExperienceAccessError){problem(response,error.status,error.code,error.message);return;}if(isUnavailable(error)){problem(response,503,errorCode(error),"The exact-plane experience repository is unavailable");return;}next(error);}});
}

function isUnavailable(error: unknown): boolean { return Boolean(error && typeof error === "object" && String(Reflect.get(error as object, "code")).includes("EXPERIENCE_EXACT_PLANE")); }
function errorCode(error: unknown): string { return error && typeof error === "object" ? String(Reflect.get(error, "code")) : "EXPERIENCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE"; }
function problem(response: Response, status: number, code: string, detail: string): void { response.status(status).type("application/problem+json").json({ type: `urn:athyper:problem:${code.toLowerCase().replaceAll("_", "-")}`, title: code, status, detail, code }); }
