import type { Application, Request, RequestHandler, Response } from "@athyper/server-runtime-http";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { describe, expect, it, vi } from "vitest";
import { registerBusinessPartnerProfileProjectionRoutes } from "./business-partner-profile-projection-routes.js";
import { registerBusinessPartnerProfileMatchRoutes } from "./business-partner-profile-match-routes.js";
import { registerBusinessPartnerAccountBankLinkageRoutes } from "./business-partner-account-bank-linkage-routes.js";

const id="11111111-1111-4111-8111-111111111111";
const context={planeKey:"neon",tenantId:id} as VerifiedRequestContext;
function fixture(kind:"projection"|"match"|"bank") {
  const routes=new Map<string,RequestHandler[]>();
  const app=Object.fromEntries(["get","post"].map(method=>[method,(path:string,...handlers:RequestHandler[])=>routes.set(`${method}:${path}`,handlers)])) as unknown as Application;
  const calls=vi.fn(async()=>({replayed:false}));
  const service=new Proxy({}, {get:()=>calls});
  const authenticate:RequestHandler=(_request,_response,next)=>next();
  const options={authenticate,readContext:()=>context,service};
  if(kind==="projection")registerBusinessPartnerProfileProjectionRoutes(app,options as unknown as Parameters<typeof registerBusinessPartnerProfileProjectionRoutes>[1]);
  if(kind==="match")registerBusinessPartnerProfileMatchRoutes(app,options as unknown as Parameters<typeof registerBusinessPartnerProfileMatchRoutes>[1]);
  if(kind==="bank")registerBusinessPartnerAccountBankLinkageRoutes(app,options as unknown as Parameters<typeof registerBusinessPartnerAccountBankLinkageRoutes>[1]);
  return {calls,routes,authenticate,async invoke(path:string,input:Partial<Request>={}) {
    const response={setHeader:vi.fn(),statusCode:200,headersSent:false,status(code:number){this.statusCode=code;return this;},type(){return this;},json:vi.fn()};
    const next=vi.fn();
    await routes.get(path)!.at(-1)!({body:{},params:{},query:{},get:()=>undefined,...input} as Request,response as unknown as Response,next);
    expect(next).not.toHaveBeenCalled();
    return response;
  }};
}
describe("Neon route input boundaries",()=>{
  it.each(["projection","match","bank"] as const)("authenticates every %s route",kind=>{
    const f=fixture(kind);
    expect(f.routes.size).toBeGreaterThan(0);
    for(const handlers of f.routes.values())expect(handlers[0]).toBe(f.authenticate);
  });
  it.each(["invalid",[id,id],{value:id}])("rejects malformed projection relationship filters: %j",async value=>{
    const f=fixture("projection");
    const response=await f.invoke("get:/api/neon/business-partner-profile-projections",{query:{networkRelationshipId:value} as Request["query"]});
    expect(response.statusCode).toBe(400);expect(f.calls).not.toHaveBeenCalled();
  });
  it.each([["1","2"],{value:"1"},"1.5","1e1"])("rejects non-integer query representations: %j",async value=>{
    const f=fixture("projection");
    const response=await f.invoke("get:/api/neon/business-partner-profile-projections",{query:{limit:value} as Request["query"]});
    expect(response.statusCode).toBe(400);expect(f.calls).not.toHaveBeenCalled();
  });
  it("forwards valid relationship and limit",async()=>{
    const f=fixture("projection");
    const response=await f.invoke("get:/api/neon/business-partner-profile-projections",{query:{networkRelationshipId:id,limit:"10"}});
    expect(response.statusCode).toBe(200);expect(f.calls).toHaveBeenCalledWith({context,networkRelationshipId:id,limit:10});
  });
  it.each([{},123,true,["abcdefgh"],"   "])("rejects coerced match idempotency keys: %j",async value=>{
    const f=fixture("match");
    expect((await f.invoke("post:/api/neon/business-partner-profile-matches",{body:{snapshotId:id,operatingOrganizationId:id,idempotencyKey:value}})).statusCode).toBe(400);
    expect(f.calls).not.toHaveBeenCalled();
  });
  it.each([{},123,true,["holder"],"   "])("rejects non-string protected account holders: %j",async value=>{
    const f=fixture("bank");
    expect((await f.invoke("post:/api/neon/business-partners/:businessPartnerId/protected-bank-registrations",{params:{businessPartnerId:id},body:{companyCodeId:id,accountHolderName:value}})).statusCode).toBe(400);
    expect(f.calls).not.toHaveBeenCalled();
  });
});
