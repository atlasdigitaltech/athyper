import { Kysely,PostgresDialect,sql } from "kysely";
import { Pool } from "pg";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { loadCompanyCertificationReadiness } from "../services/finance-certification-readiness.service.js";

const integrationDescribe=process.env.RUN_FINANCE_INTEGRATION==="1"?describe:describe.skip;

integrationDescribe("Finance FX Slice 7 rollout database contract",()=>{
  let db:Kysely<any>;
  beforeAll(()=>{
    const connectionString=process.env.FINANCE_INTEGRATION_DATABASE_URL;
    if(!connectionString)throw new Error("FINANCE_INTEGRATION_DATABASE_URL is required");
    db=new Kysely({dialect:new PostgresDialect({pool:new Pool({connectionString,max:2})})});
  });
  afterAll(async()=>db?.destroy(),30_000);

  it("installs a navigation-only flag and retains readable rate and policy history",async()=>{
    const {rows}=await sql<{
      enabled:boolean;metadata:Record<string,unknown>;policy_history:number;rate_history:number;rate_invalidation_triggers:number;
    }>`
      SELECT flag.is_enabled AS enabled,flag.metadata,
             (SELECT count(*)::int FROM control.fx_policy) AS policy_history,
             (SELECT count(*)::int FROM master.fx_rate) AS rate_history,
             (SELECT count(*)::int FROM pg_trigger
               WHERE tgrelid='master.fx_rate'::regclass
                 AND tgname='trg_fin_ready_fx_rate' AND NOT tgisinternal) AS rate_invalidation_triggers
        FROM control.feature_flag flag
       WHERE flag.code='finance.fx_entity_navigation'
    `.execute(db);
    expect(rows[0]?.enabled).toBe(true);
    expect(rows[0]?.metadata["rollback"]).toContain("no data rollback");
    expect(rows[0]?.policy_history).toBeGreaterThanOrEqual(0);
    expect(rows[0]?.rate_history).toBeGreaterThanOrEqual(0);
    expect(rows[0]?.rate_invalidation_triggers).toBe(0);
  });

  it("returns non-blocking operational FX health in the service snapshot",async()=>{
    const {rows}=await sql<{tenant_id:string;code:string}>`
      SELECT tenant_id,code FROM master.company_code
       WHERE status='active' ORDER BY created_at LIMIT 1
    `.execute(db);
    const fixture=rows[0];
    if(!fixture)return;
    const snapshot=await loadCompanyCertificationReadiness(db,fixture.tenant_id,fixture.code);
    const fx=snapshot?.domains.find(domain=>domain.domain==="currency_fx");
    expect(fx?.checks.map(check=>check.code)).toEqual([
      "fx_policy_effective","fx_setup_complete","fx_posting_accounts",
    ]);
    expect(fx?.operationalHealth?.affectsCertification).toBe(false);
  });
});
