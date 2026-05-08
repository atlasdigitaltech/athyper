"use client";

/**
 * NotifPanel — notification dropdown panel.
 *
 * Shows in a portal overlay anchored to the bell button.
 * All/Unread tabs with mark-as-read per item and mark-all-read.
 * Live updates via useNotificationStream (mounted in AppTopbar).
 */

import { useEffect, useRef, useState } from "react";
import { Bell, ExternalLink, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Badge, Button } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { bffFetch } from "@/lib/bff-fetch";

// ── Types — matches GET /api/notifications response ──────────────────────────

interface NotifItem {
  id:          string;
  message_id:  string;
  subject:     string | null;
  event_code:  string;
  entity_type: string | null;
  entity_id:   string | null;
  priority:    string;
  is_read:     boolean;
  read_at:     string | null;
  created_at:  string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function eventLabel(code: string): string {
  return code
    .replace(/^[a-z]+\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function relativeTime(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days  > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins  > 0) return `${mins}m ago`;
  return "just now";
}

function entityHref(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  return `/app/${type}/${id}`;
}

// ── Data hooks ────────────────────────────────────────────────────────────────

function useNotifItems() {
  return useQuery<{ data: NotifItem[]; hasMore: boolean }>({
    queryKey: ["notifications", "panel"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/notifications?limit=20", { signal });
      if (!res.ok) return { data: [], hasMore: false };
      return res.json() as Promise<{ data: NotifItem[]; hasMore: boolean }>;
    },
    staleTime: 30_000,
    refetchInterval: 300_000, // SSE stream invalidates as needed
    placeholderData: { data: [], hasMore: false },
  });
}

function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      bffFetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => bffFetch("/api/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface NotifPanelProps {
  open: boolean;
  onClose: () => void;
}

export function NotifPanel({ open, onClose }: NotifPanelProps) {
  const [tab, setTab] = useState<"all" | "unread">("all");
  const panelRef       = useRef<HTMLDivElement>(null);
  const queryClient    = useQueryClient();
  const { data, isLoading } = useNotifItems();
  const markRead  = useMarkRead();
  const markAll   = useMarkAllRead();

  // Refetch when panel opens
  useEffect(() => {
    if (open) void queryClient.invalidateQueries({ queryKey: ["notifications", "panel"] });
  }, [open, queryClient]);

  const items       = data?.data ?? [];
  const unreadCount = items.filter((n) => !n.is_read).length;
  const visible     = tab === "unread" ? items.filter((n) => !n.is_read) : items;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-1 w-96 rounded-xl border bg-background shadow-xl z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-doc-support px-1.5 py-0.5">
              {unreadCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={() => markAll.mutate()}
              className="text-doc-subtitle text-primary hover:text-primary/80 transition-colors"
            >
              Mark all read
            </button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 py-2 border-b">
        {(["all", "unread"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "text-xs px-3 py-1 rounded-full transition-colors",
              tab === t
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "all" ? "All" : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center">
            <Bell className="mx-auto h-7 w-7 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">
              {tab === "unread" ? "All caught up" : "No notifications"}
            </p>
          </div>
        ) : (
          visible.map((n) => {
            const href = entityHref(n.entity_type, n.entity_id);
            return (
              <div
                key={n.id}
                onClick={() => { if (!n.is_read) markRead.mutate(n.id); }}
                className={cn(
                  "px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors",
                  !n.is_read && "bg-primary/5",
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.is_read && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                  <div className={cn("flex-1 min-w-0", n.is_read && "pl-3.5")}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">
                        {n.subject ?? eventLabel(n.event_code)}
                      </p>
                      {href && (
                        <Link
                          href={href}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="text-doc-support text-muted-foreground/60 font-mono">
                        {eventLabel(n.event_code)}
                      </span>
                      {n.priority !== "normal" && (
                        <Badge
                          variant={n.priority === "urgent" || n.priority === "high" ? "destructive" : "secondary"}
                          className="text-doc-field-label px-1 py-0 leading-tight"
                        >
                          {n.priority}
                        </Badge>
                      )}
                    </div>
                    <p className="text-doc-support text-muted-foreground/60 mt-1">
                      {relativeTime(n.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer — view all link */}
      <div className="border-t px-4 py-2.5 text-center">
        <Link
          href="/notifications"
          onClick={onClose}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          View all notifications
        </Link>
      </div>
    </div>
  );
}
