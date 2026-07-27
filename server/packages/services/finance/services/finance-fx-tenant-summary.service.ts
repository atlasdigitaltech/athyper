import { sql, type Kysely } from "kysely";
import { policyFromRow } from "./finance-fx-policy.service.js";
import { loadCompanyFxExposure } from "./finance-fx-exposure.service.js";
import { loadCompanyFxRateHealth } from "./finance-fx-rate-health.service.js";
import type { FxPermissions, FxRateRequirement } from "./finance-fx-contracts.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb=Kysely<any>;

export async function loadTenantFxSummary(db:AnyDb,input:{
  tenantId:string;tenantCode:string;asOfDate:string;permissions:FxPermissions;allowedCompanyIds?:string[];
}) {
  const computedAt=new Date().toISOString();
  const companyFilter=input.allowedCompanyIds?.length?input.allowedCompanyIds:null;
  const [{rows:tenantRows},{rows:policyRows},{rows:rateRows},{rows:companyRows}]=await Promise.all([
    sql<{id:string;code:string;name:string}>`SELECT id,code,name FROM master.tenant WHERE id=${input.tenantId}::uuid AND code=${input.tenantCode} LIMIT 1`.execute(db),
    sql<Record<string,unknown>>`
      SELECT * FROM control.fx_policy
       WHERE tenant_id=${input.tenantId}::uuid
         AND company_code_id IS NULL AND ledger_book_id IS NULL
         AND status='active'
       ORDER BY effective_from,priority DESC,version_no DESC
    `.execute(db),
    sql<{active_count:number;latest_effective_date:string|null}>`
      SELECT count(*)::int AS active_count,max(effective_date)::text AS latest_effective_date
        FROM master.fx_rate WHERE tenant_id=${input.tenantId}::uuid AND status='active'
    `.execute(db),
    sql<{id:string;code:string}>`
      SELECT id,code FROM master.company_code
       WHERE tenant_id=${input.tenantId}::uuid AND status='active'
         AND (${companyFilter}::uuid[] IS NULL OR id=ANY(${companyFilter}::uuid[]))
       ORDER BY code
    `.execute(db),
  ]);
  const tenant=tenantRows[0];
  if(!tenant)throw new Error("FX tenant summary scope was not resolved.");
  const policies=policyRows.map(policyFromRow);
  const applicable=policies.filter(policy=>policy.effectiveFrom<=input.asOfDate&&(!policy.effectiveTo||policy.effectiveTo>=input.asOfDate));
  applicable.sort((a,b)=>b.priority-a.priority||b.effectiveFrom.localeCompare(a.effectiveFrom)||b.versionNo-a.versionNo);
  const activeDefaultPolicy=applicable[0]??null;
  const scheduledDefaultPolicies=policies.filter(policy=>policy.effectiveFrom>input.asOfDate).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));

  const companyHealth=await Promise.all(companyRows.map(async company=>{
    const exposure=await loadCompanyFxExposure(db,{tenantId:input.tenantId,companyCode:company.code,asOfDate:input.asOfDate});
    const health=await loadCompanyFxRateHealth(db,{tenantId:input.tenantId,exposure,asOfDate:input.asOfDate,observedAt:computedAt});
    return {company,exposure,health};
  }));
  const requirements=new Map<string,FxRateRequirement&{impactedCompanyCodes:string[]}>();
  for(const item of companyHealth){
    for(const requirement of item.health.requirements){
      const current=requirements.get(requirement.requirementKey);
      if(current){
        if(!current.impactedCompanyCodes.includes(item.company.code))current.impactedCompanyCodes.push(item.company.code);
      }else{
        requirements.set(requirement.requirementKey,{...requirement,impactedCompanyCodes:[item.company.code]});
      }
    }
  }
  const distinctRequirements=[...requirements.values()];
  const attention=distinctRequirements.filter(requirement=>requirement.state!=="healthy");

  const companyIds=companyRows.map(company=>company.id);
  const {rows:overrideRows}=await sql<{company_code_id:string}>`
    SELECT DISTINCT company_code_id
      FROM control.fx_policy
     WHERE tenant_id=${input.tenantId}::uuid
       AND company_code_id=ANY(${companyIds}::uuid[]) AND ledger_book_id IS NULL
       AND status='active' AND effective_from<=${input.asOfDate}::date
       AND (effective_to IS NULL OR effective_to>=${input.asOfDate}::date)
  `.execute(db);
  const overridden=new Set(overrideRows.map(row=>row.company_code_id));

  return {
    tenant,
    asOfDate:input.asOfDate,
    setupStatus:activeDefaultPolicy
      ? {state:"complete",complete:true,reasonCode:"FX_TENANT_DEFAULT_CONFIGURED"}
      : scheduledDefaultPolicies.length
        ? {state:"scheduled",complete:false,reasonCode:"FX_TENANT_DEFAULT_SCHEDULED"}
        : {state:"not_started",complete:false,reasonCode:"FX_TENANT_DEFAULT_MISSING"},
    activeDefaultPolicy,
    scheduledDefaultPolicies,
    rateSummary:{
      activeRateCount:rateRows[0]?.active_count??0,
      latestEffectiveDate:rateRows[0]?.latest_effective_date??null,
      attentionCount:attention.length,
      requirementCount:distinctRequirements.length,
      requirements:distinctRequirements,
      affectsSetupCompletion:false,
    },
    companyUsage:{
      activeCompanyCount:companyRows.length,
      usingTenantDefaultCount:companyRows.length-overridden.size,
      companyOverrideCount:overridden.size,
      noForeignExposureCount:companyHealth.filter(item=>!item.exposure.hasForeignCurrencyExposure).length,
    },
    permissions:input.permissions,
    computedAt,
  };
}
