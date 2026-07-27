"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface FxPolicy { id:string; companyCodeId:string|null; ledgerBookId:string|null; transactionContext:string; effectiveFrom:string; effectiveTo:string|null; priority:number; defaultRateType:string; revaluationRateType:string; pivotCurrencyCode:string|null; allowInverse:boolean; allowTriangulation:boolean; preferredSources:string[]; maximumRateAgeDays:number|null; missingRateBehavior:string; manualOverrideAllowed:boolean; manualOverrideApprovalRequired:boolean; autoReverseRevaluation:boolean; status:string; versionNo:number; }
export interface FxSelectedRate { rate:number; path:string[]; source:string; rateIds:string[]; effectiveDate:string; method:string; }
export interface FxResolutionTrace {
  request:{
    fromCurrency:string;
    toCurrency:string;
    rateType:string;
    asOfDate:string;
    transactionContext?:string;
    ledgerBookId?:string|null;
    purpose?:"transaction"|"revaluation";
  };
  policyResolution:{selected:FxPolicy|null;candidates:Array<{policy:FxPolicy;specificity:number;selected:boolean;reason:string}>};
  selected:FxSelectedRate|null;
  attempts:Array<{method:string;pair:string;accepted:boolean;reason:string;rateId?:string}>;
  outcome?:{code:string;blocksOperation:boolean;message?:string};
  runtimeDirectives?:Record<string,unknown>;
}
export interface CompanyFxExposureSource {
  sourceType:"ledger_book"|"bank_account"|"payment_policy"|"settlement_rule";
  sourceId:string;
  currencyCode:string;
  purpose:"transaction"|"revaluation";
  bookId:string|null;
  bookCode:string|null;
  detail:Record<string,unknown>;
}
export interface CompanyFxPostingCell {
  bookId:string;
  bookCode:string;
  required:boolean;
  requiredBy:string[];
  status:"resolved"|"missing"|"invalid"|"not_required";
  reasonCode:string;
  mappingId:string|null;
  glAccountId:string|null;
  glAccountCode:string|null;
  glAccountName:string|null;
  priority:number|null;
  versionNo:number|null;
  effectiveFrom:string|null;
  effectiveTo:string|null;
}
export interface CompanyFxPostingRow {
  roleCode:string;
  roleName:string;
  description:string|null;
  domain:string;
  normalBalance:string;
  mandatoryForReadiness:boolean;
  cells:CompanyFxPostingCell[];
}
export interface CompanyFxRateRequirement extends TenantFxRateRequirement {
  bookId:string|null;
  bookCode:string|null;
  exposureSources:CompanyFxExposureSource[];
  blocksOperation:boolean;
  manualOverride:{allowed:boolean;approvalRequired:boolean};
  selectedRate:Record<string,unknown>|null;
}
export interface CompanyFxCompany {
  id:string;
  code:string;
  name:string;
  functionalCurrency:string;
  legalEntity:{id:string;code:string;name:string};
  tenantCode:string;
  tenantName:string;
}
export interface FxNavigation {
  mode:"entity"|"legacy";
  flagCode:"finance.fx_entity_navigation";
  tenantSettingsHref:string;
  rateListHref:string;
  rateAddHref:string;
  rateImportHref:string;
  rollbackRequiresDataChange:false;
}
export interface CurrencyFxSetupPayload {
  company:CompanyFxCompany;
  asOfDate:string;
  exposure:{
    company:CompanyFxCompany;
    asOfDate:string;
    hasForeignCurrencyExposure:boolean;
    currencies:Array<{currencyCode:string;purposes:Array<"transaction"|"revaluation">;sourceCount:number}>;
    sources:CompanyFxExposureSource[];
  };
  policy:{
    tenantDefault:FxPolicy|null;
    companyOverride:FxPolicy|null;
    effective:FxPolicy|null;
    effectiveScope:"tenant"|"company"|"book"|null;
    inheritanceState:"tenant_missing"|"inherited"|"company_override"|"book_override";
    bookOverrides:FxPolicy[];
    availableBooks:Array<{bookId:string;bookCode:string;bookName:string;isPrimary:boolean}>;
    bookOverridesHidden:boolean;
    resolutionCandidates:FxResolutionTrace["policyResolution"]["candidates"];
    runtimeFieldStatus:Record<string,{enabled:boolean;enforcedBy:string|null;reasonCode?:string}>;
  };
  postingAccounts:{
    requiredRoleCodes:string[];
    books:Array<{bookId:string;bookCode:string;bookName:string;isPrimary:boolean}>;
    rows:CompanyFxPostingRow[];
    accounts:Array<{glAccountId:string;accountCode:string;accountName:string;accountClass:string;normalBalance:string}>;
    summary:{requiredCells:number;resolvedCells:number;missingCells:number;invalidCells:number};
    ready:boolean;
  };
  rateRequirements:CompanyFxRateRequirement[];
  setupStatus:{state:"not_required"|"incomplete"|"complete";complete:boolean;reasonCode:string};
  pageState:{
    state:"no_exposure"|"tenant_missing"|"effective_policy_missing"|"posting_accounts_missing"|"ready";
    complete:boolean;
    reasonCode:string;
    primaryAction:"none"|"configure_tenant_defaults"|"review_effective_policy"|"assign_posting_accounts";
  };
  operationalHealth:{
    state:"healthy"|"attention"|"not_applicable";
    attentionCount:number;
    healthyCount:number;
    totalCount:number;
    affectsSetupCompletion:false;
  };
  permissions:TenantFxPermissions;
  navigation:FxNavigation;
  computedAt:string;
}
export interface FxRateRow {id:string;fromCurrency:string;toCurrency:string;rate:string;rateType:string;effectiveDate:string;effectiveTime:string|null;source:string;sourceReference:string|null;status:string;}
export interface FxImportValidation {rows:Array<{rowNumber:number;valid:boolean;errors:string[];warnings:string[];normalized:Record<string,unknown>}>;summary:{total:number;valid:number;invalid:number;warnings:number};}
export interface FxCapability { allowed:boolean; permission:string; reasonCode:string|null; }
export interface TenantFxPermissions {
  view:FxCapability;
  configure:FxCapability;
  advancedConfigure:FxCapability;
  addRate:FxCapability;
  replaceRate:FxCapability;
  importRates:FxCapability;
  exportRates:FxCapability;
}
export interface TenantFxRateRequirement {
  requirementKey:string;
  fromCurrency:string;
  toCurrency:string;
  rateType:string;
  purpose:"transaction"|"revaluation";
  requiredAsOfDate:string;
  observedAt:string;
  state:"healthy"|"missing"|"stale"|"manual_override_required"|"fallback_exhausted";
  reasonCode:string;
  impactedCompanyCodes:string[];
}
export interface TenantCurrencyFxSummary {
  tenant:{id:string;code:string;name:string};
  asOfDate:string;
  setupStatus:{state:"not_started"|"scheduled"|"complete";complete:boolean;reasonCode:string};
  activeDefaultPolicy:FxPolicy|null;
  scheduledDefaultPolicies:FxPolicy[];
  rateSummary:{
    activeRateCount:number;
    latestEffectiveDate:string|null;
    attentionCount:number;
    requirementCount:number;
    requirements:TenantFxRateRequirement[];
    affectsSetupCompletion:false;
  };
  companyUsage:{
    activeCompanyCount:number;
    usingTenantDefaultCount:number;
    companyOverrideCount:number;
    noForeignExposureCount:number;
  };
  permissions:TenantFxPermissions;
  navigation:FxNavigation;
  computedAt:string;
}
export interface SaveTenantFxPolicyInput {
  policyId?:string;
  expectedVersionNo?:number;
  policy:Record<string,unknown>;
}
export interface SaveCompanyFxOverrideInput {
  policyId?:string;
  expectedVersionNo?:number;
  policy:Record<string,unknown>;
}
export interface SaveBookFxOverrideInput extends SaveCompanyFxOverrideInput {
  ledgerBookId:string;
}
export interface FxResolutionTraceInput {
  fromCurrency:string;
  toCurrency:string;
  rateType:string;
  asOfDate?:string;
  transactionContext?:string;
  ledgerBookId?:string;
  purpose?:"transaction"|"revaluation";
}

