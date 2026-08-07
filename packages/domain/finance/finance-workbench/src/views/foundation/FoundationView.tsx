"use client";

import Link from "next/link";
import {
  ArrowUpRight, Building2, CircleAlert, Coins, RefreshCw,
} from "lucide-react";
import { Button, Skeleton } from "@athyper/platform-ui/primitives";
import { PageFrame } from "@athyper/platform-ui/layout";
import { SurfaceHeader } from "@athyper/platform-surface-kit";
import { BODY_SM, LABEL_SM } from "@athyper/platform-ui/typography";
import { cn } from "@athyper/platform-theme/utils";
import { setupDomainPath, setupScopePath } from "@athyper/runtime-contracts";
import { useCompanyFoundation } from "../../hooks/useCompanyFoundation";
import { useScopeOptions } from "../../hooks/useScopeOptions";
import { resolveAccessibleCompany } from "../../lib/company-selection";
import { FINANCE_SETUP_WORKSPACE } from "../../lib/finance-setup.workspace";
import type { CompanyFoundationPayload, FoundationDomainKey } from "../../lib/finance-setup.types";
import { AccountsFoundationPanel } from "./AccountsFoundationPanel";
import { BooksFoundationPanel } from "./BooksFoundationPanel";
import { FiscalCalendarDesigner } from "../configure/FiscalCalendarDesigner";

export interface FoundationViewProps {
  companyCode: string;
  activeDomain: FoundationDomainKey;
}

export function FoundationView({ companyCode, activeDomain }: FoundationViewProps) {
  const scopeOptions = useScopeOptions();
  const requestedCompany = resolveAccessibleCompany(scopeOptions.data?.companies ?? [], companyCode);
  const foundation = useCompanyFoundation(requestedCompany?.code ?? "");

  if (scopeOptions.isLoading || (requestedCompany && foundation.isLoading)) {
    return <PageFrame><FoundationSkeleton /></PageFrame>;
  }
  if (!requestedCompany) {
    return <PageFrame><ErrorState message={`Company code ${companyCode} is not available in the active Legal Entity.`} /></PageFrame>;
  }
  if (foundation.isError || !foundation.data) {
    return (
      <PageFrame>
        <ErrorState message={String(foundation.error ?? "Foundation data is unavailable.")} onRetry={() => foundation.refetch()} />
      </PageFrame>
    );
  }

  const payload = foundation.data;
  return (
    <PageFrame>
      <div className="flex flex-col gap-5 pb-10">
        <FoundationHeader payload={payload} refreshing={foundation.isFetching} onRefresh={() => foundation.refetch()} />
        <FoundationNavigation payload={payload} activeDomain={activeDomain} />
        {activeDomain === "organization" ? <OrganizationReviewCard payload={payload} />
          : activeDomain === "accounts" ? <AccountsFoundationPanel companyCode={payload.context.company.code} />
          : activeDomain === "books" ? <BooksFoundationPanel companyCode={payload.context.company.code} />
          : <FiscalCalendarDesigner companyCode={payload.context.company.code} />}
      </div>
    </PageFrame>
  );
}

