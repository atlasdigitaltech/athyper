"use client";

/**
 * DiagnosticsSection
 *
 * Three-tier diagnostics console:
 *
 *   Tier 1 — User Recovery      (safe, no confirmation)
 *   Tier 2 — Tenant Operations  (admin, requires confirmation)
 *   Tier 3 — Platform Operations (elevated/destructive, typed confirmation)
 *
 * Also includes:
 *   SessionDebugConsole  — live session/BFF metadata, polls every 30 s
 *   ActionHistoryLog     — last 50 executed actions with correlation IDs
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, AlertTriangle, Archive, Check, ChevronDown, ChevronRight,
  ChevronUp, Clock, Copy, Download, ExternalLink, Loader2,
  RefreshCw, Server, Shield, ShieldAlert, Trash2, User, XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";
import { bffFetch } from "@/lib/bff-fetch";
import {
  Banner, ConfirmDialog, SectionCard, str,
  type ConfirmDialogAction,
} from "@/components/settings/shared";
import { useDiagnosticAction, type ActionResult } from "@/components/settings/use-diagnostic-action";
import { useIntl, useFormatRich } from "@/components/providers/IntlProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DebugData {
  session: {
    principal_id: string;
    active_org: string;
    active_workbench: string;
    token_status: string;
    token_expires?: string;
    token_ttl_seconds: number;
    csrf_status: string;
    mfa_required: boolean;
    mfa_verified: boolean;
  };
  bff: {
    connected: boolean;
    environment: string;
    runtime_url: string;
    realm_key: string;
  };
}

interface AutofixStep {
  step: string;
  status: "ok" | "warn" | "error" | "skip";
  detail?: string;
}

// ─── ResultCard ───────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: ActionResult }) {
  return (
    <div className={cn(
      "mt-2 rounded-md border px-3 py-2.5 text-xs",
      result.ok
        ? "border-border bg-accent text-accent-foreground"
        : "border-border bg-secondary text-secondary-foreground",
    )}>
      <div className="flex items-start gap-2">
        {result.ok
          ? <Check   className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
          : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{result.message}</p>
          {result.detail && (
            <p className="mt-0.5 text-2xs text-muted-foreground">{result.detail}</p>
          )}
          <p className="mt-1 font-mono text-2xs text-muted-foreground">
            {result.correlationId} · {result.duration}ms
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── ActionRow ────────────────────────────────────────────────────────────────

interface ActionDef {
  id: string;
  label: string;
  desc: string;
  buttonLabel: string;
  danger?: boolean;
  /** If set, show confirm dialog before executing */
  confirm?: Omit<ConfirmDialogAction, "title">;
  onExecute: () => Promise<void>;
}

