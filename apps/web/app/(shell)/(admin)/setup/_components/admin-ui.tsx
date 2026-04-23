"use client";

/**
 * Shared admin-page UI utilities
 *
 * Centralises the repetitive patterns across all /setup/* admin pages:
 *   StatusPill      — coloured status badge (active / inactive / deprecated / etc.)
 *   EmptyState      — centred icon + heading + sub-text for empty lists
 *   ConfirmDialog   — generic "are you sure?" AlertDialog (delete / destructive)
 *   SearchInput     — input with magnifier + clear × button
 *   SectionHeader   — page-section heading row (icon + title + description + action slot)
 *   ItemCount       — small "N items" caption
 *   useRelay        — thin fetch wrapper that goes through /api/relay/* BFF
 *   useRelayQuery   — React-Query useQuery wrapper via relay
 *   useRelayMut     — React-Query useMutation wrapper via relay
 *   relayFetch      — plain async fetch helper (for ad-hoc calls outside hooks)
 *   fmtDate         — locale date string
 *   fmtDateTime     — locale date-time string
 *   slugify         — convert label to lowercase_slug
 */

import { useCallback, type ReactNode } from "react";
import {
  useQuery, useMutation, useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { getCsrfToken } from "@/lib/bff-fetch";
import { Search, X, AlertTriangle, type LucideIcon } from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
  Input, Badge, Button,
} from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors, adminStatusIntent } from "@athyper/theme";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StatusValue =
  | "active" | "inactive" | "deprecated" | "enabled" | "disabled"
  | "healthy" | "degraded" | "down"
  | "pending" | "draft" | "published" | "archived";

// ─── StatusPill ───────────────────────────────────────────────────────────────

export function StatusPill({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const { subtleBadge } = resolveSemanticColors(adminStatusIntent(value));
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize",
        subtleBadge,
        className,
      )}
    >
      {label ?? value}
    </span>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed py-14 text-center px-6",
        className
      )}
    >
      {icon}
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground/70 max-w-xs mx-auto">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

// ─── ConfirmDialog ────────────────────────────────────────────────────────────

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  variant = "destructive",
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: "destructive" | "default";
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" />
            {title}
          </AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={variant === "destructive" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── SearchInput ──────────────────────────────────────────────────────────────

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
      <Input
        className="pl-8 pr-8 h-8 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => onChange("")}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

export function SectionHeader({
  icon: Icon,
  title,
  description,
  count,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  count?: number;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="size-5 text-primary shrink-0" />}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{title}</h1>
            {count !== undefined && (
              <Badge variant="secondary" className="text-[10px] px-1.5">{count}</Badge>
            )}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─── ItemCount ────────────────────────────────────────────────────────────────

export function ItemCount({ count, label = "item" }: { count: number; label?: string }) {
  return (
    <span className="text-xs text-muted-foreground">
      {count} {count === 1 ? label : `${label}s`}
    </span>
  );
}

// ─── CodeBadge ────────────────────────────────────────────────────────────────

export function CodeBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-xs bg-muted/60 border px-1.5 py-0.5 rounded text-muted-foreground", className)}>
      {children}
    </span>
  );
}

// ─── Relay fetch helpers ──────────────────────────────────────────────────────

export async function relayFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = path.startsWith("/api/relay") ? path : `/api/relay${path.startsWith("/") ? "" : "/"}${path}`;
  const method = (init?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (method !== "GET") {
    headers["X-CSRF-Token"] = getCsrfToken();
  }
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

export function useRelay() {
  const get  = useCallback(<T,>(path: string) => relayFetch<T>(path), []);
  const post = useCallback(<T,>(path: string, body: AnyRecord) =>
    relayFetch<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), []);
  const patch = useCallback(<T,>(path: string, body: AnyRecord) =>
    relayFetch<T>(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), []);
  const del = useCallback(<T,>(path: string) =>
    relayFetch<T>(path, { method: "DELETE" }), []);
  return { get, post, patch, del };
}

export function useRelayQuery<T>(
  queryKey: unknown[],
  path: string,
  options?: Omit<UseQueryOptions<T>, "queryKey" | "queryFn">,
) {
  return useQuery<T>({
    queryKey,
    queryFn: () => relayFetch<T>(path),
    staleTime: 30_000,
    ...options,
  });
}

export function useRelayMut<TData = unknown, TVariables = AnyRecord>(
  mutFn: (vars: TVariables) => Promise<TData>,
  options?: Omit<UseMutationOptions<TData, Error, TVariables>, "mutationFn">,
) {
  return useMutation<TData, Error, TVariables>({ mutationFn: mutFn, ...options });
}

export { useQueryClient };

// ─── Utilities ────────────────────────────────────────────────────────────────

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

// ─── LoadingRows ──────────────────────────────────────────────────────────────

export function LoadingRows({ rows = 4, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="h-9 rounded bg-muted/50 animate-pulse"
              style={{ flex: j === 0 ? "0 0 120px" : 1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
