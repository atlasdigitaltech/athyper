// Local-only governed policy fixture: demonstrates rule publication and simulation,
// not a statutory leave entitlement or payroll calculation.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {homedir} from "node:os";
import {Kysely,PostgresDialect,sql} from "kysely";
import pg from "pg";
import {createKyselyPolicyAuthoringRepository} from "../../../packages/platform/policy/src/kysely-policy-authoring-repository.js";
import {createPolicyAuthoringService} from "../../../packages/platform/policy/src/policy-authoring-service.js";
import {createJsonRuleEvaluator} from "../../../packages/platform/policy/src/json-rule-evaluator.js";
import {createKyselyPolicyRepository} from "../../../packages/platform/policy/src/kysely-policy-repository.js";
import {createPolicyService} from "../../../packages/platform/policy/src/policy-service.js";
import {createHrStage2Service} from "../../../packages/services/master-data/src/hr-stage2-service.js";
const host=process.env.PROBE_DB_HOST;if(!host)throw Error("PROBE_DB_HOST is required");
const tenantId="11111111-1111-4111-8111-111111111111",maker="d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c",reviewer="ff3d770b-fc3f-5b2c-a5c1-901954691ddf",companyCodeId="7e0e3d2c-c5fc-5960-b4c3-80153c1e95a7",entityType="hr.leave.demo_eligibility",name="Synthetic leave request eligibility example";
const db=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:new pg.Pool({host,database:"athyper_neon",user:"postgres",password:readFileSync(`${homedir()}/.athyper/instances/dev/secrets/postgres-password`,"utf8").trim(),max:1})})});
const context=(principalId:string)=>({planeKey:"neon",tenantId,principalId,requestId:"44444444-4444-4444-8444-444444444444"}) as any;
try{const result=await db.transaction().execute(async tx=>{
 await sql`SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',${tenantId},true),set_config('app.current_principal_id',${maker},true)`.execute(tx);
 const existing=(await sql<{id:string}>`SELECT id FROM control.policy_definition WHERE tenant_id=${tenantId}::uuid AND entity_type=${entityType} AND status='active' LIMIT 1`.execute(tx)).rows[0];if(existing)return{status:"already_active",policyId:existing.id};
 const makerRepo=createKyselyPolicyAuthoringRepository({tenantId,principalId:maker}),evaluator=createJsonRuleEvaluator();
 const service=createPolicyAuthoringService({repository:makerRepo,evaluator,signer:{async sign(){throw Error("Fixture export unavailable")},async verify(){return false}} as any});
 const draft=await makerRepo.createDraft({definition:{tenantId,entityType,name,priority:100,evaluationMode:"first_match",effectiveFrom:"2026-01-01",versionNo:1},rules:[
 {id:"00000000-0000-4000-8000-000000000001",priority:10,condition:{and:[{">=":[{var:"serviceMonths"},3]},{"<=":[{var:"requestedDays"},5]}]},action:"allow",actionConfig:{},metadata:{synthetic:true},explanation:"Synthetic short request rule"},
 {id:"00000000-0000-4000-8000-000000000002",priority:20,condition:{},action:"deny",actionConfig:{},metadata:{synthetic:true},explanation:"Synthetic fallback"}
 ],tests:[]},tx);
 await service.saveTestCase({id:undefined as any,definitionId:draft.id,code:"eligible",name:"Synthetic eligible request",input:{serviceMonths:6,requestedDays:3},expected:{action:"allow",permitted:true}},tx);
 await service.saveTestCase({id:undefined as any,definitionId:draft.id,code:"ineligible",name:"Synthetic ineligible request",input:{serviceMonths:1,requestedDays:3},expected:{action:"deny",permitted:false}},tx);
 const tests=await service.runAllTests(draft.id,tx);assert.equal(tests.length,2);assert(tests.every(row=>row.passed));
 await makerRepo.requestApproval(draft.id,tx);
 await sql`SELECT set_config('app.current_principal_id',${reviewer},true)`.execute(tx);
 const reviewerRepo=createKyselyPolicyAuthoringRepository({tenantId,principalId:reviewer});
 const reviewerService=createPolicyAuthoringService({repository:reviewerRepo,evaluator,signer:{async sign(){throw Error("Fixture export unavailable")},async verify(){return false}} as any});
 await reviewerService.activate(draft.id,tx);
 const hr=createHrStage2Service({authorizer:{async authorize(){return{allowed:true}}} as any,transactions:{async run(_plane:any,identity:any,work:any){await sql`SELECT set_config('app.current_principal_id',${identity.principalId},true)`.execute(tx);return work(tx)}} as any,audit:{async record(){}} as any});
 const assignment=await hr.createPolicyAssignment(context(maker),{idempotencyKey:"stage2-synthetic-leave-demo-v1",policyDefinitionId:draft.id,scopeKind:"company",countryCode:"CA",companyCodeId,effectiveFrom:"2026-01-01"});
 await hr.publishPolicyAssignment(context(reviewer),String(assignment["id"]),1);
 await sql`SELECT set_config('app.current_principal_id',${reviewer},true)`.execute(tx);
 const policy=createPolicyService({repository:createKyselyPolicyRepository(),transactions:{run:async(_plane:any,_actor:any,work:any)=>work(tx)} as any,audit:{async record(){}} as any});
 const allow=await policy.simulate({context:context(reviewer),entityType,policyDefinitionIds:[draft.id],facts:{serviceMonths:6,requestedDays:3}},tx);
 const deny=await policy.simulate({context:context(reviewer),entityType,policyDefinitionIds:[draft.id],facts:{serviceMonths:1,requestedDays:3}},tx);
 assert.equal(allow.decision.action,"allow");assert.equal(deny.decision.action,"deny");
 return{status:"created",policyId:draft.id,tests:tests.length,allow:allow.decision.action,deny:deny.decision.action};
 });console.log(JSON.stringify(result));}finally{await db.destroy();}
