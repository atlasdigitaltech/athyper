import { describe, it, expect } from "vitest";
import { availableStandardViews, resolveStandardView } from "../standard-views.js";
import { parseStandardViews } from "@athyper/contract-platform-entity-list";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
const label={defaultLocale:"en",values:{en:"My documents"}};
const views=parseStandardViews([{key:"mine",label,position:0,entityCode:"purchase_order",provider:"ownership",ownerField:"owner"},{key:"recent",label,position:1,entityCode:"purchase_order",provider:"recently_viewed",providerKey:"activity.recent"},{key:"approvals",label,position:2,entityCode:"purchase_order",provider:"approval_tasks",providerKey:"workflow.assigned",workflowKey:"po.approval"}]);
const descriptor={entityCode:"purchase_order",fields:[{key:"owner",filterable:true}],listPresentation:{experience:{standardViews:views}}} as unknown as EntityRuntimeDescriptor;
const context={principalId:"alice",tenantId:"tenant-a",planeKey:"neon"} as VerifiedRequestContext;
describe("standard view resolution",()=>{
 it("resolves ownership per viewer and preserves explicit filters",async()=>{
  for(const principalId of ["alice","bob"]){const result=await resolveStandardView({context:{...context,principalId},entityCode:"purchase_order",standardViewKey:"mine",filters:[{field:"status",operator:"eq",value:"draft"}]},descriptor);expect(result.filters).toEqual([{field:"status",operator:"eq",value:"draft"},{field:"owner",operator:"eq",value:principalId}]);}
 });
 it("hides missing providers, rejects cross-collection and unknown selections",async()=>{
  expect((await availableStandardViews(context,descriptor)).map(view=>view.key)).toEqual(["mine"]);
  await expect(resolveStandardView({context,entityCode:"purchase_order",standardViewKey:"recent"},descriptor)).rejects.toMatchObject({code:"STANDARD_VIEW_UNAVAILABLE"});
  expect(await availableStandardViews(context,{...descriptor,entityCode:"business_partner"})).toEqual([]);
 });
 it("uses authorized recent/task providers and preserves an empty set",async()=>{
  const seen:string[]=[];const sources={"activity.recent":{kind:"recently_viewed" as const,available:async()=>true,resolve:async(ctx:VerifiedRequestContext)=>{seen.push(ctx.principalId);return []; }},"workflow.assigned":{kind:"approval_tasks" as const,available:async()=>false,resolve:async()=>["not-authorized"]}};
  expect((await availableStandardViews(context,descriptor,sources)).map(view=>view.key)).toEqual(["mine","recent"]);
  expect((await resolveStandardView({context,entityCode:"purchase_order",standardViewKey:"recent"},descriptor,sources)).recordIds).toEqual([]);expect(seen).toEqual(["alice"]);
 });
 it("validates symbolic provider references",()=>{
  expect(()=>parseStandardViews([{key:"mine",label,position:0,entityCode:"purchase_order",provider:"ownership"}])).toThrow();
  expect(()=>parseStandardViews([{...views[2],workflowKey:undefined}])).toThrow();
  expect(()=>parseStandardViews([views[0],views[0]])).toThrow();
 });
});

it("resolves published request and approval relationships without materializing identities",async()=>{
 const {createRelationshipStandardViewSources}=await import("../standard-views.js");
 const {compileStandardViewRelationship}=await import("../standard-view-relationship-sql.js");
 const {Kysely,PostgresDialect}=await import("kysely");
 const sources=createRelationshipStandardViewSources({authorize:async()=>({allowed:true})} as never);
 const standards=parseStandardViews([
  {key:"my_requests",label,position:0,entityCode:"case_list",provider:"request_documents",providerKey:"document.case_requests.v1",requestBinding:{sourceRef:"entity_case",requester:"initiator_or_submitter"}},
  {key:"approval",label,position:1,entityCode:"case_list",provider:"approval_tasks",providerKey:"workflow.actionable_documents.v1",approvalBinding:{sourceEntityCode:"case_document",workflowKeys:["review.flow"],workTypeCodes:["case.approval"],link:"workflow_request",permissionCode:"case.decide"}},
 ]);
 const d={...descriptor,entityCode:"case_list",storage:{schema:"document",object:"entity_case",idField:"id",tenantField:"tenant_id"},listPresentation:{experience:{standardViews:standards}}} as EntityRuntimeDescriptor;
 const db=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:{} as never})});
 for(const key of ["my_requests","approval"]){
  const result=await resolveStandardView({context,entityCode:d.entityCode,standardViewKey:key},d,sources);
  expect(result.recordIds).toBeUndefined();expect(result.viewRelationships).toHaveLength(1);
  const sql=compileStandardViewRelationship(d,context.tenantId,result.viewRelationships![0]!).compile(db);
  expect(sql.sql).toContain("EXISTS");expect(sql.parameters).toContain(context.principalId);
  if(key==="my_requests"){expect(sql.sql).toContain("before_version = 0");expect(sql.sql).not.toContain("created_by");}
  else {expect(sql.sql).toContain("view_request.entity_id = view_task.source_entity_id::text");expect(sql.parameters).toContain("case_document");}
 }
 const denied=createRelationshipStandardViewSources({authorize:async()=>({allowed:false})} as never);
 expect((await availableStandardViews(context,d,denied)).map(v=>v.key)).toEqual(["my_requests"]);
 expect(await availableStandardViews(context,{...d,storage:{schema:"master",object:"other",idField:"id"}},sources)).toEqual([]);
});

it("rejects invalid or empty relationship bindings",()=>{
 const base={key:"requests",label,position:0,entityCode:"case_list",provider:"request_documents",providerKey:"document.case_requests.v1"};
 for(const requestBinding of [{sourceRef:"raw_table",requester:"initiator_or_submitter"},{sourceRef:"entity_case",operationCodes:[]},{sourceRef:"entity_case",role:{field:"unsafe",values:["supplier"]}}]) expect(()=>parseStandardViews([{...base,requestBinding}])).toThrow();
});
