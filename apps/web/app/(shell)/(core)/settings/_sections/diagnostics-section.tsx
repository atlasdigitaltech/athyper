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
      <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-0">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">{action.label}</p>
          <p className="mt-0.5 text-2xs text-muted-foreground leading-relaxed">{action.desc}</p>
          {result && <ResultCard result={result} />}
        </div>
        <Button
          size="sm"
          variant={action.danger ? "destructive" : "outline"}
          className="h-7 shrink-0 gap-1 px-3 text-xs"
          onClick={handleClick}
          disabled={loading}
        >
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
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
    ttl <= 0   ? "Expired"
    : ttl < 60 ? `${ttl}s`
    : ttl < 3600 ? `${Math.floor(ttl / 60)}m ${ttl % 60}s`
    : `${Math.floor(ttl / 3600)}h ${Math.floor((ttl % 3600) / 60)}m`;

  return (
    <Card className="mb-4 w-full">
      <CardHeader className="pb-0 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Activity className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">Session Debug Console</span>
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
              Refresh
            </Button>
            {data && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                onClick={copyBundle}
              >
                {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                Copy Bundle
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 pt-3">
        {!data ? (
          <p className="text-xs text-muted-foreground">{loading ? "Loading…" : "No data"}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Session block */}
            <details open className="rounded-md border border-border">
              <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                Session
              </summary>
              <div className="border-t border-border px-3 py-2 space-y-1.5">
                <DebugRow label="Principal" value={data.session.principal_id} mono />
                <DebugRow label="Org"       value={data.session.active_org} />
                <DebugRow label="Workbench" value={data.session.active_workbench} />
                <DebugRow
                  label="Token"
                  value={
                    <span className={cn(
                      "font-mono text-2xs",
                      data.session.token_status === "valid" ? "text-success" : "text-destructive",
                    )}>
                      {data.session.token_status} · {ttlLabel}
                    </span>
                  }
                />
                <DebugRow
                  label="CSRF"
                  value={
                    <Badge
                      variant={data.session.csrf_status === "present" ? "success" : "destructive"}
                      className="text-2xs"
                    >
                      {data.session.csrf_status}
                    </Badge>
                  }
                />
                <DebugRow
                  label="MFA"
                  value={
                    <span className={cn(
                      "text-2xs font-mono",
                      data.session.mfa_verified ? "text-success" : "text-muted-foreground",
                    )}>
                      {data.session.mfa_required
                        ? (data.session.mfa_verified ? "required + verified" : "required + pending")
                        : "not required"}
                    </span>
                  }
                />
              </div>
            </details>

            {/* BFF block */}
            <details open className="rounded-md border border-border">
              <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground">
                <Server className="h-3.5 w-3.5 text-muted-foreground" />
                BFF / Runtime
              </summary>
              <div className="border-t border-border px-3 py-2 space-y-1.5">
                <DebugRow
                  label="Runtime"
                  value={
                    <Badge
                      variant={data.bff.connected ? "success" : "destructive"}
                      className="text-2xs"
                    >
                      {data.bff.connected ? "connected" : "unreachable"}
                    </Badge>
                  }
                />
                <DebugRow label="Environment" value={data.bff.environment} />
                <DebugRow label="Runtime URL"  value={data.bff.runtime_url} />
                <DebugRow label="Realm"        value={data.bff.realm_key} />
              </div>
            </details>
          </div>
        )}
        <p className="mt-2 text-2xs text-muted-foreground">
          Polls every 30 s · pauses when tab is hidden · secrets are always redacted.
        </p>
      </CardContent>
    </Card>
  );
}

function DebugRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 text-2xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("text-right text-foreground", mono && "font-mono")}>{value}</span>
    </div>
  );
}

// ─── ActionHistoryLog ─────────────────────────────────────────────────────────

