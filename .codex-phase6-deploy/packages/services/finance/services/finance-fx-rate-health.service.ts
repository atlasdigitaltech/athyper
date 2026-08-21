import { sql, type Kysely } from "kysely";
import { resolveFxPolicy, traceFxResolution, type FxRateType } from "./finance-fx-policy.service.js";
import type { CompanyFxExposure } from "./finance-fx-exposure.service.js";
import type { FxExposureSource, FxRatePurpose, FxRateRequirement } from "./finance-fx-contracts.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export async function loadCompanyFxRateHealth(
  db:AnyDb,
  input:{tenantId:string;exposure:CompanyFxExposure;asOfDate:string;observedAt?:string},
):Promise<{requirements:FxRateRequirement[];summary:{state:"healthy"|"attention"|"not_applicable";attentionCount:number;healthyCount:number;totalCount:number}}> {
  const observedAt=input.observedAt??new Date().toISOString();
  if(!input.exposure.hasForeignCurrencyExposure){
    return {requirements:[],summary:{state:"not_applicable",attentionCount:0,healthyCount:0,totalCount:0}};
  }

  const {rows:periodRows}=await sql<{required_date:string|null}>`
    SELECT max(end_date)::text AS required_date
      FROM master.fiscal_period
     WHERE tenant_id=${input.tenantId}::uuid
       AND company_code_id=${input.exposure.company.id}::uuid
       AND period_type='normal'
       AND end_date<=${input.asOfDate}::date
  `.execute(db);
  const revaluationDate=periodRows[0]?.required_date??input.asOfDate;

  const groups=new Map<string,{currencyCode:string;purpose:FxRatePurpose;bookId:string|null;bookCode:string|null;sources:FxExposureSource[]}>();
  for(const source of input.exposure.sources){
    const key=[source.currencyCode,source.purpose,source.bookId??""].join("|");
    const group=groups.get(key)??{currencyCode:source.currencyCode,purpose:source.purpose,bookId:source.bookId,bookCode:source.bookCode,sources:[]};
    group.sources.push(source);
    groups.set(key,group);
  }

  const requirements=await Promise.all([...groups.values()].map(async group=>{
    const requiredAsOfDate=group.purpose==="revaluation"?revaluationDate:input.asOfDate;
    const context=group.purpose==="revaluation"?"revaluation":"general";
    const policyResolution=await resolveFxPolicy(db,{
      tenantId:input.tenantId,companyCodeId:input.exposure.company.id,ledgerBookId:group.bookId,
      transactionContext:context,asOfDate:requiredAsOfDate,
    });
    const policy=policyResolution.selected;
    const rateType=(group.purpose==="revaluation"
      ? policy?.revaluationRateType??"PERIOD_END"
      : policy?.defaultRateType??"SPOT") as FxRateType;
    const trace=await traceFxResolution(db,{
      tenantId:input.tenantId,companyCode:input.exposure.company.code,
      fromCurrency:group.currencyCode,toCurrency:input.exposure.company.functionalCurrency,
      rateType,asOfDate:requiredAsOfDate,transactionContext:context,ledgerBookId:group.bookId,purpose:group.purpose,
    });
    const stale=trace.attempts.some(attempt=>attempt.reasonCode==="FX_RATE_STALE");
    const state:FxRateRequirement["state"]=trace.selected
      ?"healthy"
      : stale
        ?"stale"
        : trace.outcome.code==="FX_MANUAL_OVERRIDE_REQUIRED"||trace.outcome.code==="FX_MANUAL_OVERRIDE_APPROVAL_REQUIRED"
          ?"manual_override_required"
          : trace.outcome.code==="FX_FALLBACK_EXHAUSTED"
            ?"fallback_exhausted"
            :"missing";
    const requirementKey=[
      group.currencyCode,input.exposure.company.functionalCurrency,rateType,group.purpose,requiredAsOfDate,
    ].join("|");
    return {
      requirementKey,fromCurrency:group.currencyCode,toCurrency:input.exposure.company.functionalCurrency,
      rateType,purpose:group.purpose,requiredAsOfDate,observedAt,bookId:group.bookId,bookCode:group.bookCode,
      exposureSources:group.sources,state,reasonCode:trace.outcome.code,blocksOperation:trace.outcome.blocksOperation,
      manualOverride:{allowed:trace.outcome.manualOverrideAllowed,approvalRequired:trace.outcome.manualOverrideApprovalRequired},
      selectedRate:trace.selected?{...trace.selected,policyId:trace.policyResolution.selected?.id??null}:null,
    } satisfies FxRateRequirement;
  }));
  requirements.sort((a,b)=>a.requirementKey.localeCompare(b.requirementKey));
  const healthyCount=requirements.filter(requirement=>requirement.state==="healthy").length;
  const attentionCount=requirements.length-healthyCount;
  return {
    requirements,
    summary:{state:attentionCount?"attention":"healthy",attentionCount,healthyCount,totalCount:requirements.length},
  };
}
