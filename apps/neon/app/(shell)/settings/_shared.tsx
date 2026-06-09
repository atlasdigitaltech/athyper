"use client";

import { useState, useRef, useEffect, type ElementType, type ReactNode } from "react";
import {
  Check, Copy, Info, AlertTriangle, CheckCircle2, XCircle,
  Lock, Database, Server, User, Building2, Briefcase, HelpCircle,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  Badge, Button, Skeleton,
  overlayScrimVariants,
} from "@athyper/ui/primitives";
import { bffFetch } from "@/lib/bff-fetch";

// ─── Utilities ────────────────────────────────────────────────────────────────

export function str(v: unknown, fallback = "—"): string {
  if (v == null || v === "") return fallback;
  return String(v);
}

export function fmtDate(v: unknown): string {
  if (!v) return "—";
  try { return new Date(String(v)).toLocaleDateString(); } catch { return String(v); }
}

export function fmtDateTime(v: unknown): string {
  if (!v) return "—";
  try { return new Date(String(v)).toLocaleString(); } catch { return String(v); }
}

// ─── useSectionData ───────────────────────────────────────────────────────────

export function useSectionData<T>(active: boolean, url: string) {
  const [data,    setData]    = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!active || loaded.current) return;
    loaded.current = true;
    setLoading(true);
    bffFetch<T>(url)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [active, url]);

  return { data, loading, error };
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

type StatusKey =
  | "active"   | "verified" | "synced"  | "allow"  | "view"  | "plan"   | "all"
  | "trial"    | "drift"    | "delegation" | "own"
  | "suspended"| "error"    | "deny"
  | "system"   | "functional" | "enterprise" | "persona" | "shared" | "edit" | "team"
  | "pending"  | "disabled" | "inactive" | "member" | "personal"
  | "leader"   | "project"  | "virtual"  | "group"  | "principal";

const STATUS_VARIANT: Record<StatusKey, Parameters<typeof Badge>[0]["variant"]> = {
  active: "success", verified: "success", synced: "success", allow: "success",
  view: "success", plan: "success", all: "success",
  trial: "warning", drift: "warning", delegation: "warning", own: "warning",
  suspended: "destructive", error: "destructive", deny: "destructive",
  system: "info", functional: "info", enterprise: "info", persona: "info",
  shared: "info", edit: "info", team: "info",
  pending: "muted", disabled: "muted", inactive: "muted", member: "muted", personal: "muted",
  leader: "secondary", project: "secondary", virtual: "secondary", group: "secondary", principal: "secondary",
};

export function StatusBadge({ status, children, className }: {
  status: StatusKey | string;
  children: ReactNode;
  className?: string;
}) {
  const variant = STATUS_VARIANT[status as StatusKey] ?? "muted";
  return (
    <Badge variant={variant} className={cn("text-xs", className)}>
      {children}
    </Badge>
  );
}

// ─── SourceChip ───────────────────────────────────────────────────────────────

type SourceKey = "platform_default" | "tenant_profile" | "principal_ui_profile" | "principal_profile";

const SOURCE_META: Record<SourceKey, { label: string; Icon: ElementType }> = {
  platform_default:     { label: "Platform Default",   Icon: Server    },
  tenant_profile:       { label: "Tenant Default",     Icon: Building2 },
  principal_ui_profile: { label: "Personal Override",  Icon: User      },
  principal_profile:    { label: "Work Profile",       Icon: Briefcase },
};

export function SourceChip({ source }: { source: SourceKey | string }) {
  const meta = SOURCE_META[source as SourceKey];
  const Icon = meta?.Icon ?? Database;
  const label = meta?.label ?? source;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-2.5 w-2.5 shrink-0" />
      {label}
    </span>
  );
}

// ─── ManagedBy ────────────────────────────────────────────────────────────────

export interface ManagedByProps {
  manager?: string;
  source?: string;
  lastUpdated?: string;
  editPath?: string;
}

