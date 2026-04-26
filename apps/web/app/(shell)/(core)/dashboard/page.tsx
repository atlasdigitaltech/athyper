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

import { Bell, Bookmark, Briefcase, Building2, ChevronRight, Factory, FolderKanban, Inbox, LayoutDashboard, Package, Users } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@athyper/ui/primitives";
import { ActionLinkCard } from "@/components/home/ActionLinkCard";
import { SectionLabel } from "@/components/home/SectionLabel";
import { useShellSession } from "@/components/providers/SessionProvider";
import { useInbox } from "@athyper/query";

// ── Workspace cards ────────────────────────────────────────────────────────────

const WORKSPACES = [
  {
    href: "/finance",
    title: "Finance",
    description: "Accounting, GL, COA, close cycle",
    icon: Building2,
  },
  {
    href: "/supply-chain",
    title: "Supply Chain",
    description: "Procurement, inventory, logistics",
    icon: Package,
  },
  {
    href: "/people",
    title: "People",
    description: "HR, payroll, org management",
    icon: Users,
  },
  {
    href: "/projects",
    title: "Projects",
    description: "Project costing, ITSM",
    icon: FolderKanban,
  },
  {
    href: "/manufacturing",
    title: "Manufacturing",
    description: "Production, maintenance",
    icon: Factory,
  },
  {
    href: "/asset-management",
    title: "Asset Management",
    description: "Fixed assets, real estate, facilities",
    icon: Briefcase,
  },
] as const;

// ── Quick links ────────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { href: "/inbox",         label: "Workflow Inbox",    icon: Inbox },
  { href: "/notifications", label: "Notifications",     icon: Bell },
  { href: "/saved-views",   label: "Saved Views",       icon: Bookmark },
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
          <SectionLabel>Workspaces</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WORKSPACES.map((workspace) => (
              <ActionLinkCard key={workspace.href} {...workspace} />
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
              <Inbox className="h-4 w-4 text-muted-foreground" />
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
