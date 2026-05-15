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
import { useIntl } from "@/components/providers/IntlProvider";
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
  /** Message ID for the workspace label (resolved via formatMessage). */
  titleId: string;
  icon: LucideIcon;
}

const WORKBENCH_LABEL_IDS: Record<string, string> = {
  user:    "shell.workbench.label.user",
  partner: "shell.workbench.label.partner",
  admin:   "shell.workbench.label.admin",
};

type PortalType = "user" | "partner" | "admin";

const PHASE_ONE_DEFAULT_PORTAL: PortalType = "user";

// Phase 1: landing workspace display always falls back to the User portal.
// Phase 2 can replace this with IAM/KC portal plus tenant subscription filtering.
const PORTAL_WORKSPACES: Record<PortalType, WorkspaceCardModel[]> = {
  user: [
    {
      key: "finance",
      href: "/finance",
      titleId: "home.workspace.finance",
      icon: Building2,
    },
    {
      key: "supply-chain",
      href: "/supply-chain",
      titleId: "home.workspace.supplyChain",
      icon: Package,
    },
    {
      key: "customer-experience",
      href: "/customer-experience",
      titleId: "home.workspace.salesCrm",
      icon: ShoppingBag,
    },
    {
      key: "people-management",
      href: "/people",
      titleId: "home.workspace.people",
      icon: Users,
    },
    {
      key: "project-management",
      href: "/projects",
      titleId: "home.workspace.projects",
      icon: FolderKanban,
    },
    {
      key: "manufacturing-operations",
      href: "/manufacturing",
      titleId: "home.workspace.manufacturing",
      icon: Factory,
    },
    {
      key: "asset-management",
      href: "/asset-management",
      titleId: "home.workspace.assetsFacilities",
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
  const { formatMessage } = useIntl();
  const title = formatMessage({ id: workspace.titleId }) as string;

  return (
    <Link
      href={workspace.href}
      aria-label={title}
      title={title}
      className="group flex min-h-14 items-center gap-2.5 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
        {title}
      </span>
    </Link>
  );
}

function PinnedItems({ items }: { items: RecentItem[] }) {
  const { formatMessage } = useIntl();
  if (items.length === 0) return null;

  return (
    <section>
      <SectionLabel>{formatMessage({ id: "home.section.pinned" })}</SectionLabel>
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
  const { formatMessage } = useIntl();
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
  const workbenchLabelKey = WORKBENCH_LABEL_IDS[PHASE_ONE_DEFAULT_PORTAL];
  const workbenchLabel = workbenchLabelKey
    ? (formatMessage({ id: workbenchLabelKey }) as string)
    : getWorkbenchLabel(PHASE_ONE_DEFAULT_PORTAL);
  const tenantStatus = [
    activeOrgEntry?.name ?? runtime?.entity.name ?? activeOrgParts?.entity,
    formatMessage({ id: "home.period" }, { label: periodLabel() }) as string,
    formatMessage({ id: "home.workbenchSuffix" }, { label: workbenchLabel }) as string,
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
      title={formatMessage({ id: "home.welcome" }, { name: welcomeName }) as string}
      description={tenantStatus || (formatMessage({ id: "home.openWorkspace" }) as string)}
      width="full"
    >
      <div className="space-y-6">
        <section>
          <SectionLabel>{formatMessage({ id: "home.section.attention" })}</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AttentionCard
              href="/inbox"
              label={formatMessage({ id: "home.card.myWork" }) as string}
              value={myWorkCount}
              detail={formatMessage({ id: "home.card.myWork.detail" }, { count: myWorkCount }) as string}
              icon={Inbox}
              loading={inboxLoading}
            />
            <AttentionCard
              href="/inbox?tab=approvals"
              label={formatMessage({ id: "home.card.approvals" }) as string}
              value={approvalCount}
              detail={formatMessage({ id: "home.card.approvals.detail" }, { count: approvalCount }) as string}
              icon={CheckCircle2}
              loading={inboxLoading}
              tone="success"
            />
            <AttentionCard
              href="/inbox?filter=exceptions"
              label={formatMessage({ id: "home.card.exceptions" }) as string}
              value={exceptionCount}
              detail={formatMessage({ id: "home.card.exceptions.detail" }, { count: exceptionCount }) as string}
              icon={AlertTriangle}
              loading={inboxLoading}
              tone={exceptionCount > 0 ? "warning" : "muted"}
            />
            <AttentionCard
              href="#recent-activity"
              label={formatMessage({ id: "home.card.recent" }) as string}
              value={recentItems.length}
              detail={formatMessage({ id: "home.card.recent.detail" }, { count: recentItems.length }) as string}
              icon={Clock3}
              tone="muted"
            />
          </div>
        </section>

        <section>
          <SectionLabel>{formatMessage({ id: "home.section.workspaces" })}</SectionLabel>
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
              {formatMessage({ id: "home.section.recentActivity" })}
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
