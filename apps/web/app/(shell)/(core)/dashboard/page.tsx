"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock3,
  Factory,
  FolderKanban,
  Inbox,
  Package,
  Pin,
  ShoppingBag,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { PageFrame } from "@athyper/ui/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@athyper/ui/primitives";
import { ActivityFeed } from "@athyper/collaboration-ui/activity";
import { SectionLabel } from "@/components/home/SectionLabel";
import { useShellSession } from "@/components/providers/SessionProvider";
import { getWorkbenchLabel } from "@/lib/auth/workbench-config";
import { parseOrgAlias } from "@/lib/auth/parse-org-alias";
import {
  getRecentItems,
  RECENT_ITEMS_CHANGED_EVENT,
  timeAgo,
  type RecentItem,
} from "@/lib/recent-items";
import { useInbox, useRecentActivity } from "@athyper/query";

interface WorkspaceCardModel {
  key: string;
  href: string;
  title: string;
  icon: LucideIcon;
}

type PortalType = "user" | "partner" | "admin";

const PHASE_ONE_DEFAULT_PORTAL: PortalType = "user";

// Phase 1: landing workspace display always falls back to the User portal.
// Phase 2 can replace this with IAM/KC portal plus tenant subscription filtering.
const PORTAL_WORKSPACES: Record<PortalType, WorkspaceCardModel[]> = {
  user: [
    {
      key: "finance",
      href: "/finance",
      title: "Finance",
      icon: Building2,
    },
    {
      key: "supply-chain",
      href: "/supply-chain",
      title: "Supply Chain",
      icon: Package,
    },
    {
      key: "customer-experience",
      href: "/customer-experience",
      title: "Sales & CRM",
      icon: ShoppingBag,
    },
    {
      key: "people-management",
      href: "/people",
      title: "People",
      icon: Users,
    },
    {
      key: "project-management",
      href: "/projects",
      title: "Projects & Services",
      icon: FolderKanban,
    },
    {
      key: "manufacturing-operations",
      href: "/manufacturing",
      title: "Manufacturing & Maintenance",
      icon: Factory,
    },
    {
      key: "asset-management",
      href: "/asset-management",
      title: "Assets & Facilities",
      icon: Briefcase,
    },
  ],
  partner: [],
  admin: [],
};

function firstName(displayName: string): string {
  const name = displayName.trim().split(/\s+/)[0];
  return name || displayName;
}

function plural(count: number, singular: string, pluralLabel: string): string {
  return count === 1 ? singular : pluralLabel;
}

function periodLabel(): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function AttentionCard({
  href,
  label,
  value,
  detail,
  icon: Icon,
  loading,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  loading?: boolean;
  tone?: "warning" | "success" | "muted";
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          )}
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
        <span
          className={cn(
            "rounded-md border p-2 text-muted-foreground transition-colors group-hover:text-foreground",
            tone === "warning" && "bg-warning/10 text-warning",
            tone === "success" && "bg-success/10 text-success",
            tone === "muted" && "bg-muted",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

function WorkspaceShortcut({ workspace }: { workspace: WorkspaceCardModel }) {
  const Icon = workspace.icon;

  return (
    <Link
      href={workspace.href}
      aria-label={`Open ${workspace.title} workspace`}
      title={`Open ${workspace.title}`}
      className="group flex min-h-14 items-center gap-2.5 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
        {workspace.title}
      </span>
    </Link>
  );
}

function PinnedItems({ items }: { items: RecentItem[] }) {
  if (items.length === 0) return null;

  return (
    <section>
      <SectionLabel>Pinned</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="inline-flex max-w-full items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent/40"
          >
            <Pin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{item.label}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {timeAgo(item.visitedAt)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { bff, runtime } = useShellSession();
  const { data: inboxData, isLoading: inboxLoading } = useInbox();
  const { data: activityData, isLoading: activityLoading } = useRecentActivity(12);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    const refreshRecentItems = () => setRecentItems(getRecentItems());
    refreshRecentItems();
    window.addEventListener(RECENT_ITEMS_CHANGED_EVENT, refreshRecentItems);
    window.addEventListener("storage", refreshRecentItems);
    return () => {
      window.removeEventListener(RECENT_ITEMS_CHANGED_EVENT, refreshRecentItems);
      window.removeEventListener("storage", refreshRecentItems);
    };
  }, []);

  const workspaceCards = useMemo<WorkspaceCardModel[]>(() => {
    return PORTAL_WORKSPACES[PHASE_ONE_DEFAULT_PORTAL];
  }, []);

  const activeOrgEntry = bff.activeOrg ? bff.organizations[bff.activeOrg] : null;
  const activeOrgParts = bff.activeOrg ? parseOrgAlias(bff.activeOrg) : null;
  const welcomeName = activeOrgEntry?.name ?? firstName(bff.displayName);
  const workbenchLabel = getWorkbenchLabel(PHASE_ONE_DEFAULT_PORTAL);
  const tenantStatus = [
    activeOrgEntry?.name ?? runtime?.entity.name ?? activeOrgParts?.entity,
    `Period ${periodLabel()}`,
    `${workbenchLabel} workspace`,
  ]
    .filter(Boolean)
    .join(" - ");

  const inboxItems = inboxData?.data ?? [];
  const myWorkCount = inboxItems.filter((item) =>
    ["pending", "delegated", "timed_out"].includes(item.work_item.status),
  ).length;
  const approvalCount = inboxItems.filter((item) => item.work_item.status === "pending").length;
  const exceptionCount = inboxItems.filter((item) =>
    item.work_item.status === "timed_out" || (item.priority ?? 0) >= 8,
  ).length;
  const pinnedItems = recentItems.filter((item) => item.pinned).slice(0, 8);

  return (
    <PageFrame
      title={`Welcome, ${welcomeName}`}
      description={tenantStatus || "Open a workspace to begin"}
      width="full"
    >
      <div className="space-y-6">
        <section>
          <SectionLabel>My attention</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AttentionCard
              href="/inbox"
              label="My Work"
              value={myWorkCount}
              detail={`${myWorkCount} ${plural(myWorkCount, "open item", "open items")}`}
              icon={Inbox}
              loading={inboxLoading}
            />
            <AttentionCard
              href="/inbox?tab=approvals"
              label="Approvals"
              value={approvalCount}
              detail={`${approvalCount} waiting`}
              icon={CheckCircle2}
              loading={inboxLoading}
              tone="success"
            />
            <AttentionCard
              href="/inbox?filter=exceptions"
              label="Exceptions"
              value={exceptionCount}
              detail={`${exceptionCount} need review`}
              icon={AlertTriangle}
              loading={inboxLoading}
              tone={exceptionCount > 0 ? "warning" : "muted"}
            />
            <AttentionCard
              href="#recent-activity"
              label="Recent"
              value={recentItems.length}
              detail={`${recentItems.length} viewed`}
              icon={Clock3}
              tone="muted"
            />
          </div>
        </section>

        <section>
          <SectionLabel>Workspaces</SectionLabel>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {workspaceCards.map((workspace) => (
              <WorkspaceShortcut key={workspace.key} workspace={workspace} />
            ))}
          </div>
        </section>

        <PinnedItems items={pinnedItems} />

        <Card id="recent-activity">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="space-y-2 py-2">
                {[...Array(4)].map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <ActivityFeed entries={activityData?.data ?? []} />
            )}
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}
