"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Building2, BookOpen, CalendarDays, CircleDollarSign, Coins, Landmark, ReceiptText, RefreshCw, ShieldCheck } from "lucide-react";
import { Button, Skeleton } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import { SurfaceHeader } from "@athyper/surface-kit";
import { setupDomainPath, setupScopePath } from "@athyper/runtime-contracts";
import { cn } from "@athyper/theme/utils";
import { useCompanyHub } from "../../hooks/useCompanyHub";
import { useFinanceSetupConflicts } from "../../hooks/useFinanceSetupConflicts";
import { useScopeOptions, type ScopeOptionsData } from "../../hooks/useScopeOptions";
import { PostabilityChip } from "./PostabilityChip";
import { ReadinessJourney } from "./ReadinessJourney";
import { NeedsAttentionInbox } from "./NeedsAttentionInbox";
import { WorkspaceCards } from "./WorkspaceCards";
import { resolveAccessibleCompany, resolveCompanyEntryMode } from "../../lib/company-selection";
import { CertificationReadinessPanel } from "./CertificationReadinessPanel";
import { FINANCE_SETUP_WORKSPACE } from "../../lib/finance-setup.workspace";

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
  const scopeOptions = useScopeOptions();

  const requestedCompany = resolveAccessibleCompany(scopeOptions.data?.companies ?? [], companyCode);
  if (scopeOptions.isLoading && !scopeOptions.data) {
    return <PageFrame><HubSkeleton /></PageFrame>;
  }

  if (!requestedCompany) {
    return (
      <CompanyScopeSelectionScreen
        scopeOptions={scopeOptions.data}
        message={`Company code ${companyCode} is not available in the active legal entity.`}
      />
    );
  }

  return <CompanyHubContent companyCode={requestedCompany.code} />;
}

function CompanyHubContent({ companyCode }: CompanyHubViewProps) {
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
        <SurfaceHeader
          kind="workspace"
          back={{ label: "Finance", href: "/finance" }}
          eyebrow="Finance Setup"
          leading={<Building2 className="h-5 w-5" aria-hidden />}
          title={`${hub.companyName} (${hub.companyCode})`}
          facts={[
            {
              key: "book",
              label: "Book:",
              value: hub.currentBookLabel,
              icon: <BookOpen className="h-3.5 w-3.5" />,
            },
            {
              key: "period",
              value: `FY${hub.currentFiscalYear} · P${String(hub.currentPeriodNumber).padStart(2, "0")}`,
              icon: <CalendarDays className="h-3.5 w-3.5" />,
            },
          ]}
          actions={(
            <>
              <PostabilityChip
                chip={hub.periodPostability.chip}
                reasonCode={hub.periodPostability.reasonCode}
                showReason
              />
              <span className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                hub.governanceReadiness.certified
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-900",
              )}>
                {hub.governanceReadiness.certified
                  ? "Posting readiness certified"
                  : `${hub.governanceReadiness.completedMandatoryTaskCount}/${hub.governanceReadiness.mandatoryTaskCount} readiness checks`}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => hubQuery.refetch()}
                aria-label="Refresh"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", hubQuery.isFetching && "animate-spin")} aria-hidden />
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href="/finance/setup">Change company</a>
              </Button>
            </>
          )}
          navigation={[
            {
              key: "overview",
              label: "Overview",
              href: companySetupOverviewHref(companyCode),
              active: true,
            },
            ...FINANCE_SETUP_WORKSPACE.domains.map((domain) => ({
              key: domain.code,
              label: domain.label,
              href: setupDomainPath(
                FINANCE_SETUP_WORKSPACE,
                { type: "company_code" as const, code: companyCode },
                domain,
              ),
            })),
          ]}
          navigationLabel="Finance setup domains"
        />

        <SetupDomainChooser companyCode={companyCode} />

        {/* Readiness Journey */}
        {hub.journey.length > 0 ? (
          <ReadinessJourney steps={hub.journey} />
        ) : (
          <EmptyJourneyBanner />
        )}

        <div id="certification-readiness" className="scroll-mt-6">
          <CertificationReadinessPanel companyCode={companyCode} />
        </div>

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

        <section className="rounded-xl border bg-card p-4" aria-label="Finance governance workbenches">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Governed finance operations</h2>
            <p className="text-xs text-muted-foreground">Period-0 migration, setup certification, and recurring close cycles.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <a href={`/finance/setup/company/${encodeURIComponent(companyCode)}/currency-fx`}>Currency &amp; FX</a>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <a href={`/finance/setup/company/${encodeURIComponent(companyCode)}/tax`}>Tax</a>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <a href={`/finance/setup/company/${encodeURIComponent(companyCode)}/payments`}>Payments &amp; Settlement</a>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <a href={`/finance/setup/company/${encodeURIComponent(companyCode)}/banking`}>Banking &amp; Treasury</a>
            </Button>
            {[
              ["Opening balances", "opening-balances", 0],
              ["Setup readiness", "readiness", hub.currentPeriodNumber],
              ["Monthly close", "monthly-close", hub.currentPeriodNumber],
              ["Annual close", "annual-close", hub.currentPeriodNumber],
            ].map(([label, path, period]) => (
              <Button key={String(path)} asChild variant="secondary" size="sm">
                <a href={`/workbench/finance/${path}?scopeId=${encodeURIComponent(companyCode)}&fiscalYear=${hub.currentFiscalYear}&period=${period}`}>
                  {label}
                </a>
              </Button>
            ))}
          </div>
        </section>

        <footer className="text-right text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Last checked · {new Date(hub.computedAt).toLocaleString()}
        </footer>
      </div>
    </PageFrame>
  );
}

