"use client";

/**
 * Audit Hash-Chain Integrity — /setup/audit/integrity
 *
 * Allows an admin to verify the SHA-256 tamper-evident hash chain for a
 * selected date range. Each daily audit log batch is chained to the previous
 * day's anchor hash; any modification to historical rows breaks the chain.
 *
 * Flow:
 *   1. Select a date range (from / to).
 *   2. Click "Run Verification" — POST /api/relay/audit/integrity-check.
 *   3. View: overall pass/fail, anchors verified, first broken date, gaps.
 */

import { useState } from "react";
import { cn } from "@athyper/theme/utils";
import { useMutation } from "@tanstack/react-query";
import {
  ShieldCheck, ShieldAlert, Loader2, Play,
  CalendarRange, Hash, AlertTriangle, CheckCircle2,
  Info,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import {
  Button, Badge, Card, CardContent, CardHeader, CardTitle,
  Input, Label,
} from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

interface IntegrityResult {
  tenantId:       string;
  fromDate:       string;
  toDate:         string;
  anchorsChecked: number;
  intact:         boolean;
  brokenAt:       string | null;
  gaps:           string[];
  verifiedAt:     string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  // anchor dates are YYYY-MM-DD; verifiedAt is ISO
  const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

/** Return YYYY-MM-DD for first day of N months ago */
function monthStart(monthsAgo: number): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  return d.toISOString().slice(0, 10);
}

/** Return YYYY-MM-DD for last day of today's month, or today if current month */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const PRESETS: { label: string; from: string; to: string }[] = [
  { label: "Last 7 days",  from: (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 7);  return d.toISOString().slice(0, 10); })(), to: today() },
  { label: "Last 30 days", from: (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 30); return d.toISOString().slice(0, 10); })(), to: today() },
  { label: "This month",   from: monthStart(0), to: today() },
  { label: "Last month",   from: monthStart(1), to: (() => { const d = new Date(); d.setUTCDate(0); return d.toISOString().slice(0, 10); })() },
];

// ── Result Panel ──────────────────────────────────────────────────────────────

