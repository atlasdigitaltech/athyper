"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button, Skeleton } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import { useCurrencyFxSetup } from "../../hooks/useCurrencyFxSetup";
import { CompanyFxAdvancedAdministration } from "./CompanyFxAdvancedAdministration";
import { CompanyFxPolicySummary } from "./CompanyFxPolicySummary";
import { CompanyFxPostingAccounts } from "./CompanyFxPostingAccounts";
import { FxRateSettingsSection } from "./FxRateSettingsSection";

export function CompanyCurrencyFxSettingsPage({companyCode}:{companyCode:string}) {
  const summary=useCurrencyFxSetup(companyCode);
  if(summary.isLoading)return <PageFrame><Skeleton className="h-[720px] rounded-xl"/></PageFrame>;
  if(!summary.data){
    return (
      <PageFrame>
        <div className="rounded-xl border bg-card p-8">
          <h1 className="font-semibold">Company Currency &amp; FX settings are unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">{summary.error?String(summary.error):"The Company settings could not be loaded."}</p>
          <Button className="mt-4" onClick={()=>summary.refetch()}>Retry</Button>
        </div>
      </PageFrame>
    );
  }
  const data=summary.data;
  return (
    <PageFrame>
      <div className="flex flex-col gap-5 pb-10">
        <header className="flex flex-col gap-3 rounded-xl border bg-card p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Finance Settings · Company Currency &amp; FX</p>
            <h1 className="mt-1 text-xl font-semibold">{data.company.name} ({data.company.code})</h1>
            <p className="text-sm text-muted-foreground">
              {data.company.legalEntity.name} · Functional currency {data.company.functionalCurrency}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={()=>summary.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>
            <Button asChild variant="ghost">
              <Link href={`/workbench/finance/readiness?scopeId=${encodeURIComponent(companyCode)}`}>Review configuration</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/finance/setup/company/${encodeURIComponent(companyCode)}`}>Company settings</Link>
            </Button>
          </div>
        </header>

        <CompanyFxPolicySummary data={data}/>
        <FxRateSettingsSection navigation={data.navigation} permissions={data.permissions}/>
        <CompanyFxPostingAccounts
          companyCode={data.company.code}
          asOfDate={data.asOfDate}
          postingAccounts={data.postingAccounts}
        />
        {data.permissions.advancedConfigure.allowed?<CompanyFxAdvancedAdministration data={data}/>:null}
      </div>
    </PageFrame>
  );
}
