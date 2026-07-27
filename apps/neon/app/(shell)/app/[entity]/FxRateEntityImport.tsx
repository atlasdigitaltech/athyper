"use client";

import {
  GovernedEntityImport,
  type GovernedImportResult,
  type GovernedImportValidation,
} from "@athyper/runtime-list";

const columns=[
  {key:"fromCurrency",label:"From currency",required:true},
  {key:"toCurrency",label:"To currency",required:true},
  {key:"rate",label:"Rate",required:true},
  {key:"rateType",label:"Rate type",required:true},
  {key:"effectiveDate",label:"Effective date",required:true},
  {key:"effectiveTime",label:"Effective time"},
  {key:"source",label:"Source",required:true},
  {key:"sourceReference",label:"Source reference"},
];
const sample=`fromCurrency,toCurrency,rate,rateType,effectiveDate,effectiveTime,source,sourceReference
USD,MYR,4.7200000000,SPOT,2026-07-20,09:00,CENTRAL_BANK,BNM-20260720`;

export function FxRateEntityImport({tenantCode}:{tenantCode:string}) {
  const request=async<T,>(
    suffix:string,
    rows:Record<string,unknown>[],
    mode:"create"|"replace_by_natural_key",
  ):Promise<T>=>{
    const response=await fetch(
      `/api/finance/setup/tenant/${encodeURIComponent(tenantCode)}/fx/rates/imports${suffix}`,
      {
        method:"POST",
        credentials:"include",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({rows,mode}),
      },
    );
    const result=await response.json().catch(()=>({})) as Record<string,unknown>;
    if(!response.ok)throw new Error(typeof result["message"]==="string"?result["message"]:`FX rate import failed (${response.status}).`);
    return result as T;
  };
  return (
    <GovernedEntityImport
      entityLabel="FX rates"
      columns={columns}
      backHref="/app/fx_rate"
      sampleText={sample}
      validateRows={(rows,mode)=>request<GovernedImportValidation>("/validate",rows,mode)}
      commitRows={(rows,mode)=>request<GovernedImportResult>("",rows,mode)}
    />
  );
}
