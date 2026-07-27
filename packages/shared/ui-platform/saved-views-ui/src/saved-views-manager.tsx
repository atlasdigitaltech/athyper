"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive, Copy, ExternalLink, Loader2, Pin, RefreshCw, Share2, Star, Trash2,
} from "lucide-react";
import type { MeSavedView, MeSavedViewAction } from "@athyper/api-contracts/me";
import { Badge, Button, Skeleton } from "@athyper/ui/primitives";
import { emitSurfaceEvent } from "@athyper/runtime-shared/observability";

export type SavedViewsFetch = <T = unknown>(
  path: string,
  init?: {
    method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  },
) => Promise<T>;

export interface SavedViewsManagerProps {
  fetcher: SavedViewsFetch;
  plane: "admin" | "neon" | "mesh";
  navigate: (href: string) => void;
}

function targetHref(view: MeSavedView): string | null {
  const target = view.target;
  if (target.plane !== view.plane_key) return null;
  if (target.routeName?.startsWith("/")) {
    const query = new URLSearchParams(target.parameters ?? {});
    return `${target.routeName}${query.size ? `?${query}` : ""}`;
  }
  if (target.entityCode) {
    const query = new URLSearchParams({ savedView: view.id, ...(target.parameters ?? {}) });
    return `/app/${encodeURIComponent(target.entityCode)}?${query}`;
  }
  return null;
}

export function SavedViewCard({
  view,
  onAction,
  onClone,
  onOpen,
}: {
  view: MeSavedView;
  onAction: (view: MeSavedView, action: MeSavedViewAction) => Promise<void>;
  onClone: (view: MeSavedView) => Promise<void>;
  onOpen: (view: MeSavedView) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (code: string, operation: () => Promise<void>) => {
    setBusy(code);
    try { await operation(); } finally { setBusy(null); }
  };
  const capabilities = view.capabilities;
  const actions: Array<{
    code: MeSavedViewAction;
    label: string;
    allowed: boolean;
    icon: typeof Pin;
  }> = [
    { code: "pin", label: view.is_pinned ? "Unpin" : "Pin", allowed: capabilities.canPin, icon: Pin },
    { code: "star", label: view.is_starred ? "Unstar" : "Star", allowed: capabilities.canEdit, icon: Star },
    { code: "share", label: view.is_shared ? "Unshare" : "Share", allowed: capabilities.canShare, icon: Share2 },
    { code: "archive", label: "Archive", allowed: capabilities.canArchive, icon: Archive },
    { code: "delete", label: "Delete", allowed: capabilities.canDelete, icon: Trash2 },
  ];

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{view.name}</h2>
            <Badge variant="outline" className="text-xs capitalize">{view.scope}</Badge>
            <Badge variant="secondary" className="text-xs">{view.target.surface}</Badge>
          </div>
          {view.description && <p className="mt-1 text-sm text-muted-foreground">{view.description}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            {view.plane_key} · {view.module_code || "general"}
          </p>
        </div>
        {capabilities.canOpen && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpen(view)}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open
          </Button>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.filter((action) => action.allowed).map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.code}
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={busy !== null}
              onClick={() => void run(action.code, () => onAction(view, action.code))}
            >
              {busy === action.code
                ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                : <Icon className="h-3 w-3" aria-hidden />}
              {action.label}
            </Button>
          );
        })}
        {capabilities.canCloneToPersonal && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={busy !== null}
            onClick={() => void run("clone", () => onClone(view))}
          >
            {busy === "clone"
              ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              : <Copy className="h-3 w-3" aria-hidden />}
            Clone to personal
          </Button>
        )}
      </div>
    </article>
  );
}

export function SavedViewsManager({ fetcher, plane, navigate }: SavedViewsManagerProps) {
  const [views, setViews] = useState<MeSavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setViews(await fetcher<MeSavedView[]>("/api/me/saved-views"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Saved views could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(
    () => views.filter((view) => !view.is_archived && view.plane_key === plane),
    [plane, views],
  );

  const action = async (view: MeSavedView, code: MeSavedViewAction) => {
    await fetcher(`/api/me/saved-views/${view.id}/${code}`, { method: code === "delete" ? "DELETE" : "PATCH" });
    await load();
  };
  const clone = async (view: MeSavedView) => {
    await fetcher(`/api/me/saved-views/${view.id}/clone`, { method: "POST" });
    await load();
  };
  const open = (view: MeSavedView) => {
    const href = targetHref(view);
    if (href) {
      emitSurfaceEvent({
        name: "saved_view_opened",
        plane,
        scopeType: plane === "mesh" ? "network_account" : plane === "admin" ? "platform" : "tenant",
        surfaceCode: "saved-views.manager",
        route: href,
        durationMs: 0,
        result: "success",
      });
      navigate(href);
    }
  };

  if (loading) return <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>;
  if (error) return (
    <div role="alert" className="rounded-lg border border-destructive/40 p-4">
      <p className="text-sm text-destructive">{error}</p>
      <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => void load()}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
      </Button>
    </div>
  );
  if (!visible.length) return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No saved views are available for this plane.</p>;

  return <div className="space-y-3">{visible.map((view) => (
    <SavedViewCard key={view.id} view={view} onAction={action} onClone={clone} onOpen={open} />
  ))}</div>;
}

export interface SavedViewsSummaryProps {
  fetcher: SavedViewsFetch;
  href?: string;
}

export function SavedViewsSummary({ fetcher, href = "/saved-views" }: SavedViewsSummaryProps) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let mounted = true;
    fetcher<MeSavedView[]>("/api/me/saved-views")
      .then((views) => { if (mounted) setCount(views.filter((view) => !view.is_archived).length); })
      .catch(() => { if (mounted) setCount(0); });
    return () => { mounted = false; };
  }, [fetcher]);

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Saved views</p>
        <p className="text-xs text-muted-foreground">{count == null ? "Loading…" : `${count} active view${count === 1 ? "" : "s"}`}</p>
      </div>
      <a className="text-sm font-medium text-primary hover:underline" href={href}>Manage saved views</a>
    </div>
  );
}
