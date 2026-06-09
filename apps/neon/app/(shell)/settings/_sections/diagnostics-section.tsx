"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, AlertTriangle, Archive, Check, ChevronDown, ChevronUp,
  Clock, Copy, Loader2, RefreshCw, Server, Shield, ShieldAlert,
  Trash2, User, XCircle, Zap,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";
import { bffFetch, BffError } from "@/lib/bff-fetch";
import {
  Banner, ConfirmDialog, SectionCard, str,
  type ConfirmDialogAction,
} from "../_shared";

// ─── useDiagnosticAction (inlined) ───────────────────────────────────────────

interface ActionResult {
  ok: boolean;
  message: string;
  detail?: string;
  correlationId: string;
  duration: number;
  ts: number;
}

interface HistoryEntry extends ActionResult {
  actionId: string;
  endpoint?: string;
}

interface ExecuteOptions {
  url?: string;
  method?: "GET" | "POST";
  clientFn?: () => Promise<string | void>;
  onSuccess?: (result: ActionResult) => void;
}

const AUTO_CLEAR_MS = 30_000;
const HISTORY_LIMIT = 50;

function useDiagnosticAction() {
  const [results, setResults] = useState<Record<string, ActionResult | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const execute = useCallback(
    async (actionId: string, opts: ExecuteOptions) => {
      const correlationId = `diag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const startTime = Date.now();

      setLoading((prev) => ({ ...prev, [actionId]: true }));
      setResults((prev) => ({ ...prev, [actionId]: null }));

      let result: ActionResult;

      try {
        if (opts.clientFn) {
          const msg = await opts.clientFn();
          result = {
            ok: true,
            message: typeof msg === "string" && msg ? msg : "Done",
            correlationId, duration: Date.now() - startTime, ts: Date.now(),
          };
        } else if (opts.url) {
          const data = await bffFetch<Record<string, unknown>>(opts.url, { method: opts.method ?? "POST" });
          result = {
            ok: true,
            message: data?.message ? String(data.message) : "Completed successfully",
            detail:  data?.detail  ? String(data.detail)  : undefined,
            correlationId, duration: Date.now() - startTime, ts: Date.now(),
          };
        } else {
          result = { ok: false, message: "No endpoint or client function provided", correlationId, duration: 0, ts: Date.now() };
        }
      } catch (err) {
        result = {
          ok: false,
          message: err instanceof Error ? err.message : "Action failed",
          detail: err instanceof BffError ? `HTTP ${err.status}` : undefined,
          correlationId, duration: Date.now() - startTime, ts: Date.now(),
        };
      }

      setResults((prev) => ({ ...prev, [actionId]: result }));
      setHistory((prev) => [{ actionId, ...result, endpoint: opts.url }, ...prev].slice(0, HISTORY_LIMIT));
      setLoading((prev) => ({ ...prev, [actionId]: false }));

      if (result.ok) opts.onSuccess?.(result);

      const timer = setTimeout(() => {
        setResults((prev) => ({ ...prev, [actionId]: null }));
      }, AUTO_CLEAR_MS);

      return () => clearTimeout(timer);
    },
    [],
  );

  return { execute, results, loading, history };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DebugData {
  session: {
    principal_id:       string;
    active_org:         string;
    active_workbench:   string;
    token_status:       string;
    token_expires?:     string;
    token_ttl_seconds:  number;
    csrf_status:        string;
    mfa_required:       boolean;
    mfa_verified:       boolean;
  };
  bff: {
    connected:    boolean;
    environment:  string;
    runtime_url:  string;
    realm_key:    string;
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
          <p className="font-medium">{result.message}</p>
          {result.detail && <p className="mt-0.5 text-xs text-muted-foreground">{result.detail}</p>}
          <p className="mt-1 font-mono text-xs text-muted-foreground">{result.correlationId} · {result.duration}ms</p>
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
  confirm?: Omit<ConfirmDialogAction, "title">;
  onExecute: () => Promise<void>;
}

function ActionRow({ action, loading, result }: {
  action: ActionDef;
  loading: boolean;
  result: ActionResult | null;
}) {
  const [pendingConfirm, setPendingConfirm] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-6 border-b border-border py-4 last:border-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{action.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.desc}</p>
          {result && <ResultCard result={result} />}
        </div>
        <Button
          variant="outline"
          className="h-8 shrink-0 gap-1.5 px-4 text-sm font-medium"
          onClick={() => action.confirm ? setPendingConfirm(true) : void action.onExecute()}
          disabled={loading}
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {action.buttonLabel}
        </Button>
      </div>

      {pendingConfirm && action.confirm && (
        <ConfirmDialog
          action={{ ...action.confirm, title: action.label }}
          onConfirm={() => { setPendingConfirm(false); void action.onExecute(); }}
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
          s.status === "ok"    && "bg-accent",
          s.status === "warn"  && "bg-secondary",
          s.status === "error" && "bg-secondary",
        )}>
          <span className={cn(
            "mt-0.5 text-xs font-medium shrink-0",
            s.status === "ok"    && "text-success",
            s.status === "warn"  && "text-warning",
            s.status === "error" && "text-destructive",
            s.status === "skip"  && "text-muted-foreground",
          )}>
            {s.status === "ok" ? "✓" : s.status === "warn" ? "!" : s.status === "error" ? "✗" : "–"}
          </span>
          <div className="min-w-0 flex-1">
            <span className="font-medium text-foreground">{s.step}</span>
            {s.detail && <span className="ml-2 text-muted-foreground">{s.detail}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── DebugRow ─────────────────────────────────────────────────────────────────

function DebugRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/40 py-2 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs text-foreground">{value}</span>
    </div>
  );
}

// ─── SessionDebugConsole ──────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000;

function SessionDebugConsole({ active }: { active: boolean }) {
  const [data,        setData]        = useState<DebugData | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [copied,      setCopied]      = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    if (document.hidden) return;
    setLoading(true);
    try {
      const d = await bffFetch<DebugData>("/api/auth/debug");
      setData(d);
      setLastFetched(new Date());
    } catch { /* keep stale */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!active) return;
    void fetch_();
    timerRef.current = setInterval(() => void fetch_(), POLL_INTERVAL_MS);
    const onVisibility = () => { if (!document.hidden) void fetch_(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, fetch_]);

  const ttl = data?.session.token_ttl_seconds ?? 0;
  const ttlLabel =
    ttl <= 0   ? "Expired"
    : ttl < 60 ? `${ttl}s`
    : ttl < 3600 ? `${Math.floor(ttl / 60)}m ${ttl % 60}s`
    : `${Math.floor(ttl / 3600)}h ${Math.floor((ttl % 3600) / 60)}m`;

  return (
    <Card className="mb-4 w-full">
      <CardHeader className="pb-0 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Activity className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">Session Debug Console</span>
          <div className="flex items-center gap-2">
            {lastFetched && (
              <span className="text-xs text-muted-foreground">
                <Clock className="mr-0.5 inline h-2.5 w-2.5" />
                {lastFetched.toLocaleTimeString()}
              </span>
            )}
            <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={() => void fetch_()} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Refresh
            </Button>
            {data && (
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs"
                onClick={() => { void navigator.clipboard?.writeText(JSON.stringify(data, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                Copy Bundle
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 pt-3">
        {!data ? (
          <p className="text-xs text-muted-foreground">{loading ? "Loading…" : "No data yet."}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <details open className="rounded-md border border-border">
              <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-medium text-foreground">
                <User className="h-3.5 w-3.5 text-muted-foreground" /> Session
              </summary>
              <div className="border-t border-border px-3 py-1">
                <DebugRow label="Principal"  value={data.session.principal_id} />
                <DebugRow label="Org"        value={data.session.active_org} />
                <DebugRow label="Workbench"  value={data.session.active_workbench} />
                <DebugRow label="Token" value={
                  <span className="flex items-center gap-1.5">
                    <Badge variant={data.session.token_status === "valid" ? "success" : "destructive"}>{data.session.token_status}</Badge>
                    {ttl > 0 && <span className="text-xs text-muted-foreground">{ttlLabel}</span>}
                  </span>
                } />
                <DebugRow label="CSRF" value={
                  <Badge variant={data.session.csrf_status === "present" ? "success" : "destructive"}>{data.session.csrf_status}</Badge>
                } />
                <DebugRow label="MFA" value={
                  data.session.mfa_required
                    ? <Badge variant={data.session.mfa_verified ? "success" : "warning"}>{data.session.mfa_verified ? "Verified" : "Pending"}</Badge>
                    : <span className="text-xs text-muted-foreground">Not required</span>
                } />
              </div>
            </details>

            <details open className="rounded-md border border-border">
              <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-medium text-foreground">
                <Server className="h-3.5 w-3.5 text-muted-foreground" /> Runtime BFF
              </summary>
              <div className="border-t border-border px-3 py-1">
                <DebugRow label="Runtime" value={
                  <Badge variant={data.bff.connected ? "success" : "destructive"}>{data.bff.connected ? "Connected" : "Unreachable"}</Badge>
                } />
                <DebugRow label="Environment" value={data.bff.environment} />
                <DebugRow label="Runtime URL" value={data.bff.runtime_url} />
                <DebugRow label="Realm"       value={data.bff.realm_key} />
              </div>
            </details>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Polls every 30 s. Paused when tab is hidden.</p>
      </CardContent>
    </Card>
  );
}

// ─── ActionHistoryLog ─────────────────────────────────────────────────────────

function ActionHistoryLog({ history }: { history: HistoryEntry[] }) {
  const [open, setOpen] = useState(false);
  if (history.length === 0) return null;

  return (
    <Card className="mb-4 w-full">
      <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left" onClick={() => setOpen((v) => !v)}>
        <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium text-foreground">Action History</span>
        <Badge variant="secondary" className="text-xs">{history.length}</Badge>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <CardContent className="pb-4 pt-0">
          <div className="space-y-1">
            {history.map((h, i) => (
              <div key={`${h.correlationId}-${i}`} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs">
                {h.ok
                  ? <Check   className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                  : <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />}
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{h.actionId}</span>
                  <span className="ml-2 text-muted-foreground">{h.message}</span>
                  {h.endpoint && <span className="ml-2 font-mono text-muted-foreground/60">{h.endpoint}</span>}
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
  const { execute, results, loading, history } = useDiagnosticAction();
  const [autofixSteps, setAutofixSteps] = useState<AutofixStep[] | null>(null);

  const tier1Actions: ActionDef[] = [
    {
      id: "refresh_token",
      label: "Refresh Access Token",
      desc: "Forces an immediate token refresh against the identity provider. Use this if you are seeing 401 errors or stale session data.",
      buttonLabel: "Refresh Token",
      onExecute: async () => { await execute("refresh_token", { url: "/api/auth/refresh", method: "POST" }); },
    },
    {
      id: "reset_local_caches",
      label: "Clear Local Caches",
      desc: "Clears all athyper_* keys from localStorage and sessionStorage. Safe and instant — no server calls.",
      buttonLabel: "Clear Cache",
      onExecute: async () => {
        await execute("reset_local_caches", {
          clientFn: async () => {
            let count = 0;
            const keys  = Object.keys(localStorage).filter((k) => k.startsWith("athyper_"));
            keys.forEach((k) => { localStorage.removeItem(k); count++; });
            const skeys = Object.keys(sessionStorage).filter((k) => k.startsWith("athyper_"));
            skeys.forEach((k) => { sessionStorage.removeItem(k); count++; });
            return `Cleared ${count} cache entries`;
          },
        });
      },
    },
    {
      id: "export_debug_bundle",
      label: "Export Debug Bundle",
      desc: "Downloads a JSON file with session metadata, BFF connectivity, and browser info for support tickets.",
      buttonLabel: "Export Bundle",
      onExecute: async () => {
        await execute("export_debug_bundle", {
          clientFn: async () => {
            const debugData = await bffFetch<DebugData>("/api/auth/debug");
            const bundle = { ...debugData, _exported_at: new Date().toISOString(), _user_agent: navigator.userAgent, _url: window.location.href };
            const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `athyper-debug-${Date.now()}.json`; a.click();
            URL.revokeObjectURL(url);
            return "Debug bundle downloaded";
          },
        });
      },
    },
  ];

  const tier2Actions: ActionDef[] = [
    {
      id: "resync_identity",
      label: "Re-sync Identity Profile",
      desc: "Triggers a sync of your principal profile from the HR system and identity provider. Resolves display name, locale, and role drift.",
      buttonLabel: "Sync Identity",
      confirm: {
        endpoint: "POST /api/admin/user/sync-profile",
        impact: "Re-syncs profile fields (name, locale, roles) from authoritative sources. No data is deleted.",
        scopeLabel: "Your account",
      },
      onExecute: async () => { await execute("resync_identity", { url: "/api/admin/user/sync-profile", method: "POST" }); },
    },
    {
      id: "reload_permissions",
      label: "Reload RBAC Permissions",
      desc: "Forces a reload of the permission cache for your session. Use this after a role change or group assignment that has not taken effect.",
      buttonLabel: "Reload Permissions",
      confirm: {
        endpoint: "POST /api/admin/cache?scope=rbac",
        impact: "Invalidates and rebuilds the RBAC cache for your session. Other sessions are unaffected.",
        scopeLabel: "Your session",
      },
      onExecute: async () => { await execute("reload_permissions", { url: "/api/admin/cache?scope=rbac", method: "POST" }); },
    },
    {
      id: "tenant_health",
      label: "Check Tenant Health",
      desc: "Runs a health check against the tenant-scoped APIs and returns a status summary.",
      buttonLabel: "Check Health",
      onExecute: async () => { await execute("tenant_health", { url: "/api/admin/health", method: "GET" }); },
    },
  ];

  const tier3Actions: ActionDef[] = [
    {
      id: "reload_app_cache",
      label: "Reload Application Cache",
      desc: "Invalidates the shared application-level cache (descriptors, config, lookups). Affects all users until the cache warms up.",
      buttonLabel: "Reload Cache",
      confirm: {
        endpoint: "POST /api/admin/cache?scope=app",
        impact: (
          <>
            <p>Invalidates the shared application-level cache. Impact:</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5">
              <li>All users will see cache misses for 30–60 seconds.</li>
              <li>Descriptor lookups and autocomplete will be slower temporarily.</li>
              <li>Background rehydration starts immediately.</li>
            </ul>
            <p className="mt-1.5 text-destructive font-medium">Do not run during peak hours.</p>
          </>
        ),
        scopeLabel: "All users (tenant-wide)",
      },
      onExecute: async () => { await execute("reload_app_cache", { url: "/api/admin/cache?scope=app", method: "POST" }); },
    },
    {
      id: "rebuild_session",
      label: "Rebuild Session",
      desc: "Destroys and rebuilds the server-side session. You will be signed out and redirected to login. Use only when the session is corrupt.",
      buttonLabel: "Rebuild Session",
      danger: true,
      confirm: {
        endpoint: "POST /api/admin/session/rebuild",
        impact: "Your current session will be destroyed. You will be signed out immediately and redirected to the login page.",
        scopeLabel: "Your session",
        confirmText: "REBUILD",
      },
      onExecute: async () => { await execute("rebuild_session", { url: "/api/admin/session/rebuild", method: "POST" }); },
    },
    {
      id: "autofix",
      label: "Run Autofix",
      desc: "Runs a sequence of automated recovery steps: token refresh, identity sync, cache reload, and session validation. Use as a last resort.",
      buttonLabel: "Run Autofix",
      danger: true,
      confirm: {
        endpoint: "POST /api/admin/autofix",
        impact: (
          <>
            <p>Executes all recovery steps in sequence:</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5">
              <li>Token refresh</li>
              <li>Identity re-sync</li>
              <li>RBAC cache reload</li>
              <li>Session validation</li>
            </ul>
            <p className="mt-1.5 font-medium">This may sign you out if the session cannot be recovered.</p>
          </>
        ),
        scopeLabel: "Your account + session",
        confirmText: "AUTOFIX",
        danger: true,
      },
      onExecute: async () => {
        await execute("autofix", {
          url: "/api/admin/autofix",
          method: "POST",
          onSuccess: (result) => {
            if (result.detail) {
              try {
                const parsed = JSON.parse(result.detail) as AutofixStep[];
                if (Array.isArray(parsed)) setAutofixSteps(parsed);
              } catch { /* plain text detail */ }
            }
          },
        });
      },
    },
  ];

  return (
    <div className="w-full">
      <Banner>
        Diagnostics console — run recovery actions, inspect session state, and export debug information.
        Tier 2 and Tier 3 actions require confirmation and should be used with care.
      </Banner>

      <SessionDebugConsole active={active} />

      <SectionCard
        title="User Recovery"
        icon={User}
        badge={<Badge variant="success" className="text-xs">Safe</Badge>}
        managedBy={{ manager: "You", source: "Client-side + /api/auth/*", editPath: "No confirmation required" }}
      >
        {tier1Actions.map((a) => (
          <ActionRow key={a.id} action={a} loading={loading[a.id] ?? false} result={results[a.id] ?? null} />
        ))}
      </SectionCard>

      <SectionCard
        title="Tenant Operations"
        icon={Shield}
        badge={<Badge variant="warning" className="text-xs">Requires Confirmation</Badge>}
        managedBy={{ manager: "Tenant Admin", source: "/api/admin/*", editPath: "Requires Tenant Admin permission" }}
      >
        <Banner variant="warn">
          These actions affect tenant-level configuration. Confirm before proceeding.
        </Banner>
        {tier2Actions.map((a) => (
          <ActionRow key={a.id} action={a} loading={loading[a.id] ?? false} result={results[a.id] ?? null} />
        ))}
      </SectionCard>

      <SectionCard
        title="Platform Operations"
        icon={ShieldAlert}
        badge={<Badge variant="destructive" className="text-xs">Destructive</Badge>}
        managedBy={{ manager: "Platform Admin", source: "/api/admin/*", editPath: "Contact Platform Admin if unsure" }}
      >
        <Banner variant="error">
          <strong>High-impact actions.</strong> These may affect all users or require a typed confirmation. Use only when instructed by Platform Admin.
        </Banner>
        {tier3Actions.map((a) => (
          <ActionRow key={a.id} action={a} loading={loading[a.id] ?? false} result={results[a.id] ?? null} />
        ))}
        {autofixSteps && (
          <div className="mt-2">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Autofix Steps</p>
            <AutofixStepLog steps={autofixSteps} />
          </div>
        )}
      </SectionCard>

      <ActionHistoryLog history={history} />
    </div>
  );
}
