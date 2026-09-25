import {createHash} from "node:crypto";
import type {Authorizer, VerifiedRequestContext} from "@athyper/server-contract-auth";
import type {Transaction} from "kysely";
import {MasterDataError} from "../../errors.js";
import {readPartnerCompanyProfile} from "./company-profiles-reader.js";

type Tx=Transaction<Record<string,never>>;
/** MetaEntity collection adapter; company setup is owned by BP, not a legacy role row. */
export function createPartnerCompanyProfileViews(options:{
 authorizer:Authorizer;
 admitPartner(context:VerifiedRequestContext,recordId:string):Promise<void>;
 transactions:{run<T>(plane:"neon",actor:VerifiedRequestContext,work:(tx:Tx)=>Promise<T>):Promise<T>};
 readProfile?:typeof readPartnerCompanyProfile;
}){
 return {async read(input:{context:VerifiedRequestContext;recordId:string;capability:"supplier"|"customer";operatingOrganizationId?:string;companyCodeId?:string;asOf?:string}){
  if(input.context.planeKey!=="neon")throw new MasterDataError(400,"PARTNER_PROFILE_CONTEXT_INVALID","NEON context required");
  await options.admitPartner(input.context,input.recordId);
  if(!input.operatingOrganizationId||!input.companyCodeId)throw new MasterDataError(409,"BP_360_SCOPE_REQUIRED","Select an authorized organization and company");
  // Current capability flags and profiles must not be presented as historical snapshots.
  if(input.asOf)throw new MasterDataError(409,"PARTNER_PROFILE_HISTORY_UNAVAILABLE","Historical company profile projection is not available");
  const scope={tenantId:input.context.tenantId,businessPartnerId:input.recordId,operatingOrganizationId:input.operatingOrganizationId,companyCodeId:input.companyCodeId,capability:input.capability};
  return options.transactions.run("neon",input.context,async tx=>{
   const row=await (options.readProfile??readPartnerCompanyProfile)(scope,tx,async()=>
    (await options.authorizer.authorize({context:input.context,permissionCode:"neon.relationship.business_partner.read",resource:{tenantId:scope.tenantId,businessPartnerId:scope.businessPartnerId,operatingOrganizationId:scope.operatingOrganizationId,companyCodeId:scope.companyCodeId,roleLens:scope.capability,sectionCode:`${scope.capability}-company`}})).allowed);
   const items=row?[row]:[];
   return {revision:createHash("sha256").update(JSON.stringify([scope,items])).digest("hex"),data:{state:items.length?"ready":"empty",items}};
  });
 }};
}
