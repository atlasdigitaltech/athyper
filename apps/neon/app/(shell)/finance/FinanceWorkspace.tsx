import Link from "next/link";
import {
  ArrowRight, BookOpenCheck, CalendarCheck2, CircleDollarSign, FileCheck2,
  Landmark, Plus, ReceiptText, Settings2, ShieldCheck,
} from "lucide-react";
import { WorkspaceCardGrid, WorkspaceDashboard, WorkspaceDashboardHeader, WorkspaceDashboardSection } from "@athyper/ui/layout";

export function FinanceWorkspace({ organizationName, periodLabel }: { organizationName: string; periodLabel: string }) {
  return (
    <WorkspaceDashboard>
      <WorkspaceDashboardHeader
        eyebrow="Finance workspace"
        title={organizationName}
        description={`${periodLabel} · accounting operations and governance`}
        actions={<Link href="/workbench/finance" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"><Landmark className="h-4 w-4" />Open workbench</Link>}
      />

      <WorkspaceCardGrid className="gap-4 lg:grid-cols-3">
        <PrimaryArea icon={FileCheck2} title="Journal Entries" description="Manual journals, posting status, reversals and complete posting traces." href="/app/journal_entry" createHref="/app/journal_entry/new" createLabel="New journal" />
        <PrimaryArea icon={ReceiptText} title="Purchase Invoices" description="Invoice intake, validation, accounting distributions and payment readiness." href="/app/purchase_invoice" createHref="/app/purchase_invoice/new" createLabel="New invoice" />
        <PrimaryArea icon={Landmark} title="Finance Workbench" description="Finance setup, opening balances, readiness, period close and diagnostics." href="/workbench/finance" />
      </WorkspaceCardGrid>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <WorkspaceDashboardSection panel title="Finance operations" description="Daily execution, controls and period-end work."><div className="grid gap-2 sm:grid-cols-2">{[
          ["Posting readiness", "Check setup and production posting gates", "/workbench/finance/readiness", ShieldCheck],
          ["Monthly close", "Run tasks, evidence and certification", "/workbench/finance/monthly-close", CalendarCheck2],
          ["Opening balances", "Import, reconcile and certify period 0", "/workbench/finance/opening-balances", BookOpenCheck],
          ["Cross-book diagnostics", "Monitor derived journals and failures", "/workbench/finance/cross-book", CircleDollarSign],
        ].map(([title, detail, href, icon]) => {
          const Icon = icon as typeof ShieldCheck;
          return <Link key={String(title)} href={String(href)} className="group flex items-center gap-3 rounded-lg border bg-background p-4 hover:border-primary/40"><span className="rounded-lg bg-muted p-2"><Icon className="h-4 w-4 text-primary" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{String(title)}</span><span className="block truncate text-xs text-muted-foreground">{String(detail)}</span></span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>;
        })}</div></WorkspaceDashboardSection>

        <aside className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Configuration</h2><p className="mt-1 text-sm text-muted-foreground">Masters stay in Entity App; connected configuration stays in Workbench.</p><div className="mt-4 space-y-2"><SideLink href="/finance/setup" title="Finance setup" icon={Settings2} /><SideLink href="/app/gl_account" title="GL accounts" icon={BookOpenCheck} /><SideLink href="/app/payment_term" title="Payment terms" icon={CircleDollarSign} /><SideLink href="/workbench/finance/posting-role-coverage" title="Posting role coverage" icon={ShieldCheck} /></div></aside>
      </section>
    </WorkspaceDashboard>
  );
}

function PrimaryArea({ icon: Icon, title, description, href, createHref, createLabel }: { icon: typeof Landmark; title: string; description: string; href: string; createHref?: string; createLabel?: string }) {
  return <article className="flex min-h-56 flex-col rounded-xl border bg-card p-5"><span className="w-fit rounded-lg bg-primary/10 p-3 text-primary"><Icon className="h-6 w-6" /></span><h2 className="mt-4 text-lg font-semibold">{title}</h2><p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{description}</p><div className="mt-5 flex items-center gap-2"><Link href={href} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Open <ArrowRight className="h-4 w-4" /></Link>{createHref ? <Link href={createHref} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium"><Plus className="h-4 w-4" />{createLabel}</Link> : null}</div></article>;
}

function SideLink({ href, title, icon: Icon }: { href: string; title: string; icon: typeof Landmark }) {
  return <Link href={href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><Icon className="h-4 w-4 text-muted-foreground" /><span className="flex-1">{title}</span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>;
}
