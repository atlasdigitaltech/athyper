import { Kysely,PostgresDialect,sql } from "kysely";
import { Pool } from "pg";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { loadCompanyFxSummary } from "../services/finance-fx-company-summary.service.js";
import { loadTenantFxSummary } from "../services/finance-fx-tenant-summary.service.js";
import { traceFxResolution } from "../services/finance-fx-policy.service.js";
import { allowedCapability,type FxPermissions } from "../services/finance-fx-contracts.js";

const integrationDescribe=process.env.RUN_FINANCE_INTEGRATION==="1"?describe:describe.skip;
const rollbackMarker=new Error("__finance_fx_slice2_rollback__");
const permissions:FxPermissions={
  view:allowedCapability("FINANCE_SETUP.VIEW"),
  configure:allowedCapability("FINANCE_SETUP.CONFIGURE"),
  advancedConfigure:allowedCapability("FINANCE_SETUP.ADVANCED_CONFIGURE"),
  addRate:allowedCapability("create"),
  replaceRate:allowedCapability("replace"),
  importRates:allowedCapability("import"),
  exportRates:allowedCapability("export"),
};

integrationDescribe("Finance FX Slice 2 read models and runtime policy",()=>{
  let db:Kysely<unknown>;
  beforeAll(()=>{
    const connectionString=process.env.FINANCE_INTEGRATION_DATABASE_URL;
    if(!connectionString)throw new Error("FINANCE_INTEGRATION_DATABASE_URL is required");
    db=new Kysely({dialect:new PostgresDialect({pool:new Pool({connectionString,max:2})})});
  });
  afterAll(async()=>db?.destroy(),30_000);

  it("installs advanced and replace permissions plus the governed metadata operation",async()=>{
    const {rows}=await sql<{
      permission_count:number;
      replace_operation_count:number;
      advanced_owner_grants:number;
      fx_policy_operation_count:number;
      fx_policy_writable_field_count:number;
    }>`
      SELECT
        (SELECT count(*)::int FROM shared.permission WHERE code IN ('FINANCE_SETUP.ADVANCED_CONFIGURE','replace')) AS permission_count,
        (SELECT count(*)::int FROM control.entity_operation
          WHERE tenant_id IS NULL AND entity_name='fx_rate' AND permission_code='replace'
            AND handler_target='/app/fx_rate/{id}/replace') AS replace_operation_count,
        (SELECT count(*)::int
           FROM shared.persona_permission pp
           JOIN shared.persona persona ON persona.id=pp.persona_id
           JOIN shared.permission permission ON permission.id=pp.permission_id
          WHERE persona.code IN ('owner','admin') AND permission.code='FINANCE_SETUP.ADVANCED_CONFIGURE'
            AND pp.is_granted) AS advanced_owner_grants,
        (SELECT count(*)::int FROM control.entity_operation
          WHERE tenant_id IS NULL AND entity_name='fx_policy') AS fx_policy_operation_count,
        (SELECT count(*)::int
           FROM control.entity_field field
           JOIN control.entity_version version ON version.id=field.entity_version_id AND version.status='EFFECTIVE'
           JOIN control.entity entity ON entity.id=version.entity_id
          WHERE entity.tenant_id IS NULL AND entity.entity_code='fx_policy'
            AND NOT field.is_read_only) AS fx_policy_writable_field_count
    `.execute(db);
    expect(rows[0]?.permission_count).toBe(2);
    expect(rows[0]?.replace_operation_count).toBe(1);
    expect(rows[0]?.advanced_owner_grants).toBe(2);
    expect(rows[0]?.fx_policy_operation_count).toBe(0);
    expect(rows[0]?.fx_policy_writable_field_count).toBe(0);
  });

  it("returns explicit tenant and Company page states with distinct setup and operational health",async()=>{
    const {rows}=await sql<{tenant_id:string;tenant_code:string;company_code:string;company_id:string;legal_entity_id:string}>`
      SELECT cc.tenant_id,tenant.code AS tenant_code,cc.code AS company_code,cc.id AS company_id,cc.legal_entity_id
        FROM master.company_code cc
        JOIN master.tenant tenant ON tenant.id=cc.tenant_id
       WHERE cc.status='active'
       ORDER BY EXISTS(
         SELECT 1 FROM master.company_code_book_assignment assignment
         JOIN master.ledger_book book ON book.tenant_id=assignment.tenant_id AND book.id=assignment.book_id
          WHERE assignment.tenant_id=cc.tenant_id AND assignment.company_code_id=cc.id
            AND assignment.status='active'
            AND COALESCE(assignment.override_currency_code,book.base_currency_code)<>cc.functional_currency
       ) DESC,cc.id
       LIMIT 1
    `.execute(db);
    const fixture=rows[0];if(!fixture)throw new Error("Integration fixture requires an active Company");
    const asOfDate="2026-07-24";
    const company=await loadCompanyFxSummary(db,{
      tenantId:fixture.tenant_id,companyCode:fixture.company_code,legalEntityId:fixture.legal_entity_id,
      asOfDate,permissions,
    });
    const tenant=await loadTenantFxSummary(db,{
      tenantId:fixture.tenant_id,tenantCode:fixture.tenant_code,asOfDate,permissions,
      allowedCompanyIds:[fixture.company_id],
    });
    expect(company).toHaveProperty("exposure.sources");
    expect(company).toHaveProperty("policy.tenantDefault");
    expect(company).toHaveProperty("policy.availableBooks");
    expect(company).toHaveProperty("postingAccounts.requiredRoleCodes");
    expect(company).toHaveProperty("postingAccounts.books");
    expect(company).toHaveProperty("postingAccounts.accounts");
    expect(company).toHaveProperty("postingAccounts.summary.missingCells");
    expect(company).toHaveProperty("setupStatus.complete");
    expect(company).toHaveProperty("pageState.primaryAction");
    expect(["no_exposure","tenant_missing","effective_policy_missing","posting_accounts_missing","ready"])
      .toContain(company.pageState.state);
    if(company.exposure.hasForeignCurrencyExposure){
      for(const row of company.postingAccounts.rows){
        for(const cell of row.cells){
          expect(cell.required).toBe(true);
          expect(cell.status).not.toBe("not_required");
        }
      }
    }
    expect(company).toHaveProperty("operationalHealth.affectsSetupCompletion",false);
    expect(company).toHaveProperty("permissions.advancedConfigure.allowed",true);
    for(const requirement of company.rateRequirements){
      expect(requirement.requiredAsOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(requirement.observedAt).toMatch(/T/);
      expect(requirement.exposureSources.length).toBeGreaterThan(0);
    }
    expect(tenant).toHaveProperty("setupStatus");
    expect(tenant).toHaveProperty("activeDefaultPolicy");
    expect(tenant).toHaveProperty("scheduledDefaultPolicies");
    expect(tenant).toHaveProperty("rateSummary.affectsSetupCompletion",false);
    expect(tenant.companyUsage.activeCompanyCount).toBe(1);
  },30_000);

  it("turns missing-rate policy fields into stable operational outcomes",async()=>{
    const observed:Record<string,unknown>={};
    try{await db.transaction().execute(async trx=>{
      const {rows}=await sql<{tenant_id:string;company_id:string;company_code:string;actor_id:string;functional_currency:string;foreign_currency:string}>`
        SELECT cc.tenant_id,cc.id AS company_id,cc.code AS company_code,principal.id AS actor_id,
               trim(cc.functional_currency) AS functional_currency,
               (SELECT trim(code) FROM shared.currency WHERE is_active AND code<>cc.functional_currency ORDER BY code LIMIT 1) AS foreign_currency
          FROM master.company_code cc
          JOIN LATERAL(SELECT id FROM master.principal WHERE tenant_id=cc.tenant_id AND status='active' ORDER BY id LIMIT 1) principal ON true
         WHERE cc.status='active' ORDER BY cc.id LIMIT 1
      `.execute(trx);
      const f=rows[0];if(!f)throw new Error("Integration fixture requires Company, principal, and currencies");
      const context=`slice2_${Date.now()}`;
      await sql`
        INSERT INTO control.fx_policy(
          tenant_id,company_code_id,transaction_context,effective_from,priority,
          default_rate_type,revaluation_rate_type,preferred_sources,maximum_rate_age_days,
          missing_rate_behavior,manual_override_allowed,manual_override_approval_required,status,created_by
        ) VALUES (
          ${f.tenant_id}::uuid,${f.company_id}::uuid,${context},'2198-01-01',999,
          'BUDGET','PERIOD_END','["CUSTOM"]'::jsonb,0,
          'manual_with_approval',true,true,'active',${f.actor_id}::uuid
        )
      `.execute(trx);
      const trace=await traceFxResolution(trx,{
        tenantId:f.tenant_id,companyCode:f.company_code,fromCurrency:f.foreign_currency,
        toCurrency:f.functional_currency,rateType:"BUDGET",asOfDate:"2198-01-01",
        transactionContext:context,purpose:"transaction",
      });
      observed.code=trace.outcome.code;
      observed.blocks=trace.outcome.blocksOperation;
      observed.approval=trace.runtimeDirectives?.manualOverrideApprovalRequired;
      throw rollbackMarker;
    });}catch(error){if(error!==rollbackMarker)throw error;}
    expect(observed.code).toBe("FX_MANUAL_OVERRIDE_APPROVAL_REQUIRED");
    expect(observed.blocks).toBe(true);
    expect(observed.approval).toBe(true);
  },30_000);
});
