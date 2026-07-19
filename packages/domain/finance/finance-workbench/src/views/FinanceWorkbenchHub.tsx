import Link from "next/link";
import { ArrowRight, Building2, CalendarRange, Landmark, Layers3, Settings2, ShieldCheck } from "lucide-react";
import type { FinanceScope } from "../lib/scope";

const simpleMasters = [
  ["Legal entities", "legal_entity"], ["Company codes", "company_code"],
  ["Currencies", "currency"], ["Ledger books", "ledger_book"],
  ["Charts of accounts", "chart_of_account"], ["GL accounts", "gl_account"],
  ["Company GL activation", "company_code_gl_account"], ["House banks", "bank_party"],
  ["Bank accounts", "bank_account"], ["Bank-account links", "bank_account_link"],
  ["Payment methods", "payment_method"], ["Payment terms", "payment_term"],
] as const;

const aggregateEditors = [
  ["Accounting Profiles", "Business events, posting templates, book rules and derivation", "/workbench/finance/accounting-profiles"],
  ["Fiscal Calendars", "Calendar rules, preview, assignment and period generation", "/workbench/finance/fiscal-calendars"],
  ["Dimension Policies", "Mandatory policies, allowed values and derivation", "/workbench/finance/dimension-policies"],
  ["Tax Groups and Rates", "Tax bundles, effective rates and resolution", "/workbench/finance/tax-configuration"],
  ["Payment and Bank Interfaces", "Company policies, interfaces, bindings and settlement", "/workbench/finance/payment-interfaces"],
] as const;

const governed = [
  ["Opening Balances", "/workbench/finance/opening-balances"],
  ["Posting Readiness", "/workbench/finance/readiness"],
  ["Monthly Close", "/workbench/finance/monthly-close"],
  ["Annual Close", "/workbench/finance/annual-close"],
  ["Posting Role Coverage", "/workbench/finance/posting-role-coverage"],
  ["Cross-book Diagnostics", "/workbench/finance/cross-book"],
] as const;

function scopedHref(path: string, scope: FinanceScope) {
  const params = new URLSearchParams({ scopeId: scope.scopeId, fiscalYear: String(scope.fiscalYear) });
  if (scope.period != null) params.set("period", String(scope.period));
  if (scope.bookId) params.set("bookId", scope.bookId);
  return `${path}?${params}`;
}

export function FinanceWorkbenchHub({ scope }: { scope: FinanceScope }) {
  return (
    <main className="space-y-6 p-6">
      <header className="rounded-2xl border bg-card p-6">
        <div className="flex items-center gap-3"><Landmark className="h-6 w-6 text-primary" /><div><h1 className="text-2xl font-semibold">Finance Setup and Governance</h1><p className="mt-1 text-sm text-muted-foreground">Canonical Entity masters, aggregate configuration editors and governed finance execution.</p></div></div>
        <div className="mt-4 inline-flex rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Scope: {scope.scopeId || "select company"} · FY{scope.fiscalYear}{scope.period != null ? ` · P${scope.period}` : ""}</div>
      </header>

      <section><div className="mb-3 flex items-center gap-2"><Building2 className="h-4 w-4" /><h2 className="font-semibold">Canonical Entity masters</h2></div><p className="mb-3 text-sm text-muted-foreground">Simple records use the same high-performance Entity List and Entity Record UX as the rest of Neon.</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{simpleMasters.map(([label, entity]) => <Link key={entity} href={`/app/${entity}`} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm hover:bg-muted/40"><span>{label}</span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>)}</div></section>

      <section><div className="mb-3 flex items-center gap-2"><Settings2 className="h-4 w-4" /><h2 className="font-semibold">Aggregate editors</h2></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{aggregateEditors.map(([title, description, path]) => <Link key={path} href={scopedHref(path, scope)} className="rounded-xl border bg-card p-4 hover:border-primary/50"><div className="flex items-start justify-between"><Layers3 className="h-5 w-5 text-primary" /><ArrowRight className="h-4 w-4 text-muted-foreground" /></div><h3 className="mt-3 font-medium">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{description}</p></Link>)}</div></section>

      <section><div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /><h2 className="font-semibold">Governed workbenches</h2></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{governed.map(([label, path]) => <Link key={path} href={scopedHref(path, scope)} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm hover:bg-muted/40"><span className="inline-flex items-center gap-2"><CalendarRange className="h-4 w-4 text-primary" />{label}</span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>)}</div></section>
    </main>
  );
}