export function ManagedBy({ manager, source, lastUpdated, editPath }: ManagedByProps) {
  const parts: string[] = [];
  if (manager)     parts.push(`Managed by: ${manager}`);
  if (source)      parts.push(source);
  if (lastUpdated) { const d = fmtDate(lastUpdated); if (d !== "—") parts.push(`Updated: ${d}`); }
  if (editPath)    parts.push(editPath);
  return (
    <div className="mb-3.5 flex items-center gap-1.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
      <Lock className="h-2.5 w-2.5 shrink-0" />
      <span>{parts.join(" · ")}</span>
    </div>
  );
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────

export function InfoRow({ label, value, mono = false, hint, verified = false, copyable = false, source }: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  hint?: string;
  verified?: boolean;
  copyable?: boolean;
  source?: SourceKey | string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (typeof value === "string") void navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border py-2.5 last:border-0">
      <div className="flex shrink-0 flex-col gap-0.5">
        <span className="flex items-center gap-1 text-sm leading-5 text-muted-foreground">
          {label}
          {verified && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
          {hint && <span title={hint} className="cursor-help"><HelpCircle className="h-3 w-3 text-muted-foreground/60" /></span>}
        </span>
        {source && <SourceChip source={source} />}
      </div>
      <span className={cn("flex items-center gap-1.5 text-right text-sm leading-5 font-medium text-foreground", mono && "font-mono tabular-nums")}>
        {value ?? <span className="text-muted-foreground">—</span>}
        {copyable && typeof value === "string" && (
          <button type="button" onClick={copy} title="Copy" className="text-muted-foreground hover:text-foreground">
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </span>
    </div>
  );
}

// ─── SectionCard ─────────────────────────────────────────────────────────────

export function SectionCard({ title, icon: Icon, children, badge, note, managedBy }: {
  title: string;
  icon?: ElementType;
  children: ReactNode;
  badge?: ReactNode;
  note?: string;
  managedBy?: ManagedByProps;
}) {
  return (
    <div className="mb-4 w-full rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className="flex-1 text-sm font-medium text-foreground">{title}</span>
        {badge}
      </div>
      {note && (
        <div className="border-b border-border px-4 py-2">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3 shrink-0" />{note}
          </p>
        </div>
      )}
      <div className="px-4 py-4">
        {managedBy && <ManagedBy {...managedBy} />}
        {children}
      </div>
    </div>
  );
}

// ─── Banner ───────────────────────────────────────────────────────────────────

type BannerVariant = "info" | "warn" | "success" | "error";

const BANNER_CFG: Record<BannerVariant, { wrapper: string; iconClass: string; DefaultIcon: ElementType }> = {
  info:    { wrapper: "bg-accent border-border text-accent-foreground",       iconClass: "text-info",        DefaultIcon: Info },
  warn:    { wrapper: "bg-secondary border-border text-secondary-foreground", iconClass: "text-warning",     DefaultIcon: AlertTriangle },
  success: { wrapper: "bg-accent border-border text-accent-foreground",       iconClass: "text-success",     DefaultIcon: CheckCircle2 },
  error:   { wrapper: "bg-secondary border-border text-secondary-foreground", iconClass: "text-destructive", DefaultIcon: XCircle },
};

export function Banner({ variant = "info", icon: IconOverride, children }: {
  variant?: BannerVariant;
  icon?: ElementType;
  children: ReactNode;
}) {
  const { wrapper, iconClass, DefaultIcon } = BANNER_CFG[variant];
  const Icon = IconOverride ?? DefaultIcon;
  return (
    <div className={cn("mb-4 flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-sm leading-relaxed", wrapper)}>
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", iconClass)} />
      <div>{children}</div>
    </div>
  );
}

// ─── ToggleGroup ──────────────────────────────────────────────────────────────

export function ToggleGroup<T extends string>({ value, onChange, options, className }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; desc?: string }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex divide-x divide-input overflow-hidden rounded-md border border-input", className)}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex flex-col items-center justify-center px-4 py-2 text-xs font-medium transition-colors",
            value === opt.value
              ? "bg-foreground text-background"
              : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <span className="flex items-center gap-1.5">{opt.label}</span>
          {opt.desc && <span className="mt-0.5 text-xs opacity-70">{opt.desc}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── DataTable ────────────────────────────────────────────────────────────────

export function DataTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="w-full overflow-x-auto rounded-md border border-border">
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="sticky top-0 z-10 border-b border-border bg-muted">
            {columns.map((c, i) => (
              <th key={i} className="px-3 py-2.5 text-left align-middle text-sm font-medium text-muted-foreground">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i > 0 ? "border-t border-border" : ""}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2.5 align-middle text-sm text-foreground">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── SkeletonCard ─────────────────────────────────────────────────────────────

export function SkeletonCard({ lines = 4 }: { lines?: number }) {
  return (
    <div className="mb-4 w-full rounded-xl border border-border bg-card px-4 py-5 space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3 rounded", i % 3 === 0 ? "w-3/4" : i % 3 === 1 ? "w-1/2" : "w-2/3")} />
      ))}
    </div>
  );
}

// ─── ConfirmDialog ────────────────────────────────────────────────────────────

export interface ConfirmDialogAction {
  title: string;
  endpoint?: string;
  impact: ReactNode;
  scopeLabel: string;
  danger?: boolean;
  confirmText?: string;
}

export function ConfirmDialog({ action, onConfirm, onCancel }: {
  action: ConfirmDialogAction;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const canConfirm = !action.confirmText || typed === action.confirmText;
  return (
    <div
      className={cn("fixed inset-0 z-modal flex items-center justify-center", overlayScrimVariants({ tone: "command" }))}
      onClick={onCancel}
    >
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start gap-3">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", action.danger ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning")}>
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-medium text-foreground">{action.title}</h3>
            {action.endpoint && <p className="mt-0.5 font-mono text-xs text-muted-foreground">{action.endpoint}</p>}
          </div>
        </div>
        <div className="mb-4 rounded-md bg-muted px-3 py-3 text-xs leading-relaxed text-foreground">
          <p className="mb-1 font-medium">Impact</p>
          {action.impact}
        </div>
        <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          Scope: <Badge variant="secondary" className="text-xs">{action.scopeLabel}</Badge>
        </div>
        {action.confirmText && (
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Type <code className="font-mono font-medium text-destructive">{action.confirmText}</code> to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                typed === action.confirmText ? "border-success" : "border-input",
              )}
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" variant={action.danger ? "destructive" : "primary"} disabled={!canConfirm} onClick={onConfirm}>Execute</Button>
        </div>
      </div>
    </div>
  );
}
