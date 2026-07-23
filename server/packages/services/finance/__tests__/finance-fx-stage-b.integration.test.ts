import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveFxPolicy, traceFxResolution } from "../services/finance-fx-policy.service.js";
import { validateFxRateImport } from "../services/finance-fx-rate-import.service.js";

const integrationDescribe=process.env.RUN_FINANCE_INTEGRATION==="1"?describe:describe.skip;
const rollbackMarker=new Error("__finance_fx_stage_b_rollback__");

integrationDescribe("Finance Setup Phase 2 Stage B currency and FX",()=>{
 let db:Kysely<unknown>;
 beforeAll(()=>{const connectionString=process.env.FINANCE_INTEGRATION_DATABASE_URL;if(!connectionString)throw new Error("FINANCE_INTEGRATION_DATABASE_URL is required");db=new Kysely({dialect:new PostgresDialect({pool:new Pool({connectionString,max:2})})});});
 afterAll(async()=>db?.destroy(),30_000);

 it("resolves the most specific approved policy and produces a direct-rate trace",async()=>{
  const observed:Record<string,unknown>={};
  try{await db.transaction().execute(async trx=>{
   const {rows}=await sql<{tenant_id:string;company_id:string;company_code:string;actor_id:string}>`SELECT cc.tenant_id,cc.id AS company_id,cc.code AS company_code,p.id AS actor_id FROM master.company_code cc JOIN LATERAL(SELECT id FROM master.principal WHERE tenant_id=cc.tenant_id AND status='active' ORDER BY id LIMIT 1)p ON true WHERE cc.status='active' ORDER BY cc.id LIMIT 1`.execute(trx);
   const f=rows[0];if(!f)throw new Error("Integration fixture requires an active company and principal");
   const context=`stage_b_${Date.now()}`;
   await sql`INSERT INTO control.fx_policy(tenant_id,transaction_context,effective_from,default_rate_type,revaluation_rate_type,preferred_sources,status,created_by) VALUES(${f.tenant_id}::uuid,${context},'2099-01-01','CONTRACTED','PERIOD_END','["CUSTOM"]'::jsonb,'active',${f.actor_id}::uuid)`.execute(trx);
   const {rows:companyPolicies}=await sql<{id:string}>`INSERT INTO control.fx_policy(tenant_id,company_code_id,transaction_context,effective_from,priority,default_rate_type,revaluation_rate_type,preferred_sources,maximum_rate_age_days,status,created_by) VALUES(${f.tenant_id}::uuid,${f.company_id}::uuid,${context},'2099-01-01',10,'CONTRACTED','PERIOD_END','["CUSTOM"]'::jsonb,0,'active',${f.actor_id}::uuid) RETURNING id`.execute(trx);
   const resolution=await resolveFxPolicy(trx,{tenantId:f.tenant_id,companyCodeId:f.company_id,transactionContext:context,asOfDate:"2099-01-01"});
   await sql`INSERT INTO master.fx_rate(tenant_id,from_currency,to_currency,rate,rate_type,effective_date,source,source_reference,status,created_by) VALUES(${f.tenant_id}::uuid,'USD','EUR',0.91,'CONTRACTED','2099-01-01','CUSTOM','stage-b-test','active',${f.actor_id}::uuid)`.execute(trx);
   const trace=await traceFxResolution(trx,{tenantId:f.tenant_id,companyCode:f.company_code,fromCurrency:"USD",toCurrency:"EUR",rateType:"CONTRACTED",asOfDate:"2099-01-01",transactionContext:context});
   observed.policyId=resolution.selected?.id;observed.expectedPolicyId=companyPolicies[0]?.id;observed.method=trace.selected?.method;observed.rate=trace.selected?.rate;
   throw rollbackMarker;
  });}catch(error){if(error!==rollbackMarker)throw error;}
  expect(observed.policyId).toBe(observed.expectedPolicyId);expect(observed.method).toBe("direct");expect(observed.rate).toBeCloseTo(.91);
 },30_000);

 it("validates currencies, duplicates, positive rates and manual references",async()=>{
  const {rows}=await sql<{id:string}>`SELECT id FROM master.tenant WHERE status='active' LIMIT 1`.execute(db);if(!rows[0])throw new Error("Integration fixture requires an active tenant");
  const result=await validateFxRateImport(db,rows[0].id,[
   {fromCurrency:"USD",toCurrency:"EUR",rate:0.9,rateType:"SPOT",effectiveDate:"2026-07-20",source:"MANUAL"},
   {fromCurrency:"USD",toCurrency:"EUR",rate:0.9,rateType:"SPOT",effectiveDate:"2026-07-20",source:"MANUAL"},
   {fromCurrency:"USD",toCurrency:"USD",rate:-1,rateType:"UNKNOWN",effectiveDate:"bad",source:"BAD"},
  ]);
  expect(result.summary.valid).toBe(1);expect(result.summary.invalid).toBe(2);expect(result.summary.warnings).toBeGreaterThan(0);
 });
});