function ResultPanel({ result }: { result: IntegrityResult }) {
  return (
    <Card className={result.intact ? "border-success/40" : "border-destructive/40"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {result.intact ? (
            <>
              <ShieldCheck className="h-5 w-5 text-success" />
              <span className="text-success">Chain intact</span>
            </>
          ) : (
            <>
              <ShieldAlert className="h-5 w-5 text-destructive" />
              <span className="text-destructive">Chain broken</span>
            </>
          )}
          <Badge
            variant={result.intact ? "success" : "destructive"}
            className="ml-auto text-[10px]"
          >
            {result.intact ? "PASS" : "FAIL"}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCell label="Range"        value={`${fmt(result.fromDate)} → ${fmt(result.toDate)}`} />
          <StatCell label="Anchors verified" value={String(result.anchorsChecked)} />
          <StatCell label="Broken at"    value={result.brokenAt ? fmt(result.brokenAt) : "—"} highlight={!!result.brokenAt} />
          <StatCell label="Gaps"         value={result.gaps.length === 0 ? "None" : String(result.gaps.length)} highlight={result.gaps.length > 0} />
        </div>

        {/* Broken chain detail */}
        {!result.intact && result.brokenAt && (
          <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-destructive">
                First broken link detected on {fmt(result.brokenAt)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                One or more audit log rows for this date have been modified, inserted, or
                deleted after the daily seal. Investigate log.audit_log rows where
                DATE(created_at) = &apos;{result.brokenAt}&apos; for tenant {result.tenantId}.
              </p>
            </div>
          </div>
        )}

        {/* Gaps detail */}
        {result.gaps.length > 0 && (
          <div className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning/5 px-4 py-3">
            <Info className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-warning">
                {result.gaps.length} date{result.gaps.length !== 1 ? "s" : ""} with no seal anchor
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                These dates had no log.hash_anchor row — either no events were logged, or
                the daily seal cron did not run. Gaps do not break the chain unless surrounded
                by anchors that diverge.
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {result.gaps.slice(0, 20).map((g) => (
                  <span key={g} className="rounded bg-warning/10 px-2 py-0.5 font-mono text-[11px] text-warning">
                    {g}
                  </span>
                ))}
                {result.gaps.length > 20 && (
                  <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    +{result.gaps.length - 20} more
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Intact confirmation */}
        {result.intact && result.anchorsChecked > 0 && (
          <div className="flex items-center gap-3 rounded-md border border-success/30 bg-success/5 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <p className="text-sm text-success">
              All {result.anchorsChecked} daily anchor
              {result.anchorsChecked !== 1 ? "s" : ""} verified — no tampering detected.
            </p>
          </div>
        )}

        {result.anchorsChecked === 0 && (
          <div className="flex items-center gap-3 rounded-md border border-muted/50 bg-muted/20 px-4 py-3">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              No hash anchors found for this date range. The daily seal job may not have run yet, or
              there were no audit events in this window.
            </p>
          </div>
        )}

        {/* Footer */}
        <p className="text-right text-[11px] text-muted-foreground">
          Verified at {fmtTs(result.verifiedAt)}
        </p>
      </CardContent>
    </Card>
  );
}

function StatCell({
  label, value, highlight = false,
}: {
  label: string; value: string; highlight?: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm font-medium", highlight && "text-destructive")}>{value}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuditIntegrityPage() {
  const [fromDate, setFromDate] = useState(monthStart(0));
  const [toDate, setToDate]     = useState(today());
  const [result, setResult]     = useState<IntegrityResult | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const check = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      setError(null);
      const res = await fetch("/api/relay/audit/integrity-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate: from, toDate: to }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String(body["message"] ?? body["error"] ?? "Verification failed"));
      }
      return res.json() as Promise<IntegrityResult>;
    },
    onSuccess: (data) => setResult(data),
    onError: (e) => setError(e instanceof Error ? e.message : "Unknown error"),
  });

  function applyPreset(p: typeof PRESETS[0]) {
    setFromDate(p.from);
    setToDate(p.to);
    setResult(null);
  }

  function runCheck() {
    setResult(null);
    check.mutate({ from: fromDate, to: toDate });
  }

  return (
    <PageFrame
      title="Hash-Chain Integrity"
      description="Verify the tamper-evident SHA-256 chain over audit log partitions"
    >
      {/* Info banner */}
      <div className="mb-6 flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
        <Hash className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium text-primary">How it works</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Each night the system seals the day&apos;s audit log into a SHA-256 anchor:
            <span className="font-mono text-[11px] mx-1">anchor(N) = SHA-256(anchor(N-1) + all events on day N)</span>
            This creates a chain where any retrospective edit to a historical row causes every
            subsequent anchor to diverge. Verification re-derives each anchor from raw rows and
            compares it to the stored value.
          </p>
        </div>
      </div>

      {/* Date range form */}
      <Card className="mb-6">
        <CardContent className="pt-5">
          <div className="space-y-4">
            {/* Presets */}
            <div className="space-y-1">
              <Label className="text-xs">Quick select</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={cn(
                      "rounded px-2.5 py-1 text-xs border transition-colors",
                      fromDate === p.from && toDate === p.to
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date inputs */}
            <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <CalendarRange className="h-3 w-3" />
                  From
                </Label>
                <Input
                  type="date"
                  value={fromDate}
                  max={toDate}
                  onChange={(e) => { setFromDate(e.target.value); setResult(null); }}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <CalendarRange className="h-3 w-3" />
                  To
                </Label>
                <Input
                  type="date"
                  value={toDate}
                  min={fromDate}
                  max={today()}
                  onChange={(e) => { setToDate(e.target.value); setResult(null); }}
                  className="text-sm"
                />
              </div>
            </div>

            {/* Run button */}
            <div className="flex items-center gap-3">
              <Button
                onClick={runCheck}
                disabled={check.isPending || !fromDate || !toDate}
                className="gap-1.5"
              >
                {check.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {check.isPending ? "Verifying…" : "Run Verification"}
              </Button>
              {result && !check.isPending && (
                <Badge variant={result.intact ? "success" : "destructive"} className="text-xs">
                  {result.intact ? "PASS" : "FAIL"}
                </Badge>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && <ResultPanel result={result} />}
    </PageFrame>
  );
}