function ActionRow({
  action,
  loading,
  result,
}: {
  action: ActionDef;
  loading: boolean;
  result: ActionResult | null;
}) {
  const [pendingConfirm, setPendingConfirm] = useState(false);

  function handleClick() {
    if (action.confirm) {
      setPendingConfirm(true);
    } else {
      void action.onExecute();
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-6 border-b border-border py-4 last:border-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{action.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.desc}</p>
          {result && <ResultCard result={result} />}
        </div>
        <Button
          variant="outline"
          className="h-8 shrink-0 gap-1.5 px-4 text-sm font-medium"
          onClick={handleClick}
          disabled={loading}
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {action.buttonLabel}
        </Button>
      </div>

      {pendingConfirm && action.confirm && (
        <ConfirmDialog
          action={{ ...action.confirm, title: action.label }}
          onConfirm={() => {
            setPendingConfirm(false);
            void action.onExecute();
          }}
          onCancel={() => setPendingConfirm(false)}
        />
      )}
    </>
  );
}

// ─── AutofixStepLog ───────────────────────────────────────────────────────────

function AutofixStepLog({ steps }: { steps: AutofixStep[] }) {
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-border">
      {steps.map((s, i) => (
        <div key={i} className={cn(
          "flex items-start gap-2 px-3 py-2 text-xs",
          i > 0 && "border-t border-border",
          s.status === "ok"   && "bg-accent",
          s.status === "warn" && "bg-secondary",
          s.status === "error" && "bg-secondary",
        )}>
          <span className={cn(
            "mt-0.5 text-2xs font-bold shrink-0",
            s.status === "ok"    && "text-success",
            s.status === "warn"  && "text-warning",
            s.status === "error" && "text-destructive",
            s.status === "skip"  && "text-muted-foreground",
          )}>
            {s.status === "ok" ? "✓" : s.status === "warn" ? "!" : s.status === "error" ? "✗" : "–"}
          </span>
          <div className="min-w-0 flex-1">
            <span className="font-semibold text-foreground">{s.step}</span>
            {s.detail && <span className="ml-2 text-muted-foreground">{s.detail}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── SessionDebugConsole ──────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000;

function SessionDebugConsole({ active }: { active: boolean }) {
  const { formatMessage }             = useIntl();
  const [data,        setData]        = useState<DebugData | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [copied,      setCopied]      = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    if (document.hidden) return;          // pause when tab not visible
    setLoading(true);
    try {
      const d = await bffFetch<DebugData>("/api/auth/debug");
      setData(d);
      setLastFetched(new Date());
    } catch {
      // keep stale data, don't blank the console on transient errors
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    if (!active) return;
    void fetch_();
    timerRef.current = setInterval(() => void fetch_(), POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (!document.hidden) void fetch_();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, fetch_]);

  function copyBundle() {
    if (!data) return;
    void navigator.clipboard?.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const ttl = data?.session.token_ttl_seconds ?? 0;
  const ttlLabel =
    ttl <= 0   ? (formatMessage({ id: "settings.diagnostics.console.ttl.expired" }) as string)
    : ttl < 60 ? `${ttl}s`
    : ttl < 3600 ? `${Math.floor(ttl / 60)}m ${ttl % 60}s`
    : `${Math.floor(ttl / 3600)}h ${Math.floor((ttl % 3600) / 60)}m`;

  return (
    <Card className="mb-4 w-full">
      <CardHeader className="pb-0 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Activity className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">{formatMessage({ id: "settings.diagnostics.console.title" })}</span>
          <div className="flex items-center gap-2">
            {lastFetched && (
              <span className="text-2xs text-muted-foreground">
                <Clock className="mr-0.5 inline h-2.5 w-2.5" />
                {lastFetched.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => void fetch_()}
              disabled={loading}
            >
              {loading
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <RefreshCw className="h-3 w-3" />}
              {formatMessage({ id: "settings.diagnostics.console.refresh" })}
            </Button>
            {data && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                onClick={copyBundle}
              >
                {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                {formatMessage({ id: "settings.diagnostics.console.copyBundle" })}
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 pt-3">
        {!data ? (
          <p className="text-xs text-muted-foreground">{loading ? formatMessage({ id: "settings.diagnostics.console.loading" }) : formatMessage({ id: "settings.diagnostics.console.noData" })}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Session block */}
            <details open className="rounded-md border border-border">
              <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                {formatMessage({ id: "settings.diagnostics.console.section.session" })}
              </summary>
              <div className="border-t border-border px-3 py-1">
                <DebugRow label={formatMessage({ id: "settings.diagnostics.console.row.principal" }) as string} value={data.session.principal_id} />
                <DebugRow label={formatMessage({ id: "settings.diagnostics.console.row.org" }) as string}       value={data.session.active_org} />
                <DebugRow label={formatMessage({ id: "settings.diagnostics.console.row.workbench" }) as string} value={data.session.active_workbench} />
                <DebugRow
                  label={formatMessage({ id: "settings.diagnostics.console.row.token" }) as string}
                  value={
                    <span className="flex items-center gap-1.5">
                      <Badge variant={data.session.token_status === "valid" ? "success" : "destructive"}>
                        {data.session.token_status}
                      </Badge>
                      {ttl > 0 && (
                        <span className="text-xs text-muted-foreground">{ttlLabel}</span>
                      )}
                    </span>
                  }
                />
                <DebugRow
                  label={formatMessage({ id: "settings.diagnostics.console.row.csrf" }) as string}
                  value={
                    <Badge variant={data.session.csrf_status === "present" ? "success" : "destructive"}>
                      {data.session.csrf_status}
                    </Badge>
                  }
                />
                <DebugRow
                  label={formatMessage({ id: "settings.diagnostics.console.row.mfa" }) as string}
                  value={
                    data.session.mfa_required
                      ? <Badge variant={data.session.mfa_verified ? "success" : "warning"}>
                          {data.session.mfa_verified
                            ? formatMessage({ id: "settings.diagnostics.console.mfa.verified" })
                            : formatMessage({ id: "settings.diagnostics.console.mfa.pending" })}
                        </Badge>
                      : <span className="text-xs text-muted-foreground">{formatMessage({ id: "settings.diagnostics.console.mfa.notRequired" })}</span>
                  }
                />
              </div>
            </details>

            {/* BFF block */}
            <details open className="rounded-md border border-border">
              <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground">
                <Server className="h-3.5 w-3.5 text-muted-foreground" />
                {formatMessage({ id: "settings.diagnostics.console.section.bff" })}
              </summary>
              <div className="border-t border-border px-3 py-1">
                <DebugRow
                  label={formatMessage({ id: "settings.diagnostics.console.row.runtime" }) as string}
                  value={
                    <Badge variant={data.bff.connected ? "success" : "destructive"}>
                      {data.bff.connected
                        ? formatMessage({ id: "settings.diagnostics.console.runtime.connected" })
                        : formatMessage({ id: "settings.diagnostics.console.runtime.unreachable" })}
                    </Badge>
                  }
                />
                <DebugRow label={formatMessage({ id: "settings.diagnostics.console.row.environment" }) as string} value={data.bff.environment} />
                <DebugRow label={formatMessage({ id: "settings.diagnostics.console.row.runtimeUrl" }) as string}  value={data.bff.runtime_url} />
                <DebugRow label={formatMessage({ id: "settings.diagnostics.console.row.realm" }) as string}        value={data.bff.realm_key} />
              </div>
            </details>
          </div>
        )}
        <p className="mt-2 text-2xs text-muted-foreground">
          {formatMessage({ id: "settings.diagnostics.console.footer" })}
        </p>
      </CardContent>
    </Card>
  );
}

function DebugRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/40 py-2 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs text-foreground">{value}</span>
    </div>
  );
}

// ─── ActionHistoryLog ─────────────────────────────────────────────────────────

function ActionHistoryLog({ history }: { history: ReturnType<typeof useDiagnosticAction>["history"] }) {
  const { formatMessage } = useIntl();
  const [open, setOpen] = useState(false);

  if (history.length === 0) return null;

  return (
    <Card className="mb-4 w-full">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm font-semibold text-foreground">
          {formatMessage({ id: "settings.diagnostics.history.title" })}
        </span>
        <Badge variant="secondary" className="text-2xs">{history.length}</Badge>
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <CardContent className="pb-4 pt-0">
          <div className="space-y-1">
            {history.map((h, i) => (
              <div
                key={`${h.correlationId}-${i}`}
                className="flex items-start gap-2 rounded-md px-2 py-1.5 text-2xs"
              >
                {h.ok
                  ? <Check   className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                  : <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />}
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-foreground">{h.actionId}</span>
                  <span className="ml-2 text-muted-foreground">{h.message}</span>
                  {h.endpoint && (
                    <span className="ml-2 font-mono text-muted-foreground/60">{h.endpoint}</span>
                  )}
                  <div className="mt-0.5 font-mono text-muted-foreground/50">
                    {h.correlationId} · {h.duration}ms · {new Date(h.ts).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── DiagnosticsSection ───────────────────────────────────────────────────────

export function DiagnosticsSection({ active }: { active: boolean }) {
  const { formatMessage } = useIntl();
  const formatRich        = useFormatRich();
  const { execute, results, loading, history } = useDiagnosticAction();

  // Autofix step log state (only populated when autofix returns steps)
  const [autofixSteps, setAutofixSteps] = useState<AutofixStep[] | null>(null);

  const fm = (id: string) => formatMessage({ id }) as string;

  // ── Tier 1: User Recovery ─────────────────────────────────────────────────

  const tier1Actions: ActionDef[] = [
    {
      id: "refresh_token",
      label: fm("settings.diagnostics.action.refreshToken.label"),
      desc: fm("settings.diagnostics.action.refreshToken.desc"),
      buttonLabel: fm("settings.diagnostics.action.refreshToken.button"),
      onExecute: async () => {
        await execute("refresh_token", {
          url: "/api/auth/refresh",
          method: "POST",
        });
      },
    },
    {
      id: "reset_local_caches",
      label: fm("settings.diagnostics.action.clearCache.label"),
      desc: fm("settings.diagnostics.action.clearCache.desc"),
      buttonLabel: fm("settings.diagnostics.action.clearCache.button"),
      onExecute: async () => {
        await execute("reset_local_caches", {
          clientFn: async () => {
            let count = 0;
            const keys = Object.keys(localStorage).filter((k) => k.startsWith("athyper_"));
            keys.forEach((k) => { localStorage.removeItem(k); count++; });
            const skeys = Object.keys(sessionStorage).filter((k) => k.startsWith("athyper_"));
            skeys.forEach((k) => { sessionStorage.removeItem(k); count++; });
            return formatMessage({ id: "settings.diagnostics.action.clearCache.success" }, { count }) as string;
          },
        });
      },
    },
    {
      id: "export_debug_bundle",
      label: fm("settings.diagnostics.action.exportBundle.label"),
      desc: fm("settings.diagnostics.action.exportBundle.desc"),
      buttonLabel: fm("settings.diagnostics.action.exportBundle.button"),
      onExecute: async () => {
        await execute("export_debug_bundle", {
          clientFn: async () => {
            const debugData = await bffFetch<DebugData>("/api/auth/debug");
            const bundle = {
              ...debugData,
              _exported_at: new Date().toISOString(),
              _user_agent:  navigator.userAgent,
              _url:         window.location.href,
            };
            const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `athyper-debug-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            return fm("settings.diagnostics.action.exportBundle.success");
          },
        });
      },
    },
  ];

  // ── Tier 2: Tenant Operations ─────────────────────────────────────────────

  const tier2Actions: ActionDef[] = [
    {
      id: "resync_identity",
      label: fm("settings.diagnostics.action.resyncIdentity.label"),
      desc: fm("settings.diagnostics.action.resyncIdentity.desc"),
      buttonLabel: fm("settings.diagnostics.action.resyncIdentity.button"),
      confirm: {
        endpoint: "POST /api/admin/user/sync-profile",
        impact: fm("settings.diagnostics.action.resyncIdentity.impact"),
        scopeLabel: fm("settings.diagnostics.action.resyncIdentity.scope"),
      },
      onExecute: async () => {
        await execute("resync_identity", {
          url: "/api/admin/user/sync-profile",
          method: "POST",
        });
      },
    },
    {
      id: "reload_permissions",
      label: fm("settings.diagnostics.action.reloadPermissions.label"),
      desc: fm("settings.diagnostics.action.reloadPermissions.desc"),
      buttonLabel: fm("settings.diagnostics.action.reloadPermissions.button"),
      confirm: {
        endpoint: "POST /api/admin/cache?scope=rbac",
        impact: fm("settings.diagnostics.action.reloadPermissions.impact"),
        scopeLabel: fm("settings.diagnostics.action.reloadPermissions.scope"),
      },
      onExecute: async () => {
        await execute("reload_permissions", {
          url: "/api/admin/cache?scope=rbac",
          method: "POST",
        });
      },
    },
    {
      id: "tenant_health",
      label: fm("settings.diagnostics.action.tenantHealth.label"),
      desc: fm("settings.diagnostics.action.tenantHealth.desc"),
      buttonLabel: fm("settings.diagnostics.action.tenantHealth.button"),
      onExecute: async () => {
        await execute("tenant_health", {
          url: "/api/admin/health",
          method: "GET",
        });
      },
    },
  ];

  // ── Tier 3: Platform Operations ───────────────────────────────────────────

  const tier3Actions: ActionDef[] = [
    {
      id: "reload_app_cache",
      label: fm("settings.diagnostics.action.reloadAppCache.label"),
      desc: fm("settings.diagnostics.action.reloadAppCache.desc"),
      buttonLabel: fm("settings.diagnostics.action.reloadAppCache.button"),
      confirm: {
        endpoint: "POST /api/admin/cache?scope=app",
        impact: (
          <>
            <p>{formatMessage({ id: "settings.diagnostics.action.reloadAppCache.impact.lead" })}</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5">
              <li>{formatMessage({ id: "settings.diagnostics.action.reloadAppCache.impact.item1" })}</li>
              <li>{formatMessage({ id: "settings.diagnostics.action.reloadAppCache.impact.item2" })}</li>
              <li>{formatMessage({ id: "settings.diagnostics.action.reloadAppCache.impact.item3" })}</li>
            </ul>
            <p className="mt-1.5 text-destructive font-semibold">
              {formatMessage({ id: "settings.diagnostics.action.reloadAppCache.impact.warning" })}
            </p>
          </>
        ),
        scopeLabel: fm("settings.diagnostics.action.reloadAppCache.scope"),
      },
      onExecute: async () => {
        await execute("reload_app_cache", {
          url: "/api/admin/cache?scope=app",
          method: "POST",
        });
      },
    },
    {
      id: "rebuild_session",
      label: fm("settings.diagnostics.action.rebuildSession.label"),
      desc: fm("settings.diagnostics.action.rebuildSession.desc"),
      buttonLabel: fm("settings.diagnostics.action.rebuildSession.button"),
      danger: true,
      confirm: {
        endpoint: "POST /api/admin/session/rebuild",
        impact: fm("settings.diagnostics.action.rebuildSession.impact"),
        scopeLabel: fm("settings.diagnostics.action.rebuildSession.scope"),
        confirmText: "REBUILD",
      },
      onExecute: async () => {
        await execute("rebuild_session", {
          url: "/api/admin/session/rebuild",
          method: "POST",
        });
      },
    },
    {
      id: "autofix",
      label: fm("settings.diagnostics.action.autofix.label"),
      desc: fm("settings.diagnostics.action.autofix.desc"),
      buttonLabel: fm("settings.diagnostics.action.autofix.button"),
      danger: true,
      confirm: {
        endpoint: "POST /api/admin/autofix",
        impact: (
          <>
            <p>{formatMessage({ id: "settings.diagnostics.action.autofix.impact.lead" })}</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5">
              <li>{formatMessage({ id: "settings.diagnostics.action.autofix.impact.item1" })}</li>
              <li>{formatMessage({ id: "settings.diagnostics.action.autofix.impact.item2" })}</li>
              <li>{formatMessage({ id: "settings.diagnostics.action.autofix.impact.item3" })}</li>
              <li>{formatMessage({ id: "settings.diagnostics.action.autofix.impact.item4" })}</li>
            </ul>
            <p className="mt-1.5 font-semibold">{formatMessage({ id: "settings.diagnostics.action.autofix.impact.warning" })}</p>
          </>
        ),
        scopeLabel: fm("settings.diagnostics.action.autofix.scope"),
        confirmText: "AUTOFIX",
        danger: true,
      },
      onExecute: async () => {
        await execute("autofix", {
          url: "/api/admin/autofix",
          method: "POST",
          onSuccess: (result) => {
            // If the response detail is a JSON array of steps, render them
            if (result.detail) {
              try {
                const parsed = JSON.parse(result.detail) as AutofixStep[];
                if (Array.isArray(parsed)) setAutofixSteps(parsed);
              } catch { /* detail is plain text, not a step array */ }
            }
          },
        });
      },
    },
  ];

  return (
    <div className="w-full">
      <Banner>
        {formatMessage({ id: "settings.diagnostics.banner.intro" })}
      </Banner>

      {/* ── Session Debug Console ── */}
      <SessionDebugConsole active={active} />

      {/* ── Tier 1: User Recovery ── */}
      <SectionCard
        title={fm("settings.diagnostics.tier1.title")}
        icon={User}
        badge={<Badge variant="success" className="text-2xs">{formatMessage({ id: "settings.diagnostics.tier1.badge" })}</Badge>}
        managedBy={{
          manager:  fm("settings.diagnostics.tier1.managedBy"),
          source:   fm("settings.diagnostics.tier1.source"),
          editPath: fm("settings.diagnostics.tier1.editPath"),
        }}
      >
        {tier1Actions.map((a) => (
          <ActionRow
            key={a.id}
            action={a}
            loading={loading[a.id] ?? false}
            result={results[a.id] ?? null}
          />
        ))}
      </SectionCard>

      {/* ── Tier 2: Tenant Operations ── */}
      <SectionCard
        title={fm("settings.diagnostics.tier2.title")}
        icon={Shield}
        badge={<Badge variant="warning" className="text-2xs">{formatMessage({ id: "settings.diagnostics.tier2.badge" })}</Badge>}
        managedBy={{
          manager:  fm("settings.diagnostics.tier2.managedBy"),
          source:   fm("settings.diagnostics.tier2.source"),
          editPath: fm("settings.diagnostics.tier2.editPath"),
        }}
      >
        <Banner variant="warn">
          {formatMessage({ id: "settings.diagnostics.tier2.banner" })}
        </Banner>
        {tier2Actions.map((a) => (
          <ActionRow
            key={a.id}
            action={a}
            loading={loading[a.id] ?? false}
            result={results[a.id] ?? null}
          />
        ))}
      </SectionCard>

      {/* ── Tier 3: Platform Operations ── */}
      <SectionCard
        title={fm("settings.diagnostics.tier3.title")}
        icon={ShieldAlert}
        badge={<Badge variant="destructive" className="text-2xs">{formatMessage({ id: "settings.diagnostics.tier3.badge" })}</Badge>}
        managedBy={{
          manager:  fm("settings.diagnostics.tier3.managedBy"),
          source:   fm("settings.diagnostics.tier3.source"),
          editPath: fm("settings.diagnostics.tier3.editPath"),
        }}
      >
        <Banner variant="error">
          {formatRich(
            { id: "settings.diagnostics.tier3.banner" },
            { strong: (chunks) => <strong>{chunks}</strong> },
          )}
        </Banner>
        {tier3Actions.map((a) => (
          <ActionRow
            key={a.id}
            action={a}
            loading={loading[a.id] ?? false}
            result={results[a.id] ?? null}
          />
        ))}
        {autofixSteps && (
          <div className="mt-2">
            <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {formatMessage({ id: "settings.diagnostics.autofixSteps" })}
            </p>
            <AutofixStepLog steps={autofixSteps} />
          </div>
        )}
      </SectionCard>

      {/* ── Action History ── */}
      <ActionHistoryLog history={history} />
    </div>
  );
}
