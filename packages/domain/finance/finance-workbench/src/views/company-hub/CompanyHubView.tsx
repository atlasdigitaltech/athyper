"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CircleDollarSign,
  Coins,
  Landmark,
  ReceiptText,
  Search,
  Settings2,
} from "lucide-react";
import { Button, Input, Skeleton } from "@athyper/platform-ui/primitives";
import { PageFrame } from "@athyper/platform-ui/layout";
import {
  useScopeOptions,
  type CompanyOption,
  type ScopeOptionsData,
} from "../../hooks/useScopeOptions";
import {
  resolveAccessibleCompany,
  resolveCompanyEntryMode,
} from "../../lib/company-selection";
import {
  FINANCE_SETTINGS_DIRECTORY,
  FINANCE_SETUP_WORKSPACE,
} from "../../lib/finance-setup.workspace";
import type {
  FinanceSettingsDirectoryGroup,
  FinanceSettingsDirectoryItem,
} from "../../lib/finance-setup.types";
import { LegacyCompanyHubView } from "./LegacyCompanyHubView";

export interface CompanyHubViewProps {
  companyCode: string;
}

const settingsIcons = {
  building: Building2,
  coins: Coins,
  "receipt-text": ReceiptText,
  "circle-dollar": CircleDollarSign,
  landmark: Landmark,
} as const;

const companySettingsGroup = FINANCE_SETTINGS_DIRECTORY.groups.find(
  (group) => group.scope === "company",
);
const tenantSettingsGroup = FINANCE_SETTINGS_DIRECTORY.groups.find(
  (group) => group.scope === "tenant",
);

export function CompanyHubView(props: CompanyHubViewProps) {
  const scopeOptions = useScopeOptions();
  if (scopeOptions.data?.featureFlags.financeSettingsDirectory === false) {
    return <LegacyCompanyHubView companyCode={props.companyCode} />;
  }
  return <CompanyFinanceSettingsDirectory {...props} />;
}

export function CompanyFinanceSettingsDirectory({ companyCode }: CompanyHubViewProps) {
  const scopeOptions = useScopeOptions();

  if (scopeOptions.isLoading && !scopeOptions.data) {
    return <PageFrame><SettingsDirectorySkeleton /></PageFrame>;
  }

  if (scopeOptions.isError || !scopeOptions.data) {
    return (
      <PageFrame>
        <ErrorState
          message={String(scopeOptions.error ?? "Finance scope information is unavailable.")}
          onRetry={() => scopeOptions.refetch()}
        />
      </PageFrame>
    );
  }

  const requestedCompany = resolveAccessibleCompany(scopeOptions.data.companies, companyCode);
  if (!requestedCompany) {
    return (
      <CompanyScopeSelectionScreen
        scopeOptions={scopeOptions.data}
        message={`Company code ${companyCode} is not available in the active legal entity.`}
      />
    );
  }

  return (
    <SettingsDirectoryContent
      company={requestedCompany}
      scopeOptions={scopeOptions.data}
    />
  );
}

function SettingsDirectoryContent({
  company,
  scopeOptions,
}: {
  company: CompanyOption;
  scopeOptions: ScopeOptionsData;
}) {
  const [query, setQuery] = useState("");
  const companyItems = useMemo(
    () => filterSettings(companySettingsGroup?.items ?? [], query),
    [query],
  );
  const tenantItems = useMemo(
    () => filterSettings(tenantSettingsGroup?.items ?? [], query),
    [query],
  );
  const companyRoot = `/finance/setup/company/${encodeURIComponent(company.code)}`;
  const reviewHref = `/workbench/finance/readiness?scopeId=${encodeURIComponent(company.code)}`;

  return (
    <PageFrame>
      <main className="flex flex-col gap-6 pb-10">
        <header className="rounded-xl border bg-card p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Finance Settings
              </p>
              <h1 className="mt-1 text-xl font-semibold">
                {company.name} ({company.code})
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {company.legalEntityName
                  ?? scopeOptions.activeLegalEntityName
                  ?? company.legalEntityCode
                  ?? scopeOptions.activeLegalEntityCode
                  ?? "Current legal entity"}
                {" · "}
                Functional currency {company.functionalCurrency}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tenant {scopeOptions.tenantName ?? scopeOptions.tenantCode ?? "current"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/finance/setup">Change company</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={reviewHref}>Review configuration</Link>
              </Button>
            </div>
          </div>

          <label className="relative mt-5 block max-w-xl">
            <span className="sr-only">Search Finance settings</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search settings"
              className="pl-9"
            />
          </label>
        </header>

        <SettingsGroup
          group={companySettingsGroup}
          items={companyItems}
          hrefForItem={(item) => `${companyRoot}/${item.routeSegment}`}
        />

        <SettingsGroup
          group={tenantSettingsGroup}
          items={tenantItems}
          hrefForItem={(item) => scopeOptions.tenantCode
            ? `/finance/setup/tenant/${encodeURIComponent(scopeOptions.tenantCode)}/${item.routeSegment}`
            : "/finance/setup"}
          compact
        />

        {companyItems.length === 0 && tenantItems.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center">
            <Settings2 className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
            <h2 className="mt-3 text-sm font-semibold">No settings match “{query.trim()}”</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a setting name such as currency, tax, payment terms, or bank account.
            </p>
          </div>
        ) : null}
      </main>
    </PageFrame>
  );
}

