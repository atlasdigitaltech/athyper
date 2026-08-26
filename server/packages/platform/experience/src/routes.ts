import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { defineRouteContract, registerContractRoute } from "@athyper/server-runtime-http";
import type { Application, RequestHandler, Response } from "express";
import { experienceBootstrapSchema, meshNetworkAccountCatalogSchema, neonOperatingOrganizationCatalogSchema, neonWorkContextBootstrapSchema } from "./contracts.js";
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
export const getMeshNetworkAccountsContract = defineRouteContract({ method:"get",path:"/api/mesh/network-accounts",operationId:"meshNetworkAccounts",summary:"Resolve principal-authorized Mesh network accounts",tags:["Mesh experience"],authenticated:true,permission:"platform.experience.bootstrap",request:{},responses:{200:{description:"Principal-authorized buyer and supplier account catalog",body:meshNetworkAccountCatalogSchema},403:{description:"Context is not admitted to Mesh",contentType:"application/problem+json"},503:{description:"Exact-plane experience repository unavailable",contentType:"application/problem+json"}} });
const localeCodes=["en","ar","ms","zh-Hans","hi","ta","fr","de"] as const;
const localeCatalogInput={type:"object",additionalProperties:false,required:["localeCode","status","coveragePct","linguisticReviewPassed","layoutReviewPassed","automatedTestsPassed"],properties:{localeCode:{enum:localeCodes},status:{enum:["draft","translating","review","qualified","retired"]},coveragePct:{type:"integer",minimum:0,maximum:100},linguisticReviewPassed:{type:"boolean"},layoutReviewPassed:{type:"boolean"},automatedTestsPassed:{type:"boolean"}}} as const;
const localePolicyBody={type:"object",additionalProperties:false,required:["catalogs","enabledLocales","defaultLocale","fallbackLocale"],properties:{catalogs:{type:"array",minItems:8,maxItems:8,items:localeCatalogInput},enabledLocales:{type:"array",minItems:1,uniqueItems:true,items:{enum:localeCodes}},defaultLocale:{enum:localeCodes},fallbackLocale:{const:"en"}}} as const;
const localeCatalogResponse={type:"object",additionalProperties:false,required:[...localeCatalogInput.required,"englishName","nativeName","direction","rolloutWave","qualified"],properties:{...localeCatalogInput.properties,englishName:{type:"string"},nativeName:{type:"string"},direction:{enum:["ltr","rtl"]},rolloutWave:{type:"integer",minimum:0,maximum:3},qualified:{type:"boolean"}}} as const;
const localePolicyResponse={type:"object",additionalProperties:false,required:["planeKey","catalogs","enabledLocales","defaultLocale","fallbackLocale","revision"],properties:{planeKey:{enum:["studio","neon","mesh"]},catalogs:{type:"array",minItems:8,maxItems:8,items:localeCatalogResponse},enabledLocales:localePolicyBody.properties.enabledLocales,defaultLocale:localePolicyBody.properties.defaultLocale,fallbackLocale:localePolicyBody.properties.fallbackLocale,revision:{type:"string"}}} as const;
export const getLocalePolicyContract=defineRouteContract({method:"get",path:"/api/platform/localization/policies/:planeKey",operationId:"platformLocalePolicy",summary:"Read one exact-plane tenant locale policy",tags:["Platform localization"],authenticated:true,permission:"platform.experience.bootstrap",request:{},responses:{200:{description:"Plane locale policy",body:localePolicyResponse},403:{description:"Cross-plane policy access denied",contentType:"application/problem+json"}}});
export const updateLocalePolicyContract=defineRouteContract({method:"put",path:"/api/platform/localization/policies/:planeKey",operationId:"updatePlatformLocalePolicy",summary:"Activate tenant locales for a target plane from Studio",tags:["Platform localization"],authenticated:true,permission:"studio.platform.catalog.manage",request:{body:localePolicyBody},responses:{200:{description:"Updated plane locale policy",body:localePolicyResponse},400:{description:"Invalid locale policy",contentType:"application/problem+json"},403:{description:"Studio catalog authority required",contentType:"application/problem+json"}}});
export const updatePrincipalLocaleContract=defineRouteContract({method:"patch",path:"/api/platform/profile/locale",operationId:"updatePrincipalLocale",summary:"Select an enabled locale for the current principal and plane",tags:["Platform localization"],authenticated:true,permission:"platform.experience.bootstrap",request:{body:{type:"object",additionalProperties:false,required:["localeCode"],properties:{localeCode:{type:"string",minLength:2,maxLength:35}}}},responses:{200:{description:"Refreshed effective experience",body:experienceBootstrapSchema},400:{description:"Locale is not enabled",contentType:"application/problem+json"}}});

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
  registerContractRoute(application,getMeshNetworkAccountsContract,options.authenticate,async(_request,response,next)=>{try{const result=await options.service.meshNetworkAccounts(options.readContext(response));response.setHeader("ETag",`"${result.revision}"`);response.setHeader("Cache-Control","private, no-store");response.status(200).json(result);}catch(error){if(error instanceof ExperienceAccessError){problem(response,error.status,error.code,error.message);return;}if(isUnavailable(error)){problem(response,503,errorCode(error),"The exact-plane experience repository is unavailable");return;}next(error);}});
  registerContractRoute(application,getLocalePolicyContract,options.authenticate,async(request,response,next)=>{try{const result=await options.service.localePolicy(options.readContext(response),plane(request.params.planeKey));response.status(200).setHeader("Cache-Control","private, no-store").json(result);}catch(error){handle(error,response,next);}});
  registerContractRoute(application,updateLocalePolicyContract,options.authenticate,async(request,response,next)=>{try{const result=await options.service.updateLocalePolicy(options.readContext(response),plane(request.params.planeKey),localePolicyInput(request.body));response.status(200).setHeader("Cache-Control","private, no-store").json(result);}catch(error){handle(error,response,next);}});
  registerContractRoute(application,updatePrincipalLocaleContract,options.authenticate,async(request,response,next)=>{try{const body=request.body as Record<string,unknown>,localeCode=typeof body?.localeCode==="string"?body.localeCode:"";const result=await options.service.updatePrincipalLocale(options.readContext(response),localeCode);response.status(200).setHeader("Cache-Control","private, no-store").json(result);}catch(error){handle(error,response,next);}});
}

