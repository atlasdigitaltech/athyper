import { Kysely,PostgresDialect,sql } from "kysely";
import { Pool } from "pg";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import {
  exportFxRates,
  getFxRate,
  validateFxRateImport,
} from "../services/finance-fx-rate-import.service.js";

const integrationDescribe=process.env.RUN_FINANCE_INTEGRATION==="1"?describe:describe.skip;
const rollbackMarker=new Error("__finance_fx_slice4_rollback__");

integrationDescribe("Finance FX Slice 4 Rate Entity maintenance",()=>{
  let db:Kysely<unknown>;
  beforeAll(()=>{
    const connectionString=process.env.FINANCE_INTEGRATION_DATABASE_URL;
    if(!connectionString)throw new Error("FINANCE_INTEGRATION_DATABASE_URL is required");
    db=new Kysely({dialect:new PostgresDialect({pool:new Pool({connectionString,max:2})})});
  });
  afterAll(async()=>db?.destroy(),30_000);

  it("installs one canonical governed operation set and the list contract",async()=>{
    const {rows}=await sql<{
      operation_count:number;
      navigate_count:number;
      destructive_count:number;
      filter_count:number;
      list_columns:string[];
    }>`
      SELECT
        (SELECT count(*)::int FROM control.entity_operation
          WHERE tenant_id IS NULL AND entity_name='fx_rate'
            AND permission_code IN ('create','replace','import','export')) AS operation_count,
        (SELECT count(*)::int FROM control.entity_operation
          WHERE tenant_id IS NULL AND entity_name='fx_rate' AND handler_type='NAVIGATE') AS navigate_count,
        (SELECT count(*)::int FROM control.entity_operation
          WHERE tenant_id IS NULL AND entity_name='fx_rate'
            AND lower(coalesce(operation_code,permission_code)) IN ('update','edit','amend','delete','bulk_update','bulk_delete')) AS destructive_count,
        (SELECT count(*)::int
           FROM control.entity_field field
           JOIN control.entity_version version ON version.id=field.entity_version_id AND version.status='EFFECTIVE'
           JOIN control.entity entity ON entity.id=version.entity_id
          WHERE entity.tenant_id IS NULL AND entity.entity_code='fx_rate'
            AND field.name IN ('from_currency','to_currency','rate_type','effective_date','source','status','version_no')
            AND field.is_filterable) AS filter_count,
        (SELECT ARRAY(SELECT jsonb_array_elements_text(display_config->'list_columns'))
           FROM control.entity WHERE tenant_id IS NULL AND entity_code='fx_rate') AS list_columns
    `.execute(db);
    const contract=rows[0]!;
    expect(contract.operation_count).toBe(4);
    expect(contract.navigate_count).toBe(4);
    expect(contract.destructive_count).toBe(0);
    expect(contract.filter_count).toBe(7);
    expect(contract.list_columns).toEqual([
      "from_currency","to_currency","rate","rate_type","effective_date","effective_time","source","status",
    ]);
  });

  it("dry-runs create and replace-by-natural-key modes and exposes both lineage directions",async()=>{
    const observed:Record<string,unknown>={};
    try{
      await db.transaction().execute(async trx=>{
        const {rows}=await sql<{tenant_id:string;actor_id:string}>`
          SELECT tenant.id AS tenant_id,principal.id AS actor_id
            FROM master.tenant tenant
            JOIN LATERAL(
              SELECT id FROM master.principal
               WHERE tenant_id=tenant.id AND status='active' ORDER BY id LIMIT 1
            ) principal ON true
           WHERE tenant.status='active' ORDER BY tenant.id LIMIT 1
        `.execute(trx);
        const fixture=rows[0];
        if(!fixture)throw new Error("Integration fixture requires an active tenant and principal");
        const reference=`slice4-${Date.now()}`;
        const {rows:predecessorRows}=await sql<{id:string}>`
          INSERT INTO master.fx_rate(
            tenant_id,from_currency,to_currency,rate,rate_type,effective_date,effective_time,
            source,source_reference,version_no,status,created_by
          ) VALUES (
            ${fixture.tenant_id}::uuid,'USD','EUR',0.81,'BUDGET','2197-12-31','12:34:56',
            'CUSTOM',${reference},1,'superseded',${fixture.actor_id}::uuid
          ) RETURNING id
        `.execute(trx);
        const predecessorId=predecessorRows[0]!.id;
        const {rows:successorRows}=await sql<{id:string}>`
          INSERT INTO master.fx_rate(
            tenant_id,from_currency,to_currency,rate,rate_type,effective_date,effective_time,
            source,source_reference,version_no,supersedes_id,status,created_by
          ) VALUES (
            ${fixture.tenant_id}::uuid,'USD','EUR',0.82,'BUDGET','2197-12-31','12:34:56',
            'CUSTOM',${reference||"-successor"},2,${predecessorId}::uuid,'active',${fixture.actor_id}::uuid
          ) RETURNING id
        `.execute(trx);
        const row={
          fromCurrency:"USD",toCurrency:"EUR",rate:0.83,rateType:"BUDGET",
          effectiveDate:"2197-12-31",effectiveTime:"12:34:56",source:"CUSTOM",sourceReference:"slice4-dry-run",
        };
        const createOnly=await validateFxRateImport(trx,fixture.tenant_id,[row],{mode:"create"});
        const replacing=await validateFxRateImport(trx,fixture.tenant_id,[row],{mode:"replace_by_natural_key"});
        const replacementWithoutReason=await validateFxRateImport(
          trx,fixture.tenant_id,[{...row,sourceReference:""}],{mode:"replace_by_natural_key"},
        );
        const predecessor=await getFxRate(trx,fixture.tenant_id,predecessorId);
        const successor=await getFxRate(trx,fixture.tenant_id,successorRows[0]!.id);
        const exported=await exportFxRates(trx,fixture.tenant_id);
        observed.createInvalid=createOnly.summary.invalid;
        observed.replaceAction=replacing.rows[0]?.action;
        observed.replacementReasonInvalid=replacementWithoutReason.summary.invalid;
        observed.successorId=(predecessor.rate as Record<string,unknown>)["successorId"];
        observed.supersedesId=(successor.rate as Record<string,unknown>)["supersedesId"];
        observed.exportContains=exported.content.includes(reference);
        throw rollbackMarker;
      });
    }catch(error){
      if(error!==rollbackMarker)throw error;
    }
    expect(observed.createInvalid).toBe(1);
    expect(observed.replaceAction).toBe("replace");
    expect(observed.replacementReasonInvalid).toBe(1);
    expect(observed.successorId).toBeTruthy();
    expect(observed.supersedesId).toBeTruthy();
    expect(observed.exportContains).toBe(true);
  },30_000);
});
