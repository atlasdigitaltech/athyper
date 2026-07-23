"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CircleDollarSign,
  Coins,
  Landmark,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { useScopeOptions } from "@athyper/finance-workbench/hooks";

const companyDomains = [
  {
    key: "foundation",
    path: "foundation",
    title: "Foundation",
    description: "Organization, chart of accounts, books and fiscal calendar.",
    icon: Building2,
  },
  {
    key: "currency-fx",
    path: "currency-fx",
    title: "Currency & FX",
    description: "FX policies, rate coverage, imports and revaluation readiness.",
    icon: Coins,
  },
  {
    key: "tax",
    path: "tax",
    title: "Tax",
    description: "Company registrations, resolution simulation and posting coverage.",
    icon: ReceiptText,
  },
  {
    key: "payments",
    path: "payments",
    title: "Payments & Settlement",
    description: "Payment policy, interface routing and settlement accounting.",
    icon: CircleDollarSign,
  },
  {
    key: "banking",
    path: "banking",
    title: "Banking & Treasury",
    description: "House banks, account links, interfaces and reconciliation readiness.",
    icon: Landmark,
  },
  {
    key: "certification",
    path: "",
    title: "Certification & Rollout",
    description: "Four-domain readiness, certification status and production posting gate.",
    icon: ShieldCheck,
  },
] as const;

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
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
            <h2 id="finance-setup-domains-title" className="font-semibold">Finance setup domains</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the complete posting contract, from company foundation through banking readiness.
          </p>
        </div>
        <Link
          href={companyRoot}
          className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted"
        >
          Setup overview <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {companyDomains.map(({ key, path, title, description, icon: Icon }) => {
          const href = companyCode && path ? `${companyRoot}/${path}` : companyRoot;
          return (
            <Link
              key={key}
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
              <h3 className="mt-3 text-sm font-semibold">{title}</h3>
              <p className="mt-1 flex-1 text-xs leading-5 text-muted-foreground">{description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                Open {companyCode ? `for ${companyCode}` : "company selection"}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Tenant definitions</span>
        <DefinitionLink href={tenantHref(tenantCode, "currency-fx")} title="FX rate workbench" />
        <DefinitionLink href={tenantHref(tenantCode, "tax")} title="Tax groups & WHT" />
        <DefinitionLink href={tenantHref(tenantCode, "payment-terms")} title="Payment terms" />
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
