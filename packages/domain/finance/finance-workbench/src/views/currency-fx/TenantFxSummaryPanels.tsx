"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CircleAlert,
  FilePlus2,
  Gauge,
  Upload,
} from "lucide-react";
import { Button } from "@athyper/ui/primitives";
import type { TenantCurrencyFxSummary } from "../../hooks/useCurrencyFxSetup";

export function TenantFxSummaryPanels({summary}:{summary:TenantCurrencyFxSummary}) {
  const rates=summary.rateSummary;
  const usage=summary.companyUsage;
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-xl border bg-card">
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div>
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="font-semibold">Exchange-rate health</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Operational coverage, kept separate from tenant setup completion.</p>
          </div>
          {rates.attentionCount ? (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700">
              {rates.attentionCount} need attention
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700">Healthy</span>
          )}
        </div>
        <div className="grid grid-cols-3 divide-x border-b">
          <Metric label="Active rates" value={rates.activeRateCount}/>
          <Metric label="Required combinations" value={rates.requirementCount}/>
          <Metric label="Unresolved" value={rates.attentionCount}/>
        </div>
        <div className="p-5">
          <p className="text-sm">
            Latest effective date{" "}
            <span className="font-medium">{rates.latestEffectiveDate??"No active rates"}</span>
          </p>
          {rates.attentionCount ? (
            <div className="mt-3 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              <p>
                Missing or stale rates may block operations according to policy. They do not make this one-time setup incomplete.
              </p>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={summary.navigation.rateListHref}>Manage exchange rates <ArrowRight className="ml-2 h-4 w-4" aria-hidden /></Link>
            </Button>
            {summary.permissions.addRate.allowed ? (
              <Button asChild variant="outline">
                <Link href={summary.navigation.rateAddHref}><FilePlus2 className="mr-2 h-4 w-4" aria-hidden />Add rate</Link>
              </Button>
            ) : (
              <Button variant="outline" disabled title={summary.permissions.addRate.reasonCode??undefined}>
                <FilePlus2 className="mr-2 h-4 w-4" aria-hidden />Add rate
              </Button>
            )}
            {summary.permissions.importRates.allowed ? (
              <Button asChild>
                <Link href={summary.navigation.rateImportHref}><Upload className="mr-2 h-4 w-4" aria-hidden />Import rates</Link>
              </Button>
            ) : (
              <Button disabled title={summary.permissions.importRates.reasonCode??undefined}>
                <Upload className="mr-2 h-4 w-4" aria-hidden />Import rates
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b p-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="font-semibold">Company usage</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">How active Companies consume the tenant currency policy.</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y md:grid-cols-4 md:divide-y-0">
          <Metric label="Active Companies" value={usage.activeCompanyCount}/>
          <Metric label="Using tenant default" value={usage.usingTenantDefaultCount}/>
          <Metric label="Company overrides" value={usage.companyOverrideCount}/>
          <Metric label="No FX exposure" value={usage.noForeignExposureCount}/>
        </div>
        <div className="border-t p-5 text-sm text-muted-foreground">
          Company overrides remain deliberate exceptions. Book-level policy details are available from each Company’s Advanced FX settings.
        </div>
      </section>
    </div>
  );
}

function Metric({label,value}:{label:string;value:number}) {
  return (
    <div className="p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{label}</p>
    </div>
  );
}
