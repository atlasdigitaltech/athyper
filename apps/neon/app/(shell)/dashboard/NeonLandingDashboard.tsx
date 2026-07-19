import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Boxes, BriefcaseBusiness, Building2, CheckCircle2,
  Clock3, FileCheck2, HeartHandshake, Inbox, Landmark, ReceiptText, UsersRound,
} from "lucide-react";

interface DashboardProps {
  organizationName: string;
  userName: string;
  workspaceName: string;
  periodLabel: string;
}

const attention = [
  { label: "My work", value: "Open queue", detail: "Tasks assigned to you", href: "/inbox", icon: Inbox, tone: "text-sky-600 bg-sky-500/10" },
  { label: "Approvals", value: "Review", detail: "Items waiting for decision", href: "/inbox?tab=approvals", icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-500/10" },
  { label: "Exceptions", value: "Resolve", detail: "Finance controls needing attention", href: "/workbench/finance/readiness", icon: AlertTriangle, tone: "text-amber-600 bg-amber-500/10" },
  { label: "Recent", value: "Continue", detail: "Return to recent records", href: "/saved-views", icon: Clock3, tone: "text-violet-600 bg-violet-500/10" },
] as const;

const workspaces = [
  { label: "Finance", description: "Accounting, invoices, close and setup", href: "/finance", icon: Landmark, primary: true },
  { label: "Supply Chain", description: "Buying, sourcing and inventory", href: "/workbench/supply-chain", icon: Boxes, primary: false },
  { label: "Sales & CRM", description: "Customers, orders and revenue", href: "/workbench/customer-experience", icon: HeartHandshake, primary: false },
  { label: "People", description: "People and payroll operations", href: "/workbench/people-management", icon: UsersRound, primary: false },
  { label: "Projects & Services", description: "Projects and service delivery", href: "/workbench/project-management", icon: BriefcaseBusiness, primary: false },
  { label: "Assets & Facilities", description: "Assets, sites and maintenance", href: "/workbench/asset-management", icon: Building2, primary: false },
] as const;

export function NeonLandingDashboard({ organizationName, userName, workspaceName, periodLabel }: DashboardProps) {
  return (
    <main className="mx-auto w-full max-w-[1680px] space-y-7 p-5 sm:p-7 lg:p-9">
      <header>
        <p className="text-sm text-muted-foreground">Welcome back, {userName}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{organizationName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{periodLabel} · {workspaceName} workspace</p>
      </header>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">My attention</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {attention.map(({ label, value, detail, href, icon: Icon, tone }) => (
            <Link key={label} href={href} className="group rounded-xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm">
              <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{label}</p><p className="mt-3 text-2xl font-semibold">{value}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div><span className={`rounded-lg p-2.5 ${tone}`}><Icon className="h-5 w-5" /></span></div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Workspaces</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workspaces.map(({ label, description, href, icon: Icon, primary }) => (
            <Link key={label} href={href} className={`group flex items-center gap-4 rounded-xl border p-5 transition-colors ${primary ? "border-primary/30 bg-primary/[0.04] hover:bg-primary/[0.07]" : "bg-card hover:bg-muted/40"}`}>
              <span className={`rounded-lg p-3 ${primary ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-medium">{label}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span></span>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Finance quick access</h2><p className="mt-1 text-sm text-muted-foreground">The three places finance users need most often.</p></div><Link href="/finance" className="text-sm font-medium text-primary hover:underline">Open Finance workspace</Link></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <QuickLink href="/app/journal_entry" icon={FileCheck2} title="Journal Entries" detail="Create, review and trace postings" />
          <QuickLink href="/app/purchase_invoice" icon={ReceiptText} title="Purchase Invoices" detail="Invoice processing and accounting" />
          <QuickLink href="/workbench/finance" icon={Landmark} title="Finance Workbench" detail="Setup, readiness and close governance" />
        </div>
      </section>
    </main>
  );
}

function QuickLink({ href, icon: Icon, title, detail }: { href: string; icon: typeof Landmark; title: string; detail: string }) {
  return <Link href={href} className="group flex items-center gap-3 rounded-lg border bg-background p-4 hover:border-primary/40"><Icon className="h-5 w-5 text-primary" /><span className="min-w-0 flex-1"><span className="block font-medium">{title}</span><span className="block truncate text-xs text-muted-foreground">{detail}</span></span><ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" /></Link>;
}