function SettingsGroup({
  group,
  items,
  hrefForItem,
  compact = false,
}: {
  group: FinanceSettingsDirectoryGroup | undefined;
  items: readonly FinanceSettingsDirectoryItem[];
  hrefForItem: (item: FinanceSettingsDirectoryItem) => string;
  compact?: boolean;
}) {
  if (!group || items.length === 0) return null;

  return (
    <section aria-labelledby={`finance-settings-${group.code}`}>
      <div className="mb-3">
        <h2 id={`finance-settings-${group.code}`} className="text-sm font-semibold">
          {group.label}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {group.scope === "company"
            ? "Select an area to view or change company settings."
            : "Shared definitions used by companies in the current tenant."}
        </p>
      </div>
      <div className={compact
        ? "grid gap-3 md:grid-cols-3"
        : "grid gap-3 md:grid-cols-2 xl:grid-cols-3"}
      >
        {items.map((item) => {
          const Icon = settingsIcons[item.iconKey as keyof typeof settingsIcons] ?? Settings2;
          return (
            <Link
              key={item.code}
              href={hrefForItem(item)}
              className="group flex min-h-28 items-start gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/30"
            >
              <span className="rounded-lg bg-muted p-2.5 text-muted-foreground">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {item.description}
                </span>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  Open
                  <ArrowRight
                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function filterSettings(
  items: readonly FinanceSettingsDirectoryItem[],
  query: string,
): readonly FinanceSettingsDirectoryItem[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return items;
  return items.filter((item) => [
    item.label,
    item.description,
    ...item.searchKeywords,
  ].some((value) => value.toLocaleLowerCase().includes(normalized)));
}

/** Entry surface for /finance/setup. Session tenant/legal entity are fixed;
 * company code is confirmed before the settings directory is loaded. */
export function FinanceSetupCompanyEntry() {
  const scopeOptions = useScopeOptions();
  const companies = scopeOptions.data?.companies ?? [];

  if (scopeOptions.isLoading) {
    return <PageFrame><SettingsDirectorySkeleton /></PageFrame>;
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
          <p className="mt-1 text-sm text-muted-foreground">
            You do not have access to a finance-enabled company code.
          </p>
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
    window.location.replace(companySettingsHref(companyCode));
  }, [companyCode]);
  return <PageFrame><SettingsDirectorySkeleton /></PageFrame>;
}

function CompanyScopeSelectionScreen({
  scopeOptions,
  message,
}: {
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
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Finance Settings
          </span>
          <h1 className="mt-1 text-xl font-semibold">Select company</h1>
        </header>

        <form
          className="rounded-xl border bg-card p-6 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if (companyCode) window.location.assign(companySettingsHref(companyCode));
          }}
        >
          {message ? (
            <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {message}
            </div>
          ) : null}
          <div className="grid gap-5">
            <ContextField
              label="Tenant"
              value={scopeOptions?.tenantName ?? scopeOptions?.tenantCode ?? "Current tenant"}
            />
            <ContextField
              label="Legal Entity"
              value={scopeOptions?.activeLegalEntityName
                ?? scopeOptions?.activeLegalEntityCode
                ?? "Current legal entity"}
            />
            <label className="grid gap-1.5 sm:grid-cols-[150px_1fr] sm:items-center">
              <span className="text-sm font-medium">
                Company Code <span className="text-destructive">*</span>
              </span>
              <select
                value={companyCode}
                onChange={(event) => setCompanyCode(event.target.value)}
                required
                className="h-11 rounded-md border bg-background px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {companies.map((company) => (
                  <option key={company.code} value={company.code}>
                    {company.name} ({company.code})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-7 flex items-center justify-end border-t pt-5">
            <Button type="submit" disabled={!companyCode}>Open Finance Settings</Button>
          </div>
        </form>
      </main>
    </PageFrame>
  );
}

function companySettingsHref(companyCode: string): string {
  const companyPolicy = FINANCE_SETUP_WORKSPACE.scopePolicies.find(
    (policy) => policy.type === "company_code",
  );
  return `${FINANCE_SETUP_WORKSPACE.basePath}/${companyPolicy?.routeSegment ?? "company"}/${encodeURIComponent(companyCode)}`;
}

function ContextField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[150px_1fr] sm:items-center">
      <span className="text-sm font-medium">{label}</span>
      <div
        className="flex h-11 items-center rounded-md border bg-muted/35 px-3 text-sm text-muted-foreground"
        aria-readonly="true"
      >
        {value}
      </div>
    </div>
  );
}

function SettingsDirectorySkeleton() {
  return (
    <div className="flex flex-col gap-6 pb-10">
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
      <div>
        <h2 className="text-base font-semibold">Couldn't load Finance Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="secondary" onClick={onRetry}>Try again</Button>
    </div>
  );
}