function FoundationHeader({ payload, refreshing, onRefresh }: {
  payload: CompanyFoundationPayload; refreshing: boolean; onRefresh: () => void;
}) {
  const { company, legalEntity } = payload.context;
  const scope = { type: "company_code" as const, code: company.code };
  return (
    <SurfaceHeader
      kind="workspace"
      back={{
        label: "Finance settings",
        href: setupScopePath(FINANCE_SETUP_WORKSPACE, scope),
      }}
      eyebrow="Finance Settings · Company foundation"
      leading={<Building2 className="h-5 w-5" aria-hidden />}
      title={`${company.name} (${company.code})`}
      facts={[
        { key: "legal-entity", label: "Legal Entity:", value: legalEntity.name },
        { key: "currency", label: "Currency:", value: company.functionalCurrency ?? "Not configured" },
      ]}
      actions={(
        <>
          <Button variant="ghost" size="sm" aria-label="Refresh foundation settings" onClick={onRefresh}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/workbench/finance/readiness?scopeId=${encodeURIComponent(company.code)}`}>
              Review configuration
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm"><Link href="/finance/setup">Change company</Link></Button>
        </>
      )}
      navigation={[
        {
          key: "overview",
          label: "Overview",
          href: setupScopePath(FINANCE_SETUP_WORKSPACE, scope),
        },
        ...FINANCE_SETUP_WORKSPACE.domains.map((domain) => ({
          key: domain.code,
          label: domain.label,
          href: setupDomainPath(FINANCE_SETUP_WORKSPACE, scope, domain),
          active: domain.code === "foundation",
        })),
      ]}
      navigationLabel="Finance settings"
    />
  );
}

function FoundationNavigation({ payload, activeDomain }: {
  payload: CompanyFoundationPayload; activeDomain: FoundationDomainKey;
}) {
  return (
    <nav className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Foundation domains">
      {payload.domains.map((domain) => (
        <Link
          key={domain.key}
          href={domain.href}
          aria-current={domain.key === activeDomain ? "page" : undefined}
          className={cn(
            "rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30",
            domain.key === activeDomain && "border-primary ring-1 ring-primary",
          )}
        >
          <p className="text-sm font-semibold">{domain.label}</p>
        </Link>
      ))}
    </nav>
  );
}

function OrganizationReviewCard({ payload }: { payload: CompanyFoundationPayload }) {
  const { tenant, legalEntity, company } = payload.context;
  return (
    <section className="rounded-xl border bg-card" aria-labelledby="organization-title">
      <div className="border-b p-5">
        <div>
          <div className="flex items-center gap-2"><Coins className="h-5 w-5 text-muted-foreground" aria-hidden /><h2 id="organization-title" className="font-semibold">Organization and Currency</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">Company identity, statutory context, currencies, locale, and accounting framework.</p>
        </div>
      </div>

      <div className="grid divide-y lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <ReviewSection title="Session context">
          <ReviewField label="Tenant" value={formatRecord(tenant.name, tenant.code)} />
          <ReviewField label="Active Legal Entity" value={formatRecord(legalEntity.name, legalEntity.code)} />
        </ReviewSection>
        <ReviewSection title="Statutory context">
          <ReviewField label="Country" value={formatReference(legalEntity.countryName, legalEntity.countryCode)} />
          <ReviewField label="Functional currency" value={formatReference(legalEntity.functionalCurrencyName, legalEntity.functionalCurrency)} />
          <ReviewField label="Reporting currency" value={formatReference(legalEntity.reportingCurrencyName, legalEntity.reportingCurrency)} />
          <ReviewField label="Regulatory framework" value={displayValue(legalEntity.regulatoryFramework)} />
          <Button asChild variant="outline" size="sm" className="mt-2 w-fit">
            <Link href={`/app/legal_entity/${encodeURIComponent(legalEntity.id)}`}>Open Legal Entity <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden /></Link>
          </Button>
        </ReviewSection>
        <ReviewSection title="Company accounting profile">
          <ReviewField label="Company Code" value={`${company.name} (${company.code})`} />
          <ReviewField label="Country" value={formatReference(company.countryName, company.countryCode)} />
          <ReviewField label="Functional currency" value={formatReference(company.functionalCurrencyName, company.functionalCurrency)} />
          <ReviewField label="Regulatory framework" value={displayValue(company.regulatoryFramework)} />
          <ReviewField label="Timezone" value={displayValue(company.timezoneCode)} />
          <ReviewField label="Locale" value={displayValue(company.localeCode)} />
          <ReviewField label="Status" value={company.status} />
          <Button asChild variant="outline" size="sm" className="mt-2 w-fit">
            <Link href={`/app/company_code/${encodeURIComponent(company.id)}`}>Open Company Code <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden /></Link>
          </Button>
        </ReviewSection>
      </div>

    </section>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 p-5"><h3 className="text-sm font-semibold">{title}</h3>{children}</div>;
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return <div><dt className={LABEL_SM}>{label}</dt><dd className={`mt-0.5 ${BODY_SM}`}>{value}</dd></div>;
}

function formatRecord(name: string | null, code: string | null): string { return name ? `${name}${code ? ` (${code})` : ""}` : displayValue(code); }
function formatReference(name: string | null, code: string | null): string { return code ? `${code}${name ? ` · ${name}` : ""}` : "Not configured"; }
function displayValue(value: string | null): string { return value?.trim() || "Not configured"; }

function FoundationSkeleton() { return <div className="flex flex-col gap-5"><Skeleton className="h-28 rounded-xl" /><div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-24 rounded-xl" />)}</div><Skeleton className="h-96 rounded-xl" /></div>; }
function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) { return <div className="rounded-xl border bg-card p-10 text-center"><CircleAlert className="mx-auto h-8 w-8 text-destructive" /><h1 className="mt-3 font-semibold">Couldn't load company foundation</h1><p className="mt-1 text-sm text-muted-foreground">{message}</p><div className="mt-4 flex justify-center gap-2">{onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}<Button asChild variant="outline"><Link href="/finance/setup">Select company</Link></Button></div></div>; }