async function json<T>(url:string,init?:RequestInit):Promise<T>{const response=await fetch(url,{credentials:"include",cache:"no-store",...init,headers:{"content-type":"application/json",...init?.headers}});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.message??`${response.status} ${response.statusText}`);}return response.json() as Promise<T>;}
export function useTenantCurrencyFxSummary(tenantCode:string,asOfDate?:string){
  const query=asOfDate?`?asOfDate=${encodeURIComponent(asOfDate)}`:"";
  return useQuery({
    queryKey:["finance","setup","fx","tenant",tenantCode,asOfDate??"today"],
    queryFn:()=>json<TenantCurrencyFxSummary>(`/api/finance/setup/tenant/${encodeURIComponent(tenantCode)}/fx${query}`),
    enabled:Boolean(tenantCode),
    staleTime:30_000,
  });
}
export function useSaveTenantFxPolicy(tenantCode:string){
  const qc=useQueryClient();
  return useMutation({
    mutationFn:({policyId,expectedVersionNo,policy}:SaveTenantFxPolicyInput)=>{
      const base=`/api/finance/setup/tenant/${encodeURIComponent(tenantCode)}/fx/policies`;
      const url=policyId?`${base}/${encodeURIComponent(policyId)}/replace`:base;
      return json(url,{method:"POST",body:JSON.stringify({
        ...policy,
        ...(policyId?{expectedVersionNo}:{}),
      })});
    },
    onSuccess:()=>qc.invalidateQueries({queryKey:["finance","setup","fx","tenant",tenantCode]}),
  });
}
export function useCurrencyFxSetup(companyCode:string){return useQuery({queryKey:["finance","setup","fx",companyCode],queryFn:()=>json<CurrencyFxSetupPayload>(`/api/finance/setup/company/${encodeURIComponent(companyCode)}/fx`),enabled:Boolean(companyCode),staleTime:30_000});}
export function useFxResolutionTrace(companyCode:string,input:FxResolutionTraceInput,enabled:boolean){
  const qs=new URLSearchParams();
  for(const [key,value] of Object.entries(input))if(value)qs.set(key,String(value));
  return useQuery({
    queryKey:["finance","setup","fx","trace",companyCode,input],
    queryFn:()=>json<FxResolutionTrace>(`/api/finance/setup/company/${encodeURIComponent(companyCode)}/fx/resolution-trace?${qs}`),
    enabled:enabled&&Boolean(companyCode)&&Boolean(input.fromCurrency)&&Boolean(input.toCurrency),
  });
}
export function useSaveCompanyFxOverride(companyCode:string){
  const qc=useQueryClient();
  return useMutation({
    mutationFn:({policyId,expectedVersionNo,policy}:SaveCompanyFxOverrideInput)=>{
      const base=`/api/finance/setup/company/${encodeURIComponent(companyCode)}/fx/overrides`;
      const path=policyId?`${base}/${encodeURIComponent(policyId)}/replace`:base;
      return json(path,{method:"POST",body:JSON.stringify({...policy,...(policyId?{expectedVersionNo}:{})})});
    },
    onSuccess:()=>qc.invalidateQueries({queryKey:["finance","setup","fx",companyCode]}),
  });
}
export function useEndCompanyFxOverride(companyCode:string){
  const qc=useQueryClient();
  return useMutation({
    mutationFn:({policyId,expectedVersionNo,endDate}:{policyId:string;expectedVersionNo:number;endDate?:string})=>
      json(`/api/finance/setup/company/${encodeURIComponent(companyCode)}/fx/overrides/${encodeURIComponent(policyId)}/end`,{
        method:"POST",
        body:JSON.stringify({expectedVersionNo,...(endDate?{endDate}:{})}),
      }),
    onSuccess:()=>qc.invalidateQueries({queryKey:["finance","setup","fx",companyCode]}),
  });
}
export function useSaveBookFxOverride(companyCode:string){
  const qc=useQueryClient();
  return useMutation({
    mutationFn:({ledgerBookId,policyId,expectedVersionNo,policy}:SaveBookFxOverrideInput)=>{
      const base=`/api/finance/setup/company/${encodeURIComponent(companyCode)}/fx/book-overrides`;
      const path=policyId?`${base}/${encodeURIComponent(policyId)}/replace`:base;
      return json(path,{
        method:"POST",
        body:JSON.stringify({...policy,ledgerBookId,...(policyId?{expectedVersionNo}:{})}),
      });
    },
    onSuccess:()=>qc.invalidateQueries({queryKey:["finance","setup","fx",companyCode]}),
  });
}
export function useEndBookFxOverride(companyCode:string){
  const qc=useQueryClient();
  return useMutation({
    mutationFn:({
      ledgerBookId,policyId,expectedVersionNo,endDate,
    }:{
      ledgerBookId:string;
      policyId:string;
      expectedVersionNo:number;
      endDate?:string;
    })=>json(`/api/finance/setup/company/${encodeURIComponent(companyCode)}/fx/book-overrides/${encodeURIComponent(policyId)}/end`,{
      method:"POST",
      body:JSON.stringify({ledgerBookId,expectedVersionNo,...(endDate?{endDate}:{})}),
    }),
    onSuccess:()=>qc.invalidateQueries({queryKey:["finance","setup","fx",companyCode]}),
  });
}
/** @deprecated Use useSaveCompanyFxOverride so replacements carry their expected version. */
export function useSaveFxPolicy(companyCode:string){
  const command=useSaveCompanyFxOverride(companyCode);
  return {
    ...command,
    mutate:(policy:Record<string,unknown>)=>command.mutate({policy}),
    mutateAsync:(policy:Record<string,unknown>)=>command.mutateAsync({policy}),
  };
}
export function useFxRates(tenantCode:string){return useQuery({queryKey:["finance","setup","fx","rates",tenantCode],queryFn:()=>json<{rates:FxRateRow[]}>(`/api/finance/setup/tenant/${encodeURIComponent(tenantCode)}/fx/rates`),enabled:Boolean(tenantCode)});}
export function useValidateFxImport(tenantCode:string){return useMutation({mutationFn:(rows:Record<string,unknown>[])=>json<FxImportValidation>(`/api/finance/setup/tenant/${encodeURIComponent(tenantCode)}/fx/rates/validate-import`,{method:"POST",body:JSON.stringify({rows})})});}
export function useImportFxRates(tenantCode:string){const qc=useQueryClient();return useMutation({mutationFn:(rows:Record<string,unknown>[])=>json(`/api/finance/setup/tenant/${encodeURIComponent(tenantCode)}/fx/rates/import`,{method:"POST",body:JSON.stringify({rows})}),onSuccess:()=>qc.invalidateQueries({queryKey:["finance","setup","fx","rates",tenantCode]})});}
