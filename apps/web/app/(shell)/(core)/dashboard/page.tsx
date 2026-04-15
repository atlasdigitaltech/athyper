"use client";

/**
 * /dashboard — Primary user landing page
 *
 * Unified landing for all roles. Shell variant (admin/partner/user) is
 * resolved in (shell)/layout.tsx from session → role → module grants.
 * This page does NOT redirect based on workbench type.
 *
 * Shows:
 *   - Workspace launchers (direct links to /finance, /supply-chain, etc.)
 *   - Pending inbox count (live via useInbox)
 *   - Quick navigation shortcuts
 */

import { ArrowRight, Bell, Briefcase, Building2, ChevronRight, Factory, FolderKanban, Inbox, LayoutDashboard, Package, Users } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/feedback";
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@athyper/ui/primitives";
import { useShellSession } from "@/components/providers/SessionProvider";
import { useInbox } from "@athyper/query";

// ── Workspace cards ────────────────────────────────────────────────────────────

const WORKSPACES = [
  {
    href: "/finance",
    label: "Finance",
    description: "Accounting, GL, COA, close cycle",
    icon: Building2,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    href: "/supply-chain",
    label: "Supply Chain",
    description: "Procurement, inventory, logistics",
    icon: Package,
    color: "text-warning",
    bg: "bg-warning/10",
  },
  {
    href: "/people",
    label: "People",
    description: "HR, payroll, org management",
    icon: Users,
    color: "text-accent-foreground",
    bg: "bg-accent/10",
  },
  {
    href: "/projects",
    label: "Projects",
    description: "Project costing, ITSM",
    icon: FolderKanban,
    color: "text-success",
    bg: "bg-success/10",
  },
  {
    href: "/manufacturing",
    label: "Manufacturing",
    description: "Production, maintenance",
    icon: Factory,
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
  {
    href: "/asset-management",
    label: "Asset Management",
    description: "Fixed assets, real estate, facilities",
    icon: Briefcase,
    color: "text-info",
    bg: "bg-info/10",
  },
] as const;

// ── Quick links ────────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { href: "/inbox",         label: "Workflow Inbox",    icon: Inbox },
  { href: "/notifications", label: "Notifications",     icon: Bell },
  { href: "/saved-views",   label: "Saved Views",       icon: LayoutDashboard },
  { href: "/dashboards",    label: "Dashboard Gallery", icon: LayoutDashboard },
] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { bff } = useShellSession();
  const { data: inboxData, isLoading: inboxLoading } = useInbox();
  const pendingCount = inboxData?.data?.length ?? 0;

  const firstName = bff.displayName.split(" ")[0] ?? bff.displayName;

  return (
    <PageFrame
      title={`Welcome, ${firstName}`}
      description="Choose a workspace to begin or use a quick link below"
    >
      <div className="space-y-6">

        {/* ── Workspace grid ──────────────────────────────────────────────── */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Workspaces
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WORKSPACES.map(({ href, label, description, icon: Icon, color, bg }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40 hover:border-border/80"
              >
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${bg}`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                </div>
                <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        </div>

        {/* ── Status row ──────────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/inbox"
            className="group flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
          >
            <div className="flex items-center gap-3">
              <Inbox className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium">Inbox</span>
            </div>
            {inboxLoading ? (
              <Skeleton className="h-5 w-8 rounded-full" />
            ) : pendingCount > 0 ? (
              <Badge variant="warning" className="text-[10px]">{pendingCount}</Badge>
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100" />
            )}
          </Link>

          {QUICK_LINKS.slice(1).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{label}</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>

        {/* ── Recent activity placeholder ──────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={<LayoutDashboard className="h-8 w-8 text-muted-foreground/20" />}
              description="Recent documents, entity changes, and workflow events will appear here."
              className="py-8"
            />
          </CardContent>
        </Card>

      </div>
    </PageFrame>
  );
}
