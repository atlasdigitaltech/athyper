"use client";

/**
 * HomeKpiRow — live KPI tiles for the workbench home pages.
 *
 * Fetches inbox count + notification count from BFF.
 * Falls back to "—" on loading or error.
 */

import { Bell, CheckCircle2, Clock, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { useShellSession } from "@/components/providers/SessionProvider";
import { KpiCard } from "./KpiCard";

// ── BFF hooks ─────────────────────────────────────────────────────────────────
// `enabled` gates the fetch on entity context being set.
// Without an active org the runtime rejects the request — there is no point
// firing it, and doing so causes an aborted-fetch red X in DevTools.

function useInboxCountBff(enabled: boolean) {
  return useQuery<{ count: number }>({
    queryKey: ["workflow-inbox", "count", "home"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/workflow/inbox-count", { signal, cache: "no-store" });
      if (!res.ok) return { count: 0 };
      return res.json() as Promise<{ count: number }>;
    },
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    throwOnError: false,
    placeholderData: { count: 0 },
  });
}

function useUnreadCountBff(enabled: boolean) {
  return useQuery<{ count: number }>({
    queryKey: ["notifications", "unread-count"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/notifications/unread-count", { signal, cache: "no-store" });
      if (!res.ok) return { count: 0 };
      return res.json() as Promise<{ count: number }>;
    },
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    throwOnError: false,
    placeholderData: { count: 0 },
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HomeKpiRow() {
  const { bff } = useShellSession();
  // Only fetch once the entity context is set — before that the runtime rejects
  // the request and the fetch gets aborted, which DevTools shows as red X.
  const hasContext = !!bff.activeOrg;
  const inbox = useInboxCountBff(hasContext);
  const unread = useUnreadCountBff(hasContext);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title="Pending Approvals"
        value={inbox.data?.count ?? "—"}
        sub="tasks awaiting your action"
        Icon={Clock}
        iconClass="text-warning"
        loading={inbox.isLoading}
      />
      <KpiCard
        title="Completed Today"
        value="—"
        sub="documents processed"
        Icon={CheckCircle2}
        iconClass="text-success"
      />
      <KpiCard
        title="Notifications"
        value={unread.data?.count ?? "—"}
        sub="unread alerts"
        Icon={Bell}
        iconClass="text-info"
        loading={unread.isLoading}
      />
      <KpiCard
        title="Open Documents"
        value="—"
        sub="in-progress"
        Icon={FileText}
        iconClass="text-primary"
      />
    </div>
  );
}
