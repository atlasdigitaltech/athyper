"use client";

import { useState } from "react";
import Link from "next/link";
import { History, Settings2 } from "lucide-react";
import { Button } from "@athyper/platform-ui/primitives";
import type { CurrencyFxSetupPayload, FxPolicy } from "../../hooks/useCurrencyFxSetup";
import { FxPolicyOverrideDialog } from "./FxPolicyOverrideDialog";

export function CompanyFxPolicySummary({data}:{data:CurrencyFxSetupPayload}) {
  const [dialogOpen,setDialogOpen]=useState(false);
  const effective=data.policy.effective;
  const override=data.policy.companyOverride;
  const canConfigure=data.permissions.configure.allowed&&Boolean(data.policy.tenantDefault);
  const source=policySourceText(data);

  return (
    <section id="fx-policy" className="scroll-mt-24 rounded-xl border bg-card" aria-labelledby="company-policy-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div>
          <h2 id="company-policy-title" className="font-semibold">Policy</h2>
          <p className="mt-1 text-sm text-muted-foreground">Exchange-rate selection and fallback behavior.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/finance/setup/tenant/${encodeURIComponent(data.company.tenantCode)}/currency-fx`}>View tenant settings</Link>
          </Button>
          {override?(
            <Button asChild size="sm" variant="ghost">
              <Link href={`/app/fx_policy/${encodeURIComponent(override.id)}`}><History className="mr-1.5 h-4 w-4"/>View current version</Link>
            </Button>
          ):null}
          {canConfigure&&effective ? (
            <Button size="sm" variant="outline" onClick={()=>setDialogOpen(true)}>
              <Settings2 className="mr-1.5 h-4 w-4"/>
              {override?"Edit Company override":"Create Company override"}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="border-b bg-muted/15 px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Policy source</p>
        <p className="mt-1 text-sm">{source}</p>
      </div>
      {effective?<PolicyValues policy={effective}/>:<div className="p-5 text-sm text-muted-foreground">No effective policy is available for {data.asOfDate}.</div>}
      {effective?(
        <FxPolicyOverrideDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          companyCode={data.company.code}
          scope="company"
          source={override??effective}
          override={override}
        />
      ):null}
    </section>
  );
}

function policySourceText(data:CurrencyFxSetupPayload):string {
  const state=data.policy.inheritanceState;
  if(state==="inherited")return `This company uses the ${data.company.tenantName} tenant policy.`;
  if(state==="company_override"){
    const version=data.policy.companyOverride?.versionNo;
    return `This company uses its own policy${version?` version ${version}`:""}.`;
  }
  if(state==="book_override")return "A ledger-book policy applies when that book is selected.";
  return "No tenant policy is effective for the selected date. Open tenant settings to create or schedule one.";
}

function PolicyValues({policy}:{policy:FxPolicy}) {
  return (
    <dl className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
      <Value label="Transaction rate" value={humanize(policy.defaultRateType)}/>
      <Value label="Month-end rate" value={humanize(policy.revaluationRateType)}/>
      <Value label="Maximum age" value={policy.maximumRateAgeDays==null?"No limit":`${policy.maximumRateAgeDays} day${policy.maximumRateAgeDays===1?"":"s"}`}/>
      <Value label="Preferred sources" value={policy.preferredSources.map(humanize).join(" → ")||"Any eligible source"}/>
      <Value label="Inverse rates" value={policy.allowInverse?"Allowed":"Not allowed"}/>
      <Value label="Triangulation" value={policy.allowTriangulation?`Via ${policy.pivotCurrencyCode}`:"Not allowed"}/>
      <Value label="Missing-rate behavior" value={humanize(policy.missingRateBehavior)}/>
      <Value label="Effective version" value={`v${policy.versionNo} · ${policy.effectiveFrom}`}/>
    </dl>
  );
}

function Value({label,value}:{label:string;value:string}){return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>}
function humanize(value:string):string{return value.replaceAll("_"," ").replace(/\b\w/g,character=>character.toUpperCase())}
