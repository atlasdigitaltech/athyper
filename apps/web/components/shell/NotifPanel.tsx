"use client";

/**
 * NotifPanel — notification dropdown panel.
 *
 * Shows in a portal overlay anchored to the bell button.
 * All/Unread tabs with mark-as-read per item and mark-all-read.
 * Fetches notifications via the relay (useNotifications hook from @athyper/query).
 */

import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { bffFetch } from "@/lib/bff-fetch";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotifItem {
  id: string;
  title: string;
  body: string;
  module_code?: string;
  read: boolean;
  created_at: string;
}

// ── Data hooks ────────────────────────────────────────────────────────────────

function useNotifItems() {
  return useQuery<{ data: NotifItem[] }>({
    queryKey: ["notifications", "panel"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/notifications?limit=20", { signal });
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: NotifItem[] }>;
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    placeholderData: { data: [] },
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
  const panelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { data, isLoading } = useNotifItems();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  // Refetch when panel opens so count is fresh
  useEffect(() => {
    if (open) void queryClient.invalidateQueries({ queryKey: ["notifications", "panel"] });
  }, [open, queryClient]);

  const items = data?.data ?? [];
  const unreadCount = items.filter((n) => !n.read).length;
  const visible = tab === "unread" ? items.filter((n) => !n.read) : items;

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
      className={cn(
        "absolute right-0 top-full mt-1 w-96 rounded-xl border bg-background shadow-xl z-50 overflow-hidden",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">
              {unreadCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={() => markAll.mutate()}
              className="text-[11px] text-primary hover:text-primary/80 transition-colors"
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
              tab === t ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "all" ? "All" : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="max-h-72 overflow-y-auto divide-y divide-border/50">
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
          visible.map((n) => (
            <div
              key={n.id}
              onClick={() => { if (!n.read) markRead.mutate(n.id); }}
              className={cn(
                "px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors",
                !n.read && "bg-primary/5",
              )}
            >
              <div className="flex items-start gap-2">
                {!n.read && (
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                )}
                <div className={cn("flex-1 min-w-0", n.read && "pl-3.5")}>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    {n.module_code && (
                      <span className="shrink-0 font-mono text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {n.module_code}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
