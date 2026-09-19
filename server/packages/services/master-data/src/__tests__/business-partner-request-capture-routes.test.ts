import express from "express";
import {expect,it,vi} from "vitest";
import {registerBusinessPartnerRequestRoutes} from "../business-partner-request-routes.js";
import {MasterDataError} from "../errors.js";
it("passes draft bank/document collections to server validation and rejects unknown collections",async()=>{
 const app=express();app.use(express.json());
 const create=vi.fn(async()=>{throw new MasterDataError(422,"CAPTURE_TEST_VALIDATION","Supplied values need validation");});
 registerBusinessPartnerRequestRoutes(app,{authenticate:(_q,_r,next)=>next(),readContext:()=>({}) as never,service:{create} as never});
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
 const address=server.address();if(!address||typeof address==="string")throw Error("Test server required");
 const send=(extensions:unknown)=>fetch(`http://127.0.0.1:${address.port}/api/neon/business-partner-cases`,{method:"POST",headers:{"content-type":"application/json","idempotency-key":"capture-route-test"},body:JSON.stringify({idempotencyKey:"capture-route-test",kind:"new_partner",source:{kind:"manual"},requestedRole:"supplier",draftCapture:true,proposedPayload:{},extensions})});
 try{
  const extensions={bankAccounts:[],supportingDocuments:[]};
  const accepted=await send(extensions);expect(accepted.status).toBe(422);
  expect(create).toHaveBeenCalledWith(expect.objectContaining({draftCapture:true,extensions}));
  create.mockClear();expect((await send({operationalBankAccounts:[]})).status).toBe(400);expect(create).not.toHaveBeenCalled();
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
});
