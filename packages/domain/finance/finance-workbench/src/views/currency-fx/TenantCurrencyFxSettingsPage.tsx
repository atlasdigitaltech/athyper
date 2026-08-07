"use client";

import Link from "next/link";
import { History, RefreshCw } from "lucide-react";
import { Button, Skeleton } from "@athyper/platform-ui/primitives";
import { PageFrame } from "@athyper/platform-ui/layout";
import { useTenantCurrencyFxSummary } from "../../hooks/useCurrencyFxSetup";
import { FxRateSettingsSection } from "./FxRateSettingsSection";
import { TenantFxPolicyEditor } from "./TenantFxPolicyEditor";

export function TenantCurrencyFxSettingsPage({tenantCode}:{tenantCode:string}) {
  const summary=useTenantCurrencyFxSummary(tenantCode);
  if(summary.isLoading)return <PageFrame><Skeleton className="h-[680px] rounded-xl"/></PageFrame>;
  if(!summary.data){
    return (
      <PageFrame>
        <div className="rounded-xl border bg-card p-8">
          <h1 className="font-semibold">Currency &amp; FX settings are unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">{summary.error?String(summary.error):"The tenant settings could not be loaded."}</p>
          <Button className="mt-4" onClick={()=>summary.refetch()}>Retry</Button>
        </div>
      </PageFrame>
    );
  }

  const data=summary.data;
  const policyVersions=[
    ...(data.activeDefaultPolicy?[data.activeDefaultPolicy]:[]),
    ...data.scheduledDefaultPolicies,
  ];
  return (
    <PageFrame>
      <div className="flex flex-col gap-5 pb-10">
        <header className="flex flex-col gap-3 rounded-xl border bg-card p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Finance Settings · Tenant Currency &amp; FX</p>
            <h1 className="mt-1 text-xl font-semibold">{data.tenant.name} ({data.tenant.code})</h1>
            <p className="text-sm text-muted-foreground">
              Define the exchange-rate policy inherited by companies and manage governed rates.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={()=>summary.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />Refresh
            </Button>
            <Button asChild variant="outline">
              <Link href={`/finance/setup/tenant/${encodeURIComponent(tenantCode)}`}>
                Review configuration
              </Link>
            </Button>
          </div>
        </header>

        <TenantFxPolicyEditor tenantCode={tenantCode} summary={data}/>
        <FxRateSettingsSection navigation={data.navigation} permissions={data.permissions}/>

        {policyVersions.length>0 ? (
          <section className="rounded-xl border bg-card">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
              <div>
                <h2 className="font-semibold">Policy history</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Effective and future tenant policy versions.
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/app/fx_policy"><History className="mr-1.5 h-4 w-4"/>View all policy history</Link>
              </Button>
            </div>
            <div className="divide-y">
              {policyVersions.map(policy=>(
                <div key={policy.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium">Version {policy.versionNo} · effective from {policy.effectiveFrom}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {policy.defaultRateType} transactions · {policy.revaluationRateType} revaluation · {policy.preferredSources.join(" → ")}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/app/fx_policy/${encodeURIComponent(policy.id)}`}>View version</Link>
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </PageFrame>
  );
}
