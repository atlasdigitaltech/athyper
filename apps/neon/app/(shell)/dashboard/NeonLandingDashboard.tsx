import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Boxes, BriefcaseBusiness, Building2, CheckCircle2,
  Clock3, HeartHandshake, Inbox, Landmark, UsersRound,
} from "lucide-react";
import { WorkspaceCardGrid, WorkspaceDashboard } from "@athyper/ui/layout";
import { DashboardHero } from "./DashboardHero";

interface DashboardProps {
  userName: string;
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

export function NeonLandingDashboard({ userName }: DashboardProps) {
  return (
    <WorkspaceDashboard className="space-y-7 pt-4 sm:pt-5 lg:pt-6">
      <DashboardHero userName={userName} />

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">My attention</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {attention.map(({ label, value, detail, href, icon: Icon, tone }) => (
            <Link key={label} href={href} className="group rounded-xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm">
              <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{label}</p><p className="mt-3 text-2xl font-semibold">{value}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div><span className={`rounded-lg p-2.5 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3 ${tone}`}><Icon className="h-5 w-5" /></span></div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Workspaces</h2>
        <WorkspaceCardGrid>
          {workspaces.map(({ label, description, href, icon: Icon, primary }) => (
            <Link key={label} href={href} className={`group flex items-center gap-4 rounded-xl border p-5 transition-colors ${primary ? "border-primary/30 bg-primary/[0.04] hover:bg-primary/[0.07]" : "bg-card hover:bg-muted/40"}`}>
              <span className={`rounded-lg p-3 ${primary ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-medium">{label}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span></span>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </WorkspaceCardGrid>
      </section>

    </WorkspaceDashboard>
  );
}
