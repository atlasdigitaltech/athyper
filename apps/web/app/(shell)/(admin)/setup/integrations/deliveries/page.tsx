"use client";

/**
 * Delivery Monitoring — /setup/integrations/deliveries
 *
 * Read-only view of notification delivery records.
 * Date-bounded query (default 7 days, max 30 days) to prevent full-table scans.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Activity } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import {
  Button, Badge, Skeleton,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@athyper/ui/primitives";
import { IntegrationSubNav } from "../_components/integration-sub-nav";

// ── Types ─────────────────────────────────────────────────────────────────────

type DeliveryStatus = "queued" | "sent" | "delivered" | "bounced" | "failed" | "cancelled";

interface DeliveryRecord {
  id: string;
  channel: string;
  recipientRef: string;
  status: DeliveryStatus;
  attempts: number;
  sentAt: string | null;
  deliveredAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<DeliveryStatus, "warning" | "muted" | "success" | "destructive" | "outline"> = {
  queued: "outline", sent: "warning", delivered: "success",
  bounced: "destructive", failed: "destructive", cancelled: "muted",
};

const WINDOW_OPTIONS = [
  { label: "Last 24 hours", days: 1 },
  { label: "Last 7 days",   days: 7 },
  { label: "Last 14 days",  days: 14 },
  { label: "Last 30 days",  days: 30 },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DeliveriesPage() {
  const [windowDays, setWindowDays] = useState(7);
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | "">("");
  const [refreshKey, setRefreshKey] = useState(0);

  const from = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const to = new Date().toISOString();

  const params = new URLSearchParams({ from, to, limit: "100" });
  if (statusFilter) params.set("status", statusFilter);

  const { data, isLoading } = useQuery<{ data: DeliveryRecord[] }>({
    queryKey: ["integration-deliveries", windowDays, statusFilter, refreshKey],
    queryFn: async () => {
      const res = await fetch(`/api/integration/deliveries?${params.toString()}`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 20_000,
  });
  const records = data?.data ?? [];

  // Summary counts
  const counts = records.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1; return acc;
  }, {} as Record<string, number>);

  return (
    <PageFrame
      title="Delivery Monitoring"
      description="Read-only view of notification delivery activity"
      actions={
        <Button variant="ghost" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      }
    >
      <IntegrationSubNav active="/setup/integrations/deliveries" />

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
          <SelectTrigger className="h-8 w-40 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WINDOW_OPTIONS.map((o) => (
              <SelectItem key={o.days} value={String(o.days)}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as DeliveryStatus | "")}>
          <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            {(["queued", "sent", "delivered", "bounced", "failed", "cancelled"] as DeliveryStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary pills */}
      {!isLoading && records.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(counts).map(([status, count]) => (
            <div key={status} className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5">
              <Badge variant={STATUS_VARIANT[status as DeliveryStatus] ?? "outline"} className="text-[9px] px-1">{status}</Badge>
              <span className="text-xs font-medium">{count}</span>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : records.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-8 w-8 text-muted-foreground/30" />}
          title="No delivery records in the selected window."
          className="py-16"
        />
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-[10px] text-muted-foreground uppercase tracking-wider">
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 pr-3 font-medium">Channel</th>
                <th className="pb-2 pr-3 font-medium">Recipient</th>
                <th className="pb-2 pr-3 font-medium">Attempts</th>
                <th className="pb-2 pr-3 font-medium">Sent At</th>
                <th className="pb-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3">
                    <Badge variant={STATUS_VARIANT[r.status]} className="text-[10px]">{r.status}</Badge>
                  </td>
                  <td className="py-2 pr-3 font-mono text-[10px]">{r.channel}</td>
                  <td className="py-2 pr-3 max-w-[160px] truncate text-muted-foreground">{r.recipientRef}</td>
                  <td className="py-2 pr-3 text-center">{r.attempts}</td>
                  <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                    {r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}
                  </td>
                  <td className="py-2 max-w-[200px] truncate text-destructive">
                    {r.errorMessage ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageFrame>
  );
}
