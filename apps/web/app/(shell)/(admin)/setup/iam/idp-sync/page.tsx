"use client";

/**
 * IdP Sync Health Dashboard — /setup/iam/idp-sync
 *
 * Reads GET /api/iam/admin/idp-sync/health (Sprint 38/43 delivery).
 * Displays:
 *   - Summary tiles: last sync time, synced / conflict / error counts
 *   - Per-provider breakdown table
 *   - Conflict detail list (drift + error bindings)
 *   - Manual re-sync trigger button
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock,
  PlayCircle, Wifi,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import {
  Button, Badge, Skeleton, Card, CardContent,
} from "@athyper/ui/primitives";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProviderStat {
  provider_code: string;
  total:    number;
  synced:   number;
  drift:    number;
  error:    number;
  pending:  number;
  disabled: number;
  last_sync_at: string | null;
}

interface ConflictEntry {
  id: string;
  principal_id: string;
  principal_code: string | null;
  principal_display_name: string | null;
  provider_code: string;
  sync_status: "drift" | "error";
  sync_error_message: string | null;
  sync_retry_count: number;
  synced_at: string | null;
  subject_id: string;
  username: string | null;
}

interface SyncHealth {
  last_sync_at:   string | null;
  provider_stats: ProviderStat[];
  conflicts:      ConflictEntry[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtProvider(code: string): string {
  const map: Record<string, string> = {
    keycloak:    "Keycloak",
    azure_ad:    "Azure AD",
    okta:        "Okta",
    google:      "Google Workspace",
    saml_generic: "SAML (Generic)",
    oidc_generic: "OIDC (Generic)",
  };
  return map[code] ?? code;
}

// ── KPI Tile ──────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  icon: Icon,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ElementType;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className="rounded-md bg-muted/60 p-2 shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tabular-nums leading-snug">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function IdpSyncPage() {
  const qc = useQueryClient();
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);

  const { data, isLoading, error: fetchError } = useQuery<SyncHealth>({
    queryKey: ["iam-idp-sync-health"],
    queryFn: async () => {
      const res = await fetch("/api/iam/admin/idp-sync/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const trigger = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/iam/admin/idp-sync/trigger", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ message: string }>;
    },
    onSuccess: (r) => {
      setTriggerMsg(r.message);
      qc.invalidateQueries({ queryKey: ["iam-idp-sync-health"] });
      setTimeout(() => setTriggerMsg(null), 8_000);
    },
  });

  // Aggregate totals across providers
  const stats = data?.provider_stats ?? [];
  const totalSynced   = stats.reduce((s, p) => s + p.synced,   0);
  const totalDrift    = stats.reduce((s, p) => s + p.drift,    0);
  const totalError    = stats.reduce((s, p) => s + p.error,    0);
  const totalBindings = stats.reduce((s, p) => s + p.total,    0);
  const conflicts = data?.conflicts ?? [];

  return (
    <PageFrame
      title="IdP Sync Health"
      description="Identity provider synchronisation status across all principals"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["iam-idp-sync-health"] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => trigger.mutate()}
            disabled={trigger.isPending}
          >
            <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
            {trigger.isPending ? "Queuing…" : "Trigger Sync"}
          </Button>
        </div>
      }
    >
      {/* Trigger feedback */}
      {triggerMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {triggerMsg}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : fetchError ? (
        <EmptyState
          icon={<XCircle className="h-10 w-10 text-destructive/40" />}
          title="Failed to load sync health"
          description="Check that the runtime server is running and the IAM service is reachable."
          className="py-20"
        />
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
            <KpiTile
              label="Last Sync"
              value={<span className="text-sm">{fmtDateTime(data?.last_sync_at)}</span>}
              icon={Clock}
            />
            <KpiTile
              label="Synced"
              value={totalSynced.toLocaleString()}
              icon={CheckCircle2}
              className="border-success/40"
            />
            <KpiTile
              label="Conflicts (Drift)"
              value={totalDrift.toLocaleString()}
              icon={AlertTriangle}
              className={totalDrift > 0 ? "border-warning/40" : ""}
            />
            <KpiTile
              label="Errors"
              value={totalError.toLocaleString()}
              icon={XCircle}
              className={totalError > 0 ? "border-destructive/40" : ""}
            />
          </div>

          {/* Provider breakdown */}
          {stats.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Provider Breakdown</h2>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Provider</th>
                      <th className="px-4 py-2 text-right font-medium">Total</th>
                      <th className="px-4 py-2 text-right font-medium">Synced</th>
                      <th className="px-4 py-2 text-right font-medium">Drift</th>
                      <th className="px-4 py-2 text-right font-medium">Error</th>
                      <th className="px-4 py-2 text-right font-medium">Pending</th>
                      <th className="px-4 py-2 font-medium">Last Sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((p) => (
                      <tr key={p.provider_code} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium">{fmtProvider(p.provider_code)}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">({p.provider_code})</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{p.total.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          <span className={p.synced > 0 ? "text-success" : "text-muted-foreground"}>
                            {p.synced.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {p.drift > 0 ? (
                            <span className="font-medium text-warning">{p.drift.toLocaleString()}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {p.error > 0 ? (
                            <span className="font-medium text-destructive">{p.error.toLocaleString()}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {p.pending.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {fmtDateTime(p.last_sync_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Conflict detail list */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">
                Conflicts &amp; Errors
                {conflicts.length > 0 && (
                  <Badge variant="warning" className="ml-2 text-[10px]">{conflicts.length}</Badge>
                )}
              </h2>
            </div>

            {conflicts.length === 0 ? (
              <div className="flex items-center gap-3 rounded-md border border-dashed p-6 text-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-success/60" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">All bindings in sync</p>
                  <p className="text-xs text-muted-foreground/70">
                    {totalBindings > 0
                      ? `${totalBindings.toLocaleString()} binding${totalBindings !== 1 ? "s" : ""} synced successfully.`
                      : "No identity bindings found."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Principal</th>
                      <th className="px-4 py-2 font-medium">Provider</th>
                      <th className="px-4 py-2 font-medium">Subject ID</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Error</th>
                      <th className="px-4 py-2 text-right font-medium">Retries</th>
                      <th className="px-4 py-2 font-medium">Last Sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conflicts.map((c) => (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                        {/* Principal */}
                        <td className="px-4 py-2.5">
                          <p className="font-medium truncate max-w-[140px]">
                            {c.principal_display_name ?? c.principal_code ?? c.principal_id.slice(0, 8)}
                          </p>
                          {c.principal_code && c.principal_display_name && (
                            <p className="font-mono text-[10px] text-muted-foreground">{c.principal_code}</p>
                          )}
                          {c.username && (
                            <p className="text-[10px] text-muted-foreground">{c.username}</p>
                          )}
                        </td>

                        {/* Provider */}
                        <td className="px-4 py-2.5 text-xs">
                          {fmtProvider(c.provider_code)}
                        </td>

                        {/* Subject ID */}
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {c.subject_id.slice(0, 20)}{c.subject_id.length > 20 ? "…" : ""}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-2.5">
                          <Badge
                            variant={c.sync_status === "error" ? "destructive" : "warning"}
                            className="text-[10px] capitalize"
                          >
                            {c.sync_status}
                          </Badge>
                        </td>

                        {/* Error message */}
                        <td className="px-4 py-2.5 max-w-[200px]">
                          <p
                            className="text-xs text-muted-foreground truncate"
                            title={c.sync_error_message ?? undefined}
                          >
                            {c.sync_error_message ?? "—"}
                          </p>
                        </td>

                        {/* Retry count */}
                        <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                          {c.sync_retry_count > 0 ? (
                            <span className={c.sync_retry_count >= 3 ? "text-destructive font-medium" : "text-muted-foreground"}>
                              {c.sync_retry_count}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>

                        {/* Last sync */}
                        <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDateTime(c.synced_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {conflicts.length >= 100 && (
                  <p className="px-4 py-2 text-xs text-muted-foreground border-t">
                    Showing up to 100 conflicts. Use filters or resolve errors to see fewer entries.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </PageFrame>
  );
}
