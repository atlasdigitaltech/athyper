import {expect,it,vi} from "vitest";
import express from "express";
import {registerMetaEntityAuthoringRoutes} from "../routes.js";
import {MetaEntityAuthoringService} from "../authoring-service.js";
const id="00000000-0000-4000-8000-000000000001";
it("public review rejects cross-tenant drafts and client-invented break-glass authority",async()=>{
 let tenantId="tenant-a";
 const transition=vi.fn(async()=>({status:"approved"}));
 const repository={get:async()=>({id,tenantId:"tenant-a",status:"in_review",createdBy:"author",submittedBy:"author"}),transition};
 const app=express();app.use(express.json());
 registerMetaEntityAuthoringRoutes(app,{authenticate:(_q,_s,next)=>next(),readContext:()=>({planeKey:"studio",tenantId,principalId:"author"}) as never,authorizer:{authorize:async({permissionCode}:any)=>({allowed:permissionCode!=="studio.platform.catalog.manage"})} as never,service:new MetaEntityAuthoringService({repository:repository as never,signer:{} as never,publication:{} as never})});
 app.use((error:any,_q:any,s:any,_n:any)=>s.status(error.code==="FORBIDDEN"?403:error instanceof TypeError?400:409).json({code:error.code??"INVALID_ARGUMENT"}));
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
 const address=server.address() as {port:number};
 try{
  const post=(body:unknown)=>fetch(`http://127.0.0.1:${address.port}/api/meta-entity-authoring/change-sets/${id}/approve`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  expect((await post({expectedRevision:1,breakGlass:{authorizedBy:"someone-else",reason:"please"}})).status).toBe(400);
  expect((await post({expectedRevision:1})).status).toBe(409);
  tenantId="tenant-b";expect((await post({expectedRevision:1})).status).toBe(403);
  expect(transition).not.toHaveBeenCalled();
 }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
