import { describe,expect,it } from "vitest";
import { evaluateBusinessPartner360Policy } from "../business-partner-360-policy.js";
import { BUSINESS_PARTNER_360_PERMISSIONS as P } from "@athyper/server-contract-master-data";
import type { Authorizer } from "@athyper/server-contract-auth";
const input={context:{} as never,businessPartnerId:"partner",category:"organization" as const,roles:["supplier"] as const,roleLens:"all" as const,scoped:false,counts:{},directoryAdmitted:true};
const authorizer=(denied?:string):Authorizer=>({async authorize(query){
 if(query.permissionCode===denied)return{allowed:false,reason:"denied_by_grant"};
 if(query.resource)return{allowed:false,reason:"scope_not_contained"};
 return{allowed:true};
}});
describe("metadata-admitted section navigation",()=>{
 it("shows granted global tabs and requires context for scoped tabs",async()=>{
  const result=await evaluateBusinessPartner360Policy(authorizer(),input);
  for(const key of ["overview","identity","contacts","addresses","identifiers-tax","governance","roles-scope","requests","activity"])expect(result.sections.find(section=>section.code===key)).toMatchObject({authorization:"granted"});
  expect(result.sections.find(section=>section.code==="banking")).toMatchObject({reasonCode:"BP_360_SCOPE_REQUIRED"});
  expect(result.sections.some(section=>section.code==="customer-company")).toBe(false);
  expect(result.granted.has(P.bankMasked)).toBe(false);
 });
 it("preserves section and field denials",async()=>{
  const result=await evaluateBusinessPartner360Policy(authorizer(P.taxMasked),input);
  expect(result.granted.has(P.taxMasked)).toBe(false);
  const contacts=await evaluateBusinessPartner360Policy(authorizer(P.contact),input);
  expect(contacts.sections.some(section=>section.code==="contacts")).toBe(false);
 });
 it("does not relax unadmitted records or explicit transaction scopes",async()=>{
  expect((await evaluateBusinessPartner360Policy(authorizer(),{...input,directoryAdmitted:false})).sections).toEqual([]);
  expect((await evaluateBusinessPartner360Policy(authorizer(),{...input,scoped:true,operatingOrganizationId:"other"})).sections).toEqual([]);
 });
});

it("keeps banking discoverable across roles and certificates available without company context", async () => {
 const result=await evaluateBusinessPartner360Policy(authorizer(),{...input,roles:[]});
 expect(result.sections.find(section=>section.code==='banking')).toMatchObject({reasonCode:'BP_360_SCOPE_REQUIRED'});
 expect(result.sections.find(section=>section.code==='qualifications-certificates')).not.toHaveProperty('reasonCode');
 expect(result.granted.has(P.bankMasked)).toBe(false);
});
it("supports certificate-only readers without granting qualification or attachment access", async () => {
 const result=await evaluateBusinessPartner360Policy({async authorize(query){return [P.record,P.certificate].includes(query.permissionCode as never)?{allowed:true}:{allowed:false,reason:'denied_by_grant'};}},input);
 expect(result.sections.some(section=>section.code==='qualifications-certificates')).toBe(true);
 expect(result.granted.has(P.qualification)).toBe(false);
 expect(result.granted.has(P.attachment)).toBe(false);
});
it("gates document and discussion tabs by their own permissions without fabricated counts",async()=>{
 const result=await evaluateBusinessPartner360Policy(authorizer(),input);
 expect(result.sections.find(section=>section.code==='comments')).not.toHaveProperty('count');
 expect(result.sections.find(section=>section.code==='attachments')).not.toHaveProperty('count');
 expect((await evaluateBusinessPartner360Policy(authorizer(P.comment),input)).sections.some(section=>section.code==='comments')).toBe(false);
 expect((await evaluateBusinessPartner360Policy(authorizer(P.attachment),input)).sections.some(section=>section.code==='attachments')).toBe(false);
});
