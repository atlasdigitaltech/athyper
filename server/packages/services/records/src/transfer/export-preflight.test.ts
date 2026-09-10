import {readFileSync} from "node:fs";
import {entityAuthorizationProfileHash} from "../entity-authorization-rollout.js";
import {expect,it,vi} from "vitest";
import type {VerifiedRequestContext} from "@athyper/server-contract-auth";
import {createRecordTransferService} from "./transfer-service.js";
const context={planeKey:"neon",tenantId:"tenant",principalId:"principal",permissions:{allowed:[]}} as unknown as VerifiedRequestContext;
function fixture(enforced=false){
 const profile=JSON.parse(readFileSync(new URL("../../../../../../packages/contracts/platform/fixtures/entity-authorization/business-partner.v1.json",import.meta.url),"utf8"));
 const descriptor={entityCode:"business_partner",planeKey:"neon",operations:{export:{code:"export",permissionCode:"neon.relationship.bp_target.export"}},fields:[],...(enforced?{authorization:profile}:{})};
 const authorize=vi.fn(async()=>({allowed:false as const,reason:"test_denied"})),enqueue=vi.fn(),transaction=vi.fn(),resolve=vi.fn(async()=>({status:"ready" as const,authorizationResource:{},constraints:[],labels:[],fingerprintMaterial:{}}));
 const service=createRecordTransferService({metadata:{getEntityDescriptor:async()=>descriptor as never},authorizer:{authorize,...(enforced?{enforcedEntityProfile:()=>entityAuthorizationProfileHash(profile)}:{})},staging:{} as never,validator:{} as never,jobs:{enqueue},transactions:{run:transaction},audit:{} as never,outbox:{} as never,adapters:{} as never,collectionScopes:{resolve}});
 return{descriptor,authorize,enqueue,transaction,resolve,service};
}
it("prepares the real export scope without writes or recursive export authorization, while execution still denies",async()=>{
 const f=fixture();await f.service.preflightExport(context,"business_partner",{scopeCoordinate:{operatingOrganizationId:"org"}});
 expect(f.resolve).toHaveBeenCalledWith(expect.objectContaining({coordinate:{operatingOrganizationId:"org"}}));
 expect(f.authorize).not.toHaveBeenCalled();expect(f.enqueue).not.toHaveBeenCalled();expect(f.transaction).not.toHaveBeenCalled();
 await expect(f.service.requestExport(context,"business_partner",{})).rejects.toThrow();
 expect(f.authorize).toHaveBeenCalled();expect(f.enqueue).not.toHaveBeenCalled();expect(f.transaction).not.toHaveBeenCalled();
});
it("rejects privacy violations and operations absent from the selected descriptor",async()=>{
 const f=fixture();await expect(f.service.preflightExport(context,"business_partner",{_transfer:{fields:["person.first_name"]}})).rejects.toMatchObject({code:"BUSINESS_PARTNER_EXPORT_WORKFORCE_FORBIDDEN"});
 delete (f.descriptor.operations as Record<string,unknown>).export;
 await expect(f.service.preflightExport(context,"business_partner",{})).rejects.toMatchObject({code:"ENTITY_OPERATION_UNAVAILABLE"});
 expect(f.enqueue).not.toHaveBeenCalled();
});

it("rejects conflicting authorization and worker projections before queueing",async()=>{
 const f=fixture(true);
 await expect(f.service.preflightExport(context,"business_partner",{fields:["code"],_transfer:{fields:["legal_name"]}})).rejects.toMatchObject({code:"EXPORT_FIELD_PROJECTION_MISMATCH"});
 expect(f.authorize).not.toHaveBeenCalled();expect(f.enqueue).not.toHaveBeenCalled();
 await expect(f.service.preflightExport(context,"business_partner",{_transfer:{fields:["code"]}})).resolves.toBeUndefined();
});