function isUnavailable(error: unknown): boolean { return Boolean(error && typeof error === "object" && String(Reflect.get(error as object, "code")).includes("EXPERIENCE_EXACT_PLANE")); }
function errorCode(error: unknown): string { return error && typeof error === "object" ? String(Reflect.get(error, "code")) : "EXPERIENCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE"; }
function problem(response: Response, status: number, code: string, detail: string): void { response.status(status).type("application/problem+json").json({ type: `urn:athyper:problem:${code.toLowerCase().replaceAll("_", "-")}`, title: code, status, detail, code }); }
function plane(value:unknown):"studio"|"neon"|"mesh"{if(value!=="studio"&&value!=="neon"&&value!=="mesh")throw new ExperienceAccessError(400,"EXPERIENCE_PLANE_INVALID","Plane is invalid");return value;}
function localePolicyInput(value:unknown){if(!value||typeof value!=="object"||Array.isArray(value))throw new ExperienceAccessError(400,"EXPERIENCE_LOCALE_POLICY_INVALID","Locale policy body is required");const row=value as Record<string,unknown>;const catalogs=Array.isArray(row.catalogs)?row.catalogs.flatMap((candidate)=>{if(!candidate||typeof candidate!=="object"||Array.isArray(candidate))return[];const item=candidate as Record<string,unknown>;return[{localeCode:typeof item.localeCode==="string"?item.localeCode:"",status:typeof item.status==="string"?item.status:"",coveragePct:Number(item.coveragePct),linguisticReviewPassed:item.linguisticReviewPassed===true,layoutReviewPassed:item.layoutReviewPassed===true,automatedTestsPassed:item.automatedTestsPassed===true}];}):[];return{catalogs,enabledLocales:Array.isArray(row.enabledLocales)?row.enabledLocales.filter((item):item is string=>typeof item==="string"):[],defaultLocale:typeof row.defaultLocale==="string"?row.defaultLocale:"",fallbackLocale:typeof row.fallbackLocale==="string"?row.fallbackLocale:""};}
function handle(error:unknown,response:Response,next:(error?:unknown)=>void){if(error instanceof ExperienceAccessError){problem(response,error.status,error.code,error.message);return;}if(isUnavailable(error)){problem(response,503,errorCode(error),"The exact-plane experience repository is unavailable");return;}next(error);}
