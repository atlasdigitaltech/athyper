"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Check, Copy, Download, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Badge, Button } from "@athyper/ui/primitives";
import { useMeUI } from "../me-ui-provider";
import { Banner, InfoRow, SectionCard } from "../_shared";

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
    connected?: boolean;
    environment: string;
    runtime_url: string;
    realm_key: string;
  };
}

const POLL_INTERVAL_MS = 30_000;

function formatTtl(seconds: number): string {
  if (seconds <= 0) return "Expired";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function clearAthyperCaches(): number {
  let count = 0;
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (!key.startsWith("athyper_")) continue;
      storage.removeItem(key);
      count += 1;
    }
  }
  return count;
}

export function DiagnosticsSection({ active }: { active: boolean }) {
  const { bffFetch } = useMeUI();
  const [data, setData] = useState<DebugData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDebug = useCallback(async () => {
    if (document.hidden) return;
    setLoading(true);
    setError(null);
    try {
      const next = await bffFetch<DebugData>("/api/auth/debug");
      setData(next);
      setLastFetched(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load diagnostics");
    } finally {
      setLoading(false);
    }
  }, [bffFetch]);

  useEffect(() => {
    if (!active) return;
    void fetchDebug();
    timerRef.current = setInterval(() => void fetchDebug(), POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (!document.hidden) void fetchDebug();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, fetchDebug]);

  async function refreshToken() {
    setMessage(null);
    await bffFetch("/api/auth/refresh", { method: "POST" });
    setMessage("Session token refreshed");
    await fetchDebug();
  }

  function clearCaches() {
    const count = clearAthyperCaches();
    setMessage(`Cleared ${count} cached entr${count === 1 ? "y" : "ies"}`);
  }

  async function copyBundle() {
    if (!data) return;
    await navigator.clipboard?.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadBundle() {
    if (!data) return;
    const bundle = {
      ...data,
      exported_at: new Date().toISOString(),
      user_agent: navigator.userAgent,
      url: window.location.href,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `athyper-debug-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const ttl = data?.session.token_ttl_seconds ?? 0;
  const runtimeConnected = data?.bff.connected ?? Boolean(data);

  return (
    <div>
      <Banner>
        Diagnostics are local troubleshooting tools. Debug metadata is available only when the app is running in local/development mode.
      </Banner>

      {message && <Banner variant="success">{message}</Banner>}
      {error && <Banner variant="warn">{error}</Banner>}

      <SectionCard title="Session Debug Console" icon={Activity}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void fetchDebug()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void refreshToken()} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh token
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={clearCaches}>
            <Trash2 className="h-3.5 w-3.5" />
            Clear cache
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void copyBundle()} disabled={!data}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            Copy bundle
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadBundle} disabled={!data}>
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
          {lastFetched && <span className="text-xs text-muted-foreground">Updated {lastFetched.toLocaleTimeString()}</span>}
        </div>

        {!data ? (
          <p className="text-sm text-muted-foreground">{loading ? "Loading diagnostics..." : "No diagnostics loaded yet."}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-border px-4 py-2">
              <InfoRow label="Principal" value={data.session.principal_id} mono copyable />
              <InfoRow label="Org" value={data.session.active_org || "None"} />
              <InfoRow label="Workbench" value={data.session.active_workbench || "None"} />
              <InfoRow
                label="Token"
                value={(
                  <span className="inline-flex items-center gap-2">
                    <Badge variant={data.session.token_status === "valid" ? "success" : "destructive"}>
                      {data.session.token_status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatTtl(ttl)}</span>
                  </span>
                )}
              />
              <InfoRow
                label="CSRF"
                value={<Badge variant={data.session.csrf_status === "present" ? "success" : "destructive"}>{data.session.csrf_status}</Badge>}
              />
              <InfoRow
                label="MFA"
                value={
                  data.session.mfa_required
                    ? <Badge variant={data.session.mfa_verified ? "success" : "warning"}>{data.session.mfa_verified ? "Verified" : "Pending"}</Badge>
                    : "Not required"
                }
              />
            </div>

            <div className="rounded-md border border-border px-4 py-2">
              <InfoRow
                label="Runtime"
                value={<Badge variant={runtimeConnected ? "success" : "destructive"}>{runtimeConnected ? "Connected" : "Unreachable"}</Badge>}
              />
              <InfoRow label="Environment" value={data.bff.environment} />
              <InfoRow label="Runtime URL" value={data.bff.runtime_url} mono copyable />
              <InfoRow label="Realm" value={data.bff.realm_key} mono copyable />
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

