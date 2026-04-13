"use client";

/**
 * Notification Center — /notifications
 *
 * Lists in-app notifications for the current principal.
 * Data: GET /api/notifications  (proxies to runtime /api/platform/notifications)
 * Actions: mark as read (individual + all)
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, CheckCheck, ExternalLink } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { Badge, Button, Skeleton } from "@athyper/ui/primitives";
import { bffFetch } from "@/lib/bff-fetch";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotificationItem {
  id: string;
  message_id: string;
  subject: string | null;
  event_code: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  priority: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useNotifications(unreadOnly: boolean) {
  return useQuery<{ data: NotificationItem[]; hasMore: boolean }>({
    queryKey: ["notifications", "list", unreadOnly],
    queryFn: async () => {
      const p = new URLSearchParams({ limit: "50" });
      if (unreadOnly) p.set("unread", "true");
      const res = await fetch(`/api/notifications?${p}`);
      if (!res.ok) return { data: [], hasMore: false };
      return res.json() as Promise<{ data: NotificationItem[]; hasMore: boolean }>;
    },
    staleTime: 20 * 1000,
    refetchInterval: 60 * 1000,
  });
}

function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) =>
      bffFetch(`/api/notifications/${encodeURIComponent(deliveryId)}/read`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => bffFetch("/api/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRelative(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days  > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins  > 0) return `${mins}m ago`;
  return "just now";
}

function priorityVariant(priority: string) {
  if (priority === "urgent" || priority === "critical") return "destructive";
  if (priority === "high") return "warning";
  return "secondary";
}

function eventLabel(code: string): string {
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Maps known entity types to their runtime route under /app/[entity].
 * Both master and document entity types now live under /app/[entity].
 */
function entityHref(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  return `/app/${type}/${id}`;
}

// ── Components ────────────────────────────────────────────────────────────────

function NotificationRow({
  item,
  onMarkRead,
  isMarking,
}: {
  item: NotificationItem;
  onMarkRead(): void;
  isMarking: boolean;
}) {
  const href = entityHref(item.entity_type, item.entity_id);

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${item.is_read ? "bg-background" : "bg-primary/5 border-primary/20"}`}>
      <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.is_read ? "bg-muted-foreground/30" : "bg-primary"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <p className={`text-sm ${item.is_read ? "font-normal" : "font-medium"}`}>
            {item.subject ?? eventLabel(item.event_code)}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
            {fmtRelative(item.created_at)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px]">{eventLabel(item.event_code)}</Badge>
          {item.priority !== "normal" && (
            <Badge variant={priorityVariant(item.priority)} className="text-[10px] capitalize">{item.priority}</Badge>
          )}
          {item.entity_type && (
            <span className="text-xs text-muted-foreground font-mono">{item.entity_type}</span>
          )}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-1">
        {href && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
            <Link href={href}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
        {!item.is_read && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onMarkRead}
            loading={isMarking}
            disabled={isMarking}
          >
            Mark read
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading } = useNotifications(unreadOnly);
  const markRead    = useMarkRead();
  const markAllRead = useMarkAllRead();
  const queryClient = useQueryClient();

  const notifications = data?.data ?? [];
  const unreadCount   = notifications.filter((n) => !n.is_read).length;

  return (
    <PageFrame
      title="Notifications"
      description="In-app alerts and workflow events"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant={unreadOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setUnreadOnly((v) => !v)}
          >
            <BellOff className="mr-1.5 h-3.5 w-3.5" />
            Unread only
            {unreadCount > 0 && !unreadOnly && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">{unreadCount}</Badge>
            )}
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              loading={markAllRead.isPending}
            >
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>
      }
    >
      <div className="max-w-3xl space-y-2">
        {isLoading ? (
          [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
            <Bell className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              {unreadOnly ? "No unread notifications" : "No notifications"}
            </p>
            <p className="text-xs text-muted-foreground/70">
              Workflow events, approvals, and system alerts will appear here.
            </p>
            {unreadOnly && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setUnreadOnly(false)}>
                Show all
              </Button>
            )}
          </div>
        ) : (
          <>
            {notifications.map((n) => (
              <NotificationRow
                key={n.id}
                item={n}
                onMarkRead={() => markRead.mutate(n.id)}
                isMarking={markRead.isPending && markRead.variables === n.id}
              />
            ))}
            {data?.hasMore && (
              <p className="pt-2 text-center text-xs text-muted-foreground">
                Showing 50 most recent. Use filters to narrow results.
              </p>
            )}
          </>
        )}
      </div>
    </PageFrame>
  );
}
