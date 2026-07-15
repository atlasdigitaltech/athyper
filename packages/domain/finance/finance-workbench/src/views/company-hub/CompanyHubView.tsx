"use client";

import { AlertTriangle, Building2, BookOpen, CalendarDays, RefreshCw } from "lucide-react";
import { Button, Skeleton } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import { cn } from "@athyper/theme/utils";
import { useCompanyHub } from "../../hooks/useCompanyHub";
import { useFinanceSetupConflicts } from "../../hooks/useFinanceSetupConflicts";
import { PostabilityChip } from "./PostabilityChip";
import { ReadinessJourney } from "./ReadinessJourney";
import { NeedsAttentionInbox } from "./NeedsAttentionInbox";
import { WorkspaceCards } from "./WorkspaceCards";

export interface CompanyHubViewProps {
  companyCode: string;
}

/**
 * Finance Setup Company Hub — top-level composition.
 *
 * Layout:
 *   Row 1: Header (company + LE + tenant chips + period postability)
 *   Row 2: Readiness Journey (5-step stepper)
 *   Row 3: Needs Attention Inbox (top-N conflicts)
 *   Row 4: Workspace Cards (Explore, Configure, Operate)
 *
 * All three data cards are surfaced via the same conflict source
 * (useFinanceSetupConflicts) so counts cannot drift.
 */
export function CompanyHubView({ companyCode }: CompanyHubViewProps) {
  const hubQuery = useCompanyHub({ companyCode });
  const conflictsQuery = useFinanceSetupConflicts({ scopeType: "company", scopeCode: companyCode });

  if (hubQuery.isLoading && !hubQuery.data) {
    return (
      <PageFrame>
        <HubSkeleton />
      </PageFrame>
    );
  }

  if (hubQuery.isError) {
    return (
      <PageFrame>
        <ErrorState message={String(hubQuery.error)} onRetry={() => hubQuery.refetch()} />
      </PageFrame>
    );
  }

  const hub = hubQuery.data;
  if (!hub) {
    return (
      <PageFrame>
        <ErrorState message={`No hub payload for ${companyCode}.`} onRetry={() => hubQuery.refetch()} />
      </PageFrame>
    );
  }

  const allConflicts = conflictsQuery.data ?? hub.inbox;
  const totalConflicts = allConflicts.length;

  return (
    <PageFrame>
      <div className="flex flex-col gap-6 pb-10">
        {/* Header */}
        <header className="flex flex-col gap-3 rounded-lg border bg-card p-5 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Finance Setup</span>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden />
              <h1 className="text-xl font-semibold">
                {hub.companyName}
                <span className="ml-2 text-sm font-normal text-muted-foreground">· {hub.companyCode}</span>
              </h1>
            </div>
            {(hub.legalEntityName || hub.tenantName) && (
              <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                {hub.legalEntityName && hub.legalEntityCode && (
                  <>
                    <span>Legal entity:</span>
                    <a
                      href={`/finance/setup/legal-entity/${encodeURIComponent(hub.legalEntityCode)}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {hub.legalEntityName}
                    </a>
                  </>
                )}
                {hub.legalEntityName && hub.tenantName && <span>·</span>}
                {hub.tenantName && hub.tenantCode && (
                  <>
                    <span>Tenant:</span>
                    <a
                      href={`/finance/setup/tenant/${encodeURIComponent(hub.tenantCode)}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {hub.tenantName}
                    </a>
                  </>
                )}
              </p>
            )}
          </div>

          <div className="flex flex-col items-start gap-2 md:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <BookOpen className="h-3 w-3" aria-hidden />
                Book: <span className="font-medium text-foreground">{hub.currentBookLabel}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarDays className="h-3 w-3" aria-hidden />
                FY{hub.currentFiscalYear} · P{String(hub.currentPeriodNumber).padStart(2, "0")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <PostabilityChip
                chip={hub.periodPostability.chip}
                reasonCode={hub.periodPostability.reasonCode}
                showReason
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => hubQuery.refetch()}
                aria-label="Refresh"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", hubQuery.isFetching && "animate-spin")} aria-hidden />
              </Button>
            </div>
          </div>
        </header>

        {/* Readiness Journey */}
        {hub.journey.length > 0 ? (
          <ReadinessJourney steps={hub.journey} />
        ) : (
          <EmptyJourneyBanner />
        )}

        {/* Needs Attention Inbox */}
        <NeedsAttentionInbox
          conflicts={hub.inbox}
          totalCount={totalConflicts}
          showAllHref={`/finance/setup/company/${encodeURIComponent(companyCode)}/operate`}
        />

        {/* Workspace Cards */}
        <WorkspaceCards
          companyCode={companyCode}
          counts={hub.workspaceCounts}
        />

        <footer className="text-right text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Last checked · {new Date(hub.computedAt).toLocaleString()}
        </footer>
      </div>
    </PageFrame>
  );
}

function HubSkeleton() {
  return (
    <div className="flex flex-col gap-6 pb-10">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-52 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
      <div>
        <h2 className="text-base font-semibold">Couldn't load Finance Setup</h2>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="secondary" onClick={onRetry}>Try again</Button>
    </div>
  );
}

function EmptyJourneyBanner() {
  return (
    <div className="rounded-lg border border-dashed bg-card p-6 text-sm text-muted-foreground">
      <p className="font-medium">No readiness data available yet.</p>
      <p className="mt-1">
        This usually means the company has no operating chart assigned or the current fiscal period is
        not yet configured. Contact your finance administrator to get started.
      </p>
    </div>
  );
}