function ActionHistoryLog({ history }: { history: ReturnType<typeof useDiagnosticAction>["history"] }) {
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
          Action History
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
  const { execute, results, loading, history } = useDiagnosticAction();

  // Autofix step log state (only populated when autofix returns steps)
  const [autofixSteps, setAutofixSteps] = useState<AutofixStep[] | null>(null);

  // ── Tier 1: User Recovery ─────────────────────────────────────────────────

  const tier1Actions: ActionDef[] = [
    {
      id: "refresh_token",
      label: "Refresh Session Token",
      desc: "Exchanges the current refresh token for a new access token. Fixes most 401/403 errors without logging out.",
      buttonLabel: "Refresh",
      onExecute: async () => {
        await execute("refresh_token", {
          url: "/api/auth/refresh",
          method: "POST",
        });
      },
    },
    {
      id: "reset_local_caches",
      label: "Clear Browser Cache",
      desc: "Clears all athyper_ localStorage and sessionStorage entries on this browser. Fixes stale UI state — reload required.",
      buttonLabel: "Clear",
      onExecute: async () => {
        await execute("reset_local_caches", {
          clientFn: async () => {
            let count = 0;
            const keys = Object.keys(localStorage).filter((k) => k.startsWith("athyper_"));
            keys.forEach((k) => { localStorage.removeItem(k); count++; });
            const skeys = Object.keys(sessionStorage).filter((k) => k.startsWith("athyper_"));
            skeys.forEach((k) => { sessionStorage.removeItem(k); count++; });
            return `Removed ${count} cached entr${count !== 1 ? "ies" : "y"}`;
          },
        });
      },
    },
    {
      id: "export_debug_bundle",
      label: "Export Debug Bundle",
      desc: "Downloads a redacted JSON file with session metadata, BFF status, and browser info. Attach to support tickets.",
      buttonLabel: "Download",
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
            return "Debug bundle downloaded";
          },
        });
      },
    },
  ];

  // ── Tier 2: Tenant Operations ─────────────────────────────────────────────

  const tier2Actions: ActionDef[] = [
    {
      id: "resync_identity",
      label: "Re-sync Identity Binding",
      desc: "Forces re-synchronisation of the principal_identity_binding record from Athyper IAM. Use when your IdP profile has changed but the platform hasn't updated.",
      buttonLabel: "Re-sync",
      confirm: {
        endpoint: "POST /api/admin/user/sync-profile",
        impact: "Re-reads your identity from Keycloak and overwrites the local auth binding record. Your session is not interrupted.",
        scopeLabel: "Current user · principal_identity_binding",
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
      label: "Reload Permission Cache",
      desc: "Clears the RBAC cache for this tenant. New group assignments and permission changes take effect immediately.",
      buttonLabel: "Reload",
      confirm: {
        endpoint: "POST /api/admin/cache?scope=rbac",
        impact: "All permission resolution caches for this tenant are flushed. Next request re-derives permissions from the database. Brief latency on first access.",
        scopeLabel: "Current tenant · RBAC cache",
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
      label: "Tenant Health Check",
      desc: "Runs a lightweight health probe against the runtime service and returns current status for all subsystems.",
      buttonLabel: "Run Check",
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
      label: "Reload Application Cache",
      desc: "Clears the full application-level cache (all tenants). Use only when platform configuration has changed and cannot wait for natural expiry.",
      buttonLabel: "Reload",
      confirm: {
        endpoint: "POST /api/admin/cache?scope=app",
        impact: (
          <>
            <p>All in-memory application caches across all tenants are flushed. Includes:</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5">
              <li>Module subscription lookups</li>
              <li>Feature entitlement tables</li>
              <li>Tenant profile defaults</li>
            </ul>
            <p className="mt-1.5 text-destructive font-semibold">
              Affects all users in all tenants. Elevated latency for 30–60 s.
            </p>
          </>
        ),
        scopeLabel: "All tenants · application cache",
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
      label: "Rebuild Runtime Session",
      desc: "Destroys and reconstructs the runtime-layer session for this principal. The BFF session and browser cookies are preserved — you stay logged in.",
      buttonLabel: "Rebuild",
      danger: true,
      confirm: {
        endpoint: "POST /api/admin/session/rebuild",
        impact: "Runtime session state is fully reset. Any in-flight workflow locks or optimistic locks held by this session will be released.",
        scopeLabel: "Current user · runtime session",
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
      label: "Run Auto-fix",
      desc: "Runs the platform auto-fix routine: checks for orphaned records, stale locks, and inconsistent state, and attempts to self-correct each issue.",
      buttonLabel: "Run Auto-fix",
      danger: true,
      confirm: {
        endpoint: "POST /api/admin/autofix",
        impact: (
          <>
            <p>Executes all registered auto-fix routines including:</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5">
              <li>Release stale document locks (≥ 15 min)</li>
              <li>Mark timed-out workflow tasks</li>
              <li>Reconcile undelivered notification events</li>
              <li>Verify dimension integrity on unposted journals</li>
            </ul>
            <p className="mt-1.5 font-semibold">This writes to the database.</p>
          </>
        ),
        scopeLabel: "Platform-wide",
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
        Diagnostic tools are for troubleshooting only — they do not modify business data.
        All actions are logged with correlation IDs for audit purposes.
      </Banner>

      {/* ── Session Debug Console ── */}
      <SessionDebugConsole active={active} />

      {/* ── Tier 1: User Recovery ── */}
      <SectionCard
        title="User Recovery"
        icon={User}
        badge={<Badge variant="success" className="text-2xs">Safe</Badge>}
        managedBy={{
          manager:  "You",
          source:   "BFF session · browser storage",
          editPath: "No confirmation required · safe to run at any time",
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
        title="Tenant Operations"
        icon={Shield}
        badge={<Badge variant="warning" className="text-2xs">Admin</Badge>}
        managedBy={{
          manager:  "Tenant Admin",
          source:   "Runtime service",
          editPath: "Requires tenant administrator group membership",
        }}
      >
        <Banner variant="warn">
          These actions affect your tenant. All require confirmation before executing.
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
        title="Platform Operations"
        icon={ShieldAlert}
        badge={<Badge variant="destructive" className="text-2xs">Elevated</Badge>}
        managedBy={{
          manager:  "Platform Support",
          source:   "Runtime service · platform admin",
          editPath: "Destructive actions require typed confirmation",
        }}
      >
        <Banner variant="error">
          These actions have <strong>platform-wide or irreversible effects</strong>.
          Only execute under guidance from Athyper Platform Support.
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
              Auto-fix steps
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
