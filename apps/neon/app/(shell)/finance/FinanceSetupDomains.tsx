"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CircleDollarSign,
  Coins,
  Landmark,
  ReceiptText,
  Settings2,
} from "lucide-react";
import { FINANCE_SETTINGS_DIRECTORY } from "@athyper/finance-workbench";
import { useScopeOptions } from "@athyper/finance-workbench/hooks";

const settingsIcons = {
  building: Building2,
  coins: Coins,
  "receipt-text": ReceiptText,
  "circle-dollar": CircleDollarSign,
  landmark: Landmark,
} as const;

const companySettings = FINANCE_SETTINGS_DIRECTORY.groups.find((group) => group.scope === "company");
const tenantSettings = FINANCE_SETTINGS_DIRECTORY.groups.find((group) => group.scope === "tenant");

export function FinanceSetupDomains() {
  const scope = useScopeOptions();
  const companies = scope.data?.companies ?? [];
  const companyCode = scope.data?.defaultCompanyCode
    ?? (companies.length === 1 ? companies[0]?.code ?? null : null);
  const tenantCode = scope.data?.tenantCode ?? null;
  const companyRoot = companyCode
    ? `/finance/setup/company/${encodeURIComponent(companyCode)}`
    : "/finance/setup";

  return (
    <section className="rounded-xl border bg-card p-5" aria-labelledby="finance-setup-domains-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" aria-hidden />
            <h2 id="finance-setup-domains-title" className="font-semibold">Finance Settings</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            View or change company and tenant Finance configuration.
          </p>
        </div>
        <Link
          href={companyRoot}
          className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted"
        >
          Open settings <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <div className="mt-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {companySettings?.label ?? "Configuration"}
        </h3>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {companySettings?.items.map((item) => {
          const Icon = settingsIcons[item.iconKey as keyof typeof settingsIcons] ?? Settings2;
          const href = companyCode ? `${companyRoot}/${item.routeSegment}` : companyRoot;
          return (
            <Link
              key={item.code}
              href={href}
              className="group flex min-h-40 flex-col rounded-xl border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-muted/20"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Company
                </span>
              </div>
              <h4 className="mt-3 text-sm font-semibold">{item.label}</h4>
              <p className="mt-1 flex-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                Open {companyCode ? `for ${companyCode}` : "company selection"}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {tenantSettings?.label ?? "Tenant definitions"}
        </span>
        {tenantSettings?.items.map((item) => (
          <DefinitionLink
            key={item.code}
            href={tenantHref(tenantCode, item.routeSegment)}
            title={item.label}
          />
        ))}
        {scope.isLoading ? <span className="text-xs text-muted-foreground">Resolving finance context…</span> : null}
      </div>
    </section>
  );
}

function tenantHref(tenantCode: string | null, domain: string): string {
  return tenantCode
    ? `/finance/setup/tenant/${encodeURIComponent(tenantCode)}/${domain}`
    : "/finance/setup";
}

function DefinitionLink({ href, title }: { href: string; title: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted">
      {title}<ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
    </Link>
  );
}
