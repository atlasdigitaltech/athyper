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

 it("registers the hardened live database and metadata contracts",async()=>{
  const {rows}=await sql<{
   lineage_columns:number; source_aware_index:boolean; immutable_triggers:number;
   tenant_delete_policies:number; policy_operations:number; destructive_rate_operations:number;
   replace_rate_operations:number; writable_policy_fields:number; forced_rls_tables:number;
  }>`
   SELECT
    (SELECT count(*)::int FROM information_schema.columns
      WHERE table_schema='master' AND table_name='fx_rate'
        AND column_name IN ('version_no','supersedes_id')) AS lineage_columns,
    (SELECT position('source' in pg_get_indexdef(indexrelid))>0
       FROM pg_index
      WHERE indexrelid='master.fxr_pair_date_uq'::regclass) AS source_aware_index,
    (SELECT count(*)::int FROM pg_trigger
      WHERE tgrelid IN ('master.fx_rate'::regclass,'control.fx_policy'::regclass)
        AND tgname IN ('trg_fx_rate_immutable','trg_fx_policy_immutable') AND NOT tgisinternal) AS immutable_triggers,
    (SELECT count(*)::int FROM pg_policies
      WHERE (schemaname,tablename) IN (('master','fx_rate'),('control','fx_policy'))
        AND policyname='tenant_delete') AS tenant_delete_policies,
    (SELECT count(*)::int FROM control.entity_operation
      WHERE tenant_id IS NULL AND entity_name='fx_policy') AS policy_operations,
    (SELECT count(*)::int FROM control.entity_operation
      WHERE tenant_id IS NULL AND entity_name='fx_rate'
        AND lower(coalesce(operation_code,permission_code)) IN
          ('update','edit','delete','delete_draft','bulk_update','bulk_delete')) AS destructive_rate_operations,
    (SELECT count(*)::int FROM control.entity_operation
      WHERE tenant_id IS NULL AND entity_name='fx_rate' AND permission_code='replace'
        AND handler_target='/app/fx_rate/{id}/replace') AS replace_rate_operations,
    (SELECT count(*)::int
       FROM control.entity_field ef
       JOIN control.entity_version ev ON ev.id=ef.entity_version_id AND ev.status='EFFECTIVE'
       JOIN control.entity e ON e.id=ev.entity_id
      WHERE e.tenant_id IS NULL AND e.entity_code='fx_policy' AND NOT ef.is_read_only) AS writable_policy_fields,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE (n.nspname,c.relname) IN (('master','fx_rate'),('control','fx_policy'))
        AND c.relrowsecurity AND c.relforcerowsecurity) AS forced_rls_tables
  `.execute(db);
  const contract=rows[0]!;
  expect(contract.lineage_columns).toBe(2);
  expect(contract.source_aware_index).toBe(true);
  expect(contract.immutable_triggers).toBe(2);
  expect(contract.tenant_delete_policies).toBe(0);
  expect(contract.policy_operations).toBe(0);
  expect(contract.destructive_rate_operations).toBe(0);
  expect(contract.replace_rate_operations).toBe(1);
  expect(contract.writable_policy_fields).toBe(0);
  expect(contract.forced_rls_tables).toBe(2);
 });

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

 it("enforces source-aware rates and append-only rate and policy replacements",async()=>{
  const observed:Record<string,unknown>={};
  try{await db.transaction().execute(async trx=>{
   const {rows}=await sql<{tenant_id:string;company_id:string;actor_id:string}>`
    SELECT cc.tenant_id,cc.id AS company_id,p.id AS actor_id
      FROM master.company_code cc
      JOIN LATERAL(
        SELECT id FROM master.principal
         WHERE tenant_id=cc.tenant_id AND status='active' ORDER BY id LIMIT 1
      ) p ON true
     WHERE cc.status='active' ORDER BY cc.id LIMIT 1
   `.execute(trx);
   const f=rows[0];if(!f)throw new Error("Integration fixture requires an active company and principal");

   const {rows:rateRows}=await sql<{id:string;source:string}>`
    INSERT INTO master.fx_rate(
      tenant_id,from_currency,to_currency,rate,rate_type,effective_date,source,source_reference,status,created_by
    ) VALUES
      (${f.tenant_id}::uuid,'USD','EUR',0.91,'CONTRACTED','2199-12-31','CUSTOM','slice-1-custom','active',${f.actor_id}::uuid),
      (${f.tenant_id}::uuid,'USD','EUR',0.92,'CONTRACTED','2199-12-31','API','slice-1-api','active',${f.actor_id}::uuid)
    RETURNING id,source
   `.execute(trx);
   observed.activeSourceCount=rateRows.length;
   const customId=rateRows.find(row=>row.source==="CUSTOM")!.id;

   let directEditRejected=false;
   await sql`SAVEPOINT direct_rate_edit`.execute(trx);
   try{
    await sql`UPDATE master.fx_rate SET rate=0.93 WHERE tenant_id=${f.tenant_id}::uuid AND id=${customId}::uuid`.execute(trx);
   }catch{
    directEditRejected=true;
    await sql`ROLLBACK TO SAVEPOINT direct_rate_edit`.execute(trx);
   }
   observed.directEditRejected=directEditRejected;

   await sql`
    UPDATE master.fx_rate
       SET status='superseded',status_changed_at=now(),status_changed_by=${f.actor_id}::uuid,
           updated_at=now(),updated_by=${f.actor_id}::uuid
     WHERE tenant_id=${f.tenant_id}::uuid AND id=${customId}::uuid
   `.execute(trx);
   const {rows:successor}=await sql<{id:string}>`
    INSERT INTO master.fx_rate(
      tenant_id,from_currency,to_currency,rate,rate_type,effective_date,source,source_reference,
      version_no,supersedes_id,status,created_by
    ) VALUES (
      ${f.tenant_id}::uuid,'USD','EUR',0.93,'CONTRACTED','2199-12-31','CUSTOM','slice-1-correction',
      2,${customId}::uuid,'active',${f.actor_id}::uuid
    ) RETURNING id
   `.execute(trx);
   const {rows:lineage}=await sql<{count:number}>`
    SELECT count(*)::int AS count FROM master.fx_rate
     WHERE tenant_id=${f.tenant_id}::uuid AND id IN (${customId}::uuid,${successor[0]!.id}::uuid)
   `.execute(trx);
   observed.rateLineageCount=lineage[0]?.count;

   const context=`slice_1_${Date.now()}`;
   const {rows:policy}=await sql<{id:string}>`
    INSERT INTO control.fx_policy(
      tenant_id,company_code_id,transaction_context,effective_from,status,version_no,created_by
    ) VALUES (${f.tenant_id}::uuid,${f.company_id}::uuid,${context},'2199-01-01','active',1,${f.actor_id}::uuid)
    RETURNING id
   `.execute(trx);
   await sql`
    UPDATE control.fx_policy
       SET status='superseded',status_changed_at=now(),status_changed_by=${f.actor_id}::uuid,
           updated_at=now(),updated_by=${f.actor_id}::uuid
     WHERE tenant_id=${f.tenant_id}::uuid AND id=${policy[0]!.id}::uuid
   `.execute(trx);
   const {rows:policySuccessor}=await sql<{id:string}>`
    INSERT INTO control.fx_policy(
      tenant_id,company_code_id,transaction_context,effective_from,default_rate_type,
      status,version_no,supersedes_id,created_by
    ) VALUES (
      ${f.tenant_id}::uuid,${f.company_id}::uuid,${context},'2199-01-01','CONTRACTED',
      'active',2,${policy[0]!.id}::uuid,${f.actor_id}::uuid
    ) RETURNING id
   `.execute(trx);
   const {rows:policyLineage}=await sql<{count:number}>`
    SELECT count(*)::int AS count FROM control.fx_policy
     WHERE tenant_id=${f.tenant_id}::uuid AND id IN (${policy[0]!.id}::uuid,${policySuccessor[0]!.id}::uuid)
   `.execute(trx);
   observed.policyLineageCount=policyLineage[0]?.count;
   throw rollbackMarker;
  });}catch(error){if(error!==rollbackMarker)throw error;}
  expect(observed.activeSourceCount).toBe(2);
  expect(observed.directEditRejected).toBe(true);
  expect(observed.rateLineageCount).toBe(2);
  expect(observed.policyLineageCount).toBe(2);
 },30_000);
});
