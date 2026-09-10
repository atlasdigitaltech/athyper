import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { parseEntityAuthorizationProfile } from "@athyper/server-contract-metadata";
import { createPermissionAuthorizer } from "@athyper/server-platform-iam";
import { createHttpApplication } from "@athyper/server-runtime-http";
import type { EntityScopeAdapter } from "@athyper/server-service-records";
import { createBusinessPartnerAuthorizationShadow, createBusinessPartnerShadowScopes, readBusinessPartnerShadowConfig, type BusinessPartnerShadowEvent } from "../business-partner-authorization-shadow.js";
const path = new URL("../../../../../../packages/contracts/platform/fixtures/entity-authorization/business-partner.v1.json", import.meta.url);
const bytes = readFileSync(path), profile = parseEntityAuthorizationProfile(JSON.parse(bytes.toString()));
const profileHash = createHash("sha256").update(bytes).digest("hex");
const permission = "neon.relationship.business_partner.read", recordId = "f7688c3d-8c92-5651-a469-da3f4f786375";
function context(kind = "tenant", denied = false): VerifiedRequestContext {
 return {tenantId:"tenant",principalId:"principal-secret",realmKey:"realm",planeKey:"neon",authEpoch:1,requestId:"request-secret",profileHash:"legacy-profile",permissions:{tenantId:"tenant",principalId:"principal-secret",planeKey:"neon",profileHash:"legacy-profile",schemaHash:"legacy-schema",principalFingerprint:"secret",resolvedAt:1,allowed:[permission],denied:denied?[permission]:[],planLocked:[],planeExcluded:[],entries:[],authorizationScopes:[],operationBindings:[],evidence:[{permissionCode:permission,effect:"allow",proof:"role",scopeKind:kind,scopeTargetId:"scope",targetId:kind === "tenant"?"tenant":"organization-secret",propagationMode:"exact"}]}};
}
function setup(authority: Authorizer = createPermissionAuthorizer(), scopes?: EntityScopeAdapter) {
 const events: BusinessPartnerShadowEvent[] = [];
 const preflight = vi.fn(async () => { throw new Error("must not execute"); });
 const shadow = createBusinessPartnerAuthorizationShadow({config:{mode:"shadow",profile,profileHash},scopes:scopes??{resolve:async input=>({state:"resolved",coordinates:input.coordinates??{}}),preflight},emit:event=>events.push(event)});
 return {events,shadow,wrapped:shadow.wrap(authority),preflight};
}
describe("BP runtime shadow",()=>{
 it("maps predecessor observations without translating grants into dedicated permissions",async()=>{
  const target=structuredClone(profile);
  const read=target.operations.find(o=>o.key==='read')!;
  Object.assign(read,{permissionCode:'neon.relationship.bp_target.read'});
  const events:BusinessPartnerShadowEvent[]=[];
  const shadow=createBusinessPartnerAuthorizationShadow({config:{mode:'shadow',profile:target,profileHash:'target',observationProfile:profile,observationProfileHash:profileHash},scopes:{resolve:async()=>({state:'resolved',coordinates:{}})},emit:e=>events.push(e)});
  const c=context(),before=structuredClone(c);
  expect((await shadow.wrap(createPermissionAuthorizer()).authorize({context:c,permissionCode:permission,resource:{businessPartnerId:recordId}})).allowed).toBe(true);
  expect(c).toEqual(before);
  expect(events).toContainEqual(expect.objectContaining({kind:'decision',operationKey:'read',legacy:'allowed',candidateTarget:'denied',candidateTrace:['read:permission:denied']}));
  expect(events.some(e=>e.kind==='mapping_gap')).toBe(false);
 });
 it("records explicit target deferrals without executing the predecessor operation",async()=>{
  const target=structuredClone(profile);
  Object.assign(target,{operations:target.operations.filter(o=>o.key!=='update'),deferredOperations:['update']});
  const events:BusinessPartnerShadowEvent[]=[];
  const resolve=vi.fn(async()=>({state:'resolved' as const,coordinates:{}}));
  const shadow=createBusinessPartnerAuthorizationShadow({config:{mode:'shadow',profile:target,profileHash:'target',observationProfile:profile},scopes:{resolve},emit:e=>events.push(e)});
  const operation=profile.operations.find(o=>o.key==='update')!;
  await shadow.wrap({authorize:async()=>({allowed:true})} as Authorizer).authorize({context:context(),permissionCode:operation.permissionCode,resource:{businessPartnerId:recordId,operationKey:'update'}});
  expect(events).toContainEqual(expect.objectContaining({kind:'decision',operationKey:'update',candidateTarget:'unavailable',candidateTrace:['update:deferred:unavailable']}));
  expect(resolve).not.toHaveBeenCalled();
 });
 it("requires an exact NEON profile pin and rejects enforce",()=>{
  expect(readBusinessPartnerShadowConfig({})).toBeUndefined();
  expect(()=>readBusinessPartnerShadowConfig({BP_AUTHORIZATION_MODE:"enforce"})).toThrow();
  expect(()=>readBusinessPartnerShadowConfig({BP_AUTHORIZATION_MODE:"shadow",BP_AUTHORIZATION_PROFILE_PATH:path.pathname,BP_AUTHORIZATION_PROFILE_SHA256:"0".repeat(64)})).toThrow("mismatch");
  expect(readBusinessPartnerShadowConfig({BP_AUTHORIZATION_MODE:"shadow",BP_AUTHORIZATION_PROFILE_PATH:path.pathname,BP_AUTHORIZATION_PROFILE_SHA256:profileHash})).toMatchObject({mode:"shadow",profileHash});
 });
 it("projects bindings only, records installed incompatibility, and never changes the verified snapshot",async()=>{
  const c=context(), before=structuredClone(c), {events,wrapped}=setup();
  const result=await wrapped.authorize({context:c,permissionCode:permission,resource:{tenantId:c.tenantId,businessPartnerId:recordId}});
  expect(result.allowed).toBe(true);expect(c).toEqual(before);
  expect(events).toContainEqual(expect.objectContaining({kind:"decision",legacy:"allowed",installedTarget:"denied",candidateTarget:"allowed",installedTrace:["read:binding:denied"],candidateTrace:["read:complete:allowed"],authority:"legacy",grantsChanged:false}));
  const serialized=JSON.stringify(events);expect(serialized).not.toContain("principal-secret");expect(serialized).not.toContain("request-secret");expect(serialized).not.toContain(recordId);
 });
 it("keeps an organization-only legacy directory allow even when the target denies it",async()=>{
  const {wrapped,events}=setup();
  expect((await wrapped.authorize({context:context("operating_organization"),permissionCode:permission})).allowed).toBe(true);
  expect(events).toContainEqual(expect.objectContaining({legacy:"allowed",candidateTarget:"denied",differs:true}));
 });
 it("never unions a target allow into a legacy deny",async()=>{
  const pure=createPermissionAuthorizer();
  const authority:Authorizer={authorize:async request=>request.resource?.["operationKey"]?pure.authorize(request):{allowed:false,reason:"legacy_policy_denied"}};
  const {wrapped,events}=setup(authority);
  expect(await wrapped.authorize({context:context(),permissionCode:permission})).toEqual({allowed:false,reason:"legacy_policy_denied"});
  expect(events).toContainEqual(expect.objectContaining({legacy:"denied",candidateTarget:"allowed"}));
 });
 it("retains explicit denials in candidate snapshots",async()=>{
  const {wrapped,events}=setup();await wrapped.authorize({context:context("tenant",true),permissionCode:permission});
  expect(events).toContainEqual(expect.objectContaining({legacy:"denied",candidateTarget:"denied"}));
 });
 it("compares commands only as discovery and never invokes preflight",async()=>{
  const {wrapped,events,preflight}=setup({authorize:async()=>({allowed:true})});
  await wrapped.authorize({context:context(),permissionCode:"neon.relationship.entity_case.submit",observation:{entityCode:"business_partner",surface:"command",phase:"execute"},resource:{operatingOrganizationId:"organization",makerCheckerEnforced:true}});
  expect(events).toContainEqual(expect.objectContaining({operationKey:"case_submit",candidateTarget:"preflight_required",evidence:"command_discovery_preview",executionParity:false}));
  expect(preflight).not.toHaveBeenCalled();
 });
 it("retains authority during resolver and telemetry failures",async()=>{
  const authority={authorize:vi.fn(async()=>({allowed:true as const}))};
  const {wrapped,events}=setup(authority,{resolve:async()=>{throw new Error("private DB details");},preflight:async()=>"allowed"});
  expect((await wrapped.authorize({context:context(),permissionCode:permission})).allowed).toBe(true);
  expect(JSON.stringify(events)).not.toContain("private DB");
  const shadow=createBusinessPartnerAuthorizationShadow({config:{mode:"shadow",profile,profileHash},scopes:{resolve:async()=>({state:"resolved",coordinates:{}}),preflight:async()=>"allowed"},emit:()=>{throw new Error("telemetry");}});
  expect((await shadow.wrap(authority).authorize({context:context(),permissionCode:permission})).allowed).toBe(true);
 });
 it("skips unrelated entities and reports unknown BP operations without guessing",async()=>{
  const authority={authorize:vi.fn(async()=>({allowed:true as const}))}, {wrapped,events}=setup(authority);
  await wrapped.authorize({context:context(),permissionCode:"finance.invoice.read"});expect(events).toHaveLength(0);expect(authority.authorize).toHaveBeenCalledTimes(1);
  await wrapped.authorize({context:context(),permissionCode:"neon.relationship.business_partner.unknown_operation",resource:{entityCode:"business_partner",operationKey:"unknown_operation"}});
  expect(events).toContainEqual(expect.objectContaining({kind:"mapping_gap",reason:"operation_not_profiled"}));
 });
 it.each(["create", "update", "patch"])("maps %s without authorizing a direct master command",async operationKey=>{
  const {wrapped,events,preflight}=setup({authorize:async()=>({allowed:true})});
  const permissionCode="neon.relationship.business_partner."+(operationKey === "patch" ? "update" : operationKey);
  await wrapped.authorize({context:context(),permissionCode,resource:{entityCode:"business_partner",operationKey,...(operationKey === "create" ? {} : {recordId})}});
  expect(events).toContainEqual(expect.objectContaining({kind:"decision",operationKey:operationKey === "patch" ? "update" : operationKey,candidateTarget:"preflight_required",executionParity:false}));
  expect(events.some(e=>e.kind === "mapping_gap")).toBe(false);expect(preflight).not.toHaveBeenCalled();
 });
 it.each([false,true])("preserves qualification coverage and separation facts (company=%s)",async company=>{
  const calls:Readonly<Record<string,unknown>>[]=[];
  const authority:Authorizer={authorize:async request=>{calls.push(request.resource??{});return request.resource?.["qualificationControl"] && request.resource?.["makerCheckerEnforced"] && request.resource?.["createdBy"] !== request.context.principalId ? {allowed:true} : {allowed:false,reason:"qualification_control_and_separation_required"};}};
  const {wrapped,events,preflight}=setup(authority);
  const request={context:context(),permissionCode:"neon.supplier.qualification.admin",observation:{entityCode:"business_partner",surface:"command" as const,phase:"execute" as const},resource:{operatingOrganizationId:"org",...(company?{companyCodeId:"company"}:{}),qualificationControl:true,makerCheckerEnforced:true,createdBy:"other-creator"}};
  expect((await wrapped.authorize(request)).allowed).toBe(true);
  expect(events).toContainEqual(expect.objectContaining({kind:"decision",operationKey:company?"qualification_company":"qualification",candidateTarget:"preflight_required"}));
  expect(calls.at(-1)).toMatchObject(request.resource);
  expect((await wrapped.authorize({...request,resource:{...request.resource,createdBy:request.context.principalId}})).allowed).toBe(false);
  expect(events.at(-1)).toMatchObject({candidateTarget:"denied"});expect(preflight).not.toHaveBeenCalled();
 });
 it.each(["supplier","customer"])("keeps %s company provider reads separate from global record admission",async role=>{
  const resolve=vi.fn(async(input:Parameters<EntityScopeAdapter["resolve"]>[0])=>({state:"resolved" as const,coordinates:input.coordinates??{}}));
  const {wrapped,events}=setup({authorize:async()=>({allowed:true})},{resolve,preflight:async()=>"allowed"});
  await wrapped.authorize({context:context(),permissionCode:permission,resource:{businessPartnerId:recordId,sectionCode:role+"-company",operatingOrganizationId:"org",companyCodeId:"company"}});
  expect(events).toContainEqual(expect.objectContaining({kind:"decision",operationKey:role+"_company_read"}));
  expect(resolve).toHaveBeenCalledWith(expect.objectContaining({resolver:"organization-company.record.v1",coordinates:{operatingOrganizationId:"org",companyCodeId:"company"}}));
  expect(resolve).toHaveBeenCalledWith(expect.objectContaining({operationKey:"read",resolver:"tenant.record.v1"}));
 });
 it("rejects unsupported ownership resolvers and planes before touching storage", async()=>{
  const transaction=vi.fn(), adapter=createBusinessPartnerShadowScopes({transaction} as never);
  for (const overrides of [{resolver:"workspace.record.v1"},{entityCode:"invoice"},{context:{...context(),planeKey:"mesh"}}]) {
   const result=await adapter.resolve({context:context(),entityCode:"business_partner",operationKey:"read",phase:"discover",resolver:"tenant.record.v1",target:"existing",recordId,...overrides} as never);
   expect(result).toEqual({state:"invalid"});
  }
  expect(transaction).not.toHaveBeenCalled();
 });
 it("carries a BP record through an actual HTTP request and leaves its UI response unchanged",async()=>{
  const resolveScope=vi.fn(async()=>({state:"resolved" as const,coordinates:{}}));
  const {shadow,wrapped,events}=setup(createPermissionAuthorizer(),{resolve:resolveScope,preflight:async()=>"allowed"}), payload={sections:[{code:"identity",state:"ready"}],actions:[],data:{displayName:"Secret test partner"}};
  const app=createHttpApplication({configure(app){shadow.register(app);app.get("/api/neon/business-partners/:id/360/summary",async(_req,res)=>{await wrapped.authorize({context:context(),permissionCode:permission});
    await wrapped.authorize({context:context(),permissionCode:permission});
    const second=context();await wrapped.authorize({context:{...second,principalId:"another-principal",permissions:{...second.permissions,principalId:"another-principal"}},permissionCode:permission});res.json(payload);});}});
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
  try {const address=server.address();if(!address||typeof address==="string")throw new Error("address");const response=await fetch(`http://127.0.0.1:${address.port}/api/neon/business-partners/${recordId}/360/summary`);expect(await response.json()).toEqual(payload);expect(events).toContainEqual(expect.objectContaining({kind:"decision",operationKey:"read"}));expect(events).toContainEqual(expect.objectContaining({kind:"http_outcome",status:200,observations:3}));expect(JSON.stringify(events)).not.toContain("Secret test partner");expect(resolveScope).toHaveBeenCalledTimes(2);}finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
 });
});
