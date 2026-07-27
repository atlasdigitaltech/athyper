"use client";

import Link from "next/link";
import { Building2, RefreshCw } from "lucide-react";
import { Button, Skeleton } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import { cn } from "@athyper/theme/utils";
import { useCompanyHub } from "../../hooks/useCompanyHub";
import { useFinanceSetupConflicts } from "../../hooks/useFinanceSetupConflicts";
import { ReadinessJourney } from "./ReadinessJourney";
import { CertificationReadinessPanel } from "./CertificationReadinessPanel";
import { NeedsAttentionInbox } from "./NeedsAttentionInbox";
import { WorkspaceCards } from "./WorkspaceCards";

/**
 * Temporary rollback surface for finance.settings_directory=false.
 * It intentionally retains the former readiness-heavy Company Hub and its
 * existing read models. No mutation or data contract differs between branches.
 */
export function LegacyCompanyHubView({ companyCode }: { companyCode: string }) {
  const hub = useCompanyHub({ companyCode });
  const conflicts = useFinanceSetupConflicts({
    scopeType: "company",
    scopeCode: companyCode,
  });

  if (hub.isLoading && !hub.data) {
    return (
      <PageFrame>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </PageFrame>
    );
  }
  if (!hub.data) {
    return (
      <PageFrame>
        <div className="rounded-xl border bg-card p-8 text-center">
          <h1 className="font-semibold">Legacy Finance Company Hub unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">{String(hub.error ?? companyCode)}</p>
          <Button className="mt-4" onClick={() => hub.refetch()}>Retry</Button>
        </div>
      </PageFrame>
    );
  }

  const data = hub.data;
  return (
    <PageFrame>
      <main className="flex flex-col gap-5 pb-10">
        <header className="rounded-xl border bg-card p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <Building2 className="mt-1 h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Finance Setup</p>
                <h1 className="text-xl font-semibold">{data.companyName} ({data.companyCode})</h1>
                <p className="text-sm text-muted-foreground">
                  {data.currentBookLabel} · FY{data.currentFiscalYear} · P{data.currentPeriodNumber}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                data.governanceReadiness.certified
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-900",
              )}>
                {data.governanceReadiness.certified
                  ? "Posting readiness certified"
                  : `${data.governanceReadiness.completedMandatoryTaskCount}/${data.governanceReadiness.mandatoryTaskCount} readiness checks`}
              </span>
              <Button variant="ghost" size="sm" onClick={() => hub.refetch()}>
                <RefreshCw className={cn("h-4 w-4", hub.isFetching && "animate-spin")} />
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/finance/setup">Change company</Link>
              </Button>
            </div>
          </div>
        </header>

        <ReadinessJourney steps={data.journey} />
        <CertificationReadinessPanel companyCode={companyCode} />
        <NeedsAttentionInbox
          conflicts={conflicts.data ?? data.inbox}
          totalCount={(conflicts.data ?? data.inbox).length}
          showAllHref={`/workbench/finance/readiness?scopeId=${encodeURIComponent(companyCode)}`}
        />
        <WorkspaceCards companyCode={companyCode} counts={data.workspaceCounts} />
      </main>
    </PageFrame>
  );
}
