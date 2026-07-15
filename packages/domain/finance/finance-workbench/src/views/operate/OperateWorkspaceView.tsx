"use client";

import Link from "next/link";
import {
  AlertCircle, ArrowRight, BookOpen, CalendarDays, CheckCircle2, ExternalLink, Info, Wallet,
} from "lucide-react";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton,
} from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import { cn } from "@athyper/theme/utils";
import { WorkspaceHeader } from "../workspace/WorkspaceHeader";
import { PostabilityChip } from "../company-hub/PostabilityChip";
import { useCompanyHub } from "../../hooks/useCompanyHub";
import { useOperateBlockers, useOperateReconciliationSignals } from "../../hooks/useFinanceOperate";

export interface OperateWorkspaceViewProps {
  companyCode: string;
}

/**
 * Operate — read-only triage board. Deep links only. No mutations.
 */
export function OperateWorkspaceView({ companyCode }: OperateWorkspaceViewProps) {
  return (
    <PageFrame>
      <div className="flex flex-col gap-4 pb-10">
        <WorkspaceHeader companyCode={companyCode} workspace="operate" />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <PeriodGateCard companyCode={companyCode} />
          <PostingBlockersCard companyCode={companyCode} />
          <ReconciliationSignalsCard companyCode={companyCode} />
        </div>
      </div>
    </PageFrame>
  );
}


// ─── Period gate summary ────────────────────────────────────────────────────

function PeriodGateCard({ companyCode }: { companyCode: string }) {
  const hub = useCompanyHub({ companyCode });
  const p   = hub.data?.periodPostability;

  if (hub.isLoading || !p) {
    return (
      <Card><CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
        <CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>
    );
  }

  const periodCloseHref =
    `/finance/period-close?company=${encodeURIComponent(companyCode)}&fy=${p.fiscalYear}&period=${p.periodNumber}`;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
          <CardTitle className="text-base">Period gate</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Book <span className="font-medium text-foreground">{p.bookLabel}</span>
          {" · "}FY{p.fiscalYear} · P{String(p.periodNumber).padStart(2, "0")}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <PostabilityChip chip={p.chip} reasonCode={p.reasonCode} showReason />
        <div className="text-xs text-muted-foreground">
          <BookOpen className="mr-1 inline h-3 w-3" aria-hidden />
          Owned by Period Close. Use it to open, soft-close, or hard-close periods.
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href={periodCloseHref}>
            Go to Period Close
            <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}


// ─── Posting blockers (grouped) ─────────────────────────────────────────────

function PostingBlockersCard({ companyCode }: { companyCode: string }) {
  const q = useOperateBlockers(companyCode);

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-muted-foreground" aria-hidden />
          <CardTitle className="text-base">Posting blockers</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Grouped by category · deep-link into the source workspace.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : q.isError ? (
          <p className="text-sm text-destructive">Failed to load blockers.</p>
        ) : (q.data?.length ?? 0) === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            All clear — no posting blockers.
          </div>
        ) : (
          <ul role="list" className="space-y-2">
            {q.data!.map((g) => {
              const target = g.conflicts[0]?.actionHref ?? undefined;
              const targetLabel = g.conflicts[0]?.actionLabel ?? "View";
              return (
                <li
                  key={g.category}
                  className="flex items-start justify-between gap-3 rounded border border-border/60 bg-muted/20 p-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" size="sm">{g.count}</Badge>
                      <span className="text-sm font-medium">{g.categoryLabel}</span>
                    </div>
                    {g.topReasonCode && (
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {g.topReasonCode}
                      </p>
                    )}
                  </div>
                  {target ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={target}>
                        {targetLabel}
                        <ExternalLink className="ml-1 h-3 w-3" aria-hidden />
                      </Link>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}


// ─── Reconciliation signals ─────────────────────────────────────────────────

function ReconciliationSignalsCard({ companyCode }: { companyCode: string }) {
  const q = useOperateReconciliationSignals(companyCode);

  const summary = (() => {
    const rows = q.data ?? [];
    return {
      totalOpen:      rows.reduce((s, r) => s + r.openCases, 0),
      totalUnmatched: rows.reduce((s, r) => s + r.unmatchedLines, 0),
      bankCount:      rows.length,
    };
  })();

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden />
          <CardTitle className="text-base">Reconciliation signals</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Bank recon activity per house bank.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : q.isError ? (
          <p className="text-sm text-destructive">Failed to load recon signals.</p>
        ) : summary.bankCount === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4" aria-hidden />
            No house banks configured yet.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat label="Open cases" value={summary.totalOpen} tone={summary.totalOpen > 0 ? "warning" : "success"} />
              <MiniStat label="Unmatched" value={summary.totalUnmatched} tone={summary.totalUnmatched > 0 ? "warning" : "success"} />
              <MiniStat label="Banks" value={summary.bankCount} tone="info" />
            </div>
            <ul role="list" className="space-y-1">
              {q.data!.slice(0, 4).map((row) => (
                <li
                  key={row.bankAccountId}
                  className="flex items-center justify-between rounded border border-border/60 bg-muted/10 p-2 text-xs"
                >
                  <div className="min-w-0">
                    <span className="truncate font-medium">{row.bankAccountLabel}</span>
                    {row.glAccountCode && (
                      <span className="ml-1 font-mono text-muted-foreground">· GL {row.glAccountCode}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {row.openCases > 0 && <Badge variant="warning" size="sm">{row.openCases} open</Badge>}
                    {row.unmatchedLines > 0 && <Badge variant="warning" size="sm">{row.unmatchedLines} unmatched</Badge>}
                    {row.openCases === 0 && row.unmatchedLines === 0 && (
                      <Badge variant="success" size="sm">clean</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <Button asChild variant="secondary" size="sm">
          <Link href={`/finance/bank-recon?company=${encodeURIComponent(companyCode)}`}>
            Open Bank Reconciliation
            <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label, value, tone,
}: {
  label: string;
  value: number;
  tone: "warning" | "success" | "info";
}) {
  const cls = tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-info";
  return (
    <div className="rounded border p-2">
      <p className={cn("text-lg font-semibold tabular-nums", cls)}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