/** Entry surface for /finance/setup. Session tenant/legal entity are fixed;
 * company code is confirmed before the setup workspace is loaded. */
export function FinanceSetupCompanyEntry() {
  const scopeOptions = useScopeOptions();
  const companies = scopeOptions.data?.companies ?? [];

  if (scopeOptions.isLoading) {
    return <PageFrame><HubSkeleton /></PageFrame>;
  }

  if (scopeOptions.isError) {
    return (
      <PageFrame>
        <ErrorState message={String(scopeOptions.error)} onRetry={() => scopeOptions.refetch()} />
      </PageFrame>
    );
  }

  if (companies.length === 0) {
    return (
      <PageFrame>
        <div className="rounded-lg border bg-card p-10 text-center">
          <Building2 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <h1 className="mt-3 text-base font-semibold">No company available</h1>
          <p className="mt-1 text-sm text-muted-foreground">You do not have access to a finance-enabled company code.</p>
        </div>
      </PageFrame>
    );
  }

  const entryMode = resolveCompanyEntryMode(companies, scopeOptions.data?.defaultCompanyCode);
  if (entryMode.kind === "redirect") {
    return <SingleCompanyRedirect companyCode={entryMode.companyCode} />;
  }

  return <CompanyScopeSelectionScreen scopeOptions={scopeOptions.data} />;
}

function SingleCompanyRedirect({ companyCode }: { companyCode: string }) {
  useEffect(() => {
    window.location.replace(companySetupOverviewHref(companyCode));
  }, [companyCode]);
  return <PageFrame><HubSkeleton /></PageFrame>;
}

function CompanyScopeSelectionScreen({ scopeOptions, message }: {
  scopeOptions?: ScopeOptionsData;
  message?: string;
}) {
  const companies = scopeOptions?.companies ?? [];
  const entryMode = resolveCompanyEntryMode(companies, scopeOptions?.defaultCompanyCode);
  const [companyCode, setCompanyCode] = useState(
    entryMode.kind === "select" ? entryMode.initialCompanyCode : companies[0]?.code ?? "",
  );
  return (
    <PageFrame>
      <main className="mx-auto w-full py-8" style={{ maxWidth: "480px" }}>
        <header className="mb-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Finance Setup</span>
          <h1 className="mt-1 text-xl font-semibold">Select setup company</h1>
        </header>

        <form
          className="rounded-xl border bg-card p-6 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if (companyCode) window.location.assign(companySetupOverviewHref(companyCode));
          }}
        >
          {message && (
            <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {message}
            </div>
          )}
          <div className="grid gap-5">
            <ContextField label="Tenant" value={scopeOptions?.tenantName ?? scopeOptions?.tenantCode ?? "Current tenant"} />
            <ContextField label="Legal Entity" value={scopeOptions?.activeLegalEntityName ?? scopeOptions?.activeLegalEntityCode ?? "Current legal entity"} />
            <label className="grid gap-1.5 sm:grid-cols-[150px_1fr] sm:items-center">
              <span className="text-sm font-medium">Company Code <span className="text-destructive">*</span></span>
              <select
                value={companyCode}
                onChange={(event) => setCompanyCode(event.target.value)}
                required
                className="h-11 rounded-md border bg-background px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {companies.map((company) => (
                  <option key={company.code} value={company.code}>{company.name} ({company.code})</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-7 flex items-center justify-end border-t pt-5">
            <Button type="submit" disabled={!companyCode}>Open setup overview</Button>
          </div>
        </form>
      </main>
    </PageFrame>
  );
}

function companySetupOverviewHref(companyCode: string): string {
  return setupScopePath(FINANCE_SETUP_WORKSPACE, { type: "company_code", code: companyCode });
}

const setupDomainIcons = {
  building: Building2,
  coins: Coins,
  "receipt-text": ReceiptText,
  "circle-dollar": CircleDollarSign,
  landmark: Landmark,
  "shield-check": ShieldCheck,
} as const;

function SetupDomainChooser({ companyCode }: { companyCode: string }) {
  const scope = { type: "company_code" as const, code: companyCode };
  return (
    <section aria-labelledby="setup-domain-heading">
      <div className="mb-3">
        <h2 id="setup-domain-heading" className="text-sm font-semibold">Choose a setup domain</h2>
        <p className="mt-1 text-xs text-muted-foreground">Start with Foundation or continue directly to the area you need.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {FINANCE_SETUP_WORKSPACE.domains.map((domain) => {
          const Icon = setupDomainIcons[domain.iconKey];
          return (
            <Link
              key={domain.code}
              href={setupDomainPath(FINANCE_SETUP_WORKSPACE, scope, domain)}
              className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
            >
              <span className="rounded-lg bg-muted p-2.5 text-muted-foreground"><Icon className="h-4 w-4" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{domain.label}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{domain.description}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ContextField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[150px_1fr] sm:items-center">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex h-11 items-center rounded-md border bg-muted/35 px-3 text-sm text-muted-foreground" aria-readonly="true">
        {value}
      </div>
    </div>
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
