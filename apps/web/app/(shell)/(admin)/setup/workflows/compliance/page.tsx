"use client";

/**
 * Workflow Compliance Report — /setup/workflows/compliance
 *
 * Aggregate KPIs across workflow requests in a configurable date window:
 *   Summary cards  — total, approved, rejected, pending, avg approval time,
 *                    SLA breach rate, rejection rate, stuck item count
 *   By-template    — breakdown table per workflow template / entity type
 *   Stuck items    — live count of work items flagged by recovery worker
 *
 * Data source: GET /api/relay/workflow/reports/compliance
 */

import { useState, useCallback } from "react";
import {
  GitMerge, Clock, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, TrendingDown, ShieldAlert, Timer, Loader2,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  useRelayQuery,
  SectionHeader,
  LoadingRows,
  fmtDateTime,
} from "../../_components/admin-ui";
import { Badge } from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ComplianceSummary {
  totalRequests:      number;
  approved:           number;
  rejected:           number;
  pending:            number;
  avgApprovalMinutes: number | null;
  slaBreachedCount:   number;
  slaBreachRate:      number;  // percentage 0-100
  rejectionRate:      number;  // percentage 0-100
  stuckItemCount:     number;
  fromDate:           string;
  toDate:             string;
}

interface TemplateRow {
  templateId:         string | null;
  templateName:       string | null;
  templateCode:       string | null;
  entityType:         string;
  totalRequests:      number;
  approved:           number;
  rejected:           number;
  pending:            number;
  avgApprovalMinutes: number | null;
  slaBreachedCount:   number;
}

interface ComplianceReport {
  summary:    ComplianceSummary;
  byTemplate: TemplateRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60)     return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h < 24)           return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

function fmtRate(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?:  string;
  icon:  React.ComponentType<{ className?: string }>;
  accent?: "green" | "red" | "amber" | "blue" | "slate";
}) {
  const iconCls = {
    green: "text-success",
    red:   "text-destructive",
    amber: "text-warning",
    blue:  "text-primary",
    slate: "text-muted-foreground",
  }[accent ?? "slate"] ?? "text-muted-foreground";

  return (
    <div className="rounded-lg border bg-card p-4 flex items-start gap-3">
      <div className={cn("mt-0.5 shrink-0", iconCls)}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Date range picker ─────────────────────────────────────────────────────────

const PRESETS = [
  { label: "Last 7 days",  days: 7  },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Sortable column head ──────────────────────────────────────────────────────

type SortKey = keyof TemplateRow;

function SortHead({
  col,
  label,
  sort,
  onSort,
}: {
  col:    SortKey;
  label:  string;
  sort:   { key: SortKey; dir: "asc" | "desc" } | null;
  onSort: (k: SortKey) => void;
}) {
  const active = sort?.key === col;
  const Icon = active
    ? sort!.dir === "asc" ? ChevronUp : ChevronDown
    : ChevronsUpDown;
  return (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap"
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className="size-3" />
      </span>
    </th>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WorkflowCompliancePage() {
  const [preset,    setPreset]    = useState(1);  // 30 days default
  const [entityFilter, setEntityFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const fromDate = toISO(new Date(Date.now() - PRESETS[preset]!.days * 86_400_000));
  const toDate   = toISO(new Date());

  const qs = new URLSearchParams({ from: fromDate, to: toDate });
  if (entityFilter.trim()) qs.set("entity_type", entityFilter.trim());

  const queryKey = ["workflow-compliance", fromDate, toDate, entityFilter];

  const { data, isLoading, isError, refetch, isFetching } =
    useRelayQuery<ComplianceReport>(queryKey, `/workflow/reports/compliance?${qs}`);

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }, []);

  const summary = data?.summary;

  // Sort the template rows
  let rows = data?.byTemplate ?? [];
  if (sort) {
    rows = [...rows].sort((a, b) => {
      const av = a[sort.key] ?? 0;
      const bv = b[sort.key] ?? 0;
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }

  // Filter by entity type client-side (server also filters but local is instant)
  if (entityFilter.trim()) {
    rows = rows.filter((r) =>
      r.entityType.toLowerCase().includes(entityFilter.trim().toLowerCase())
    );
  }

  const pct = (n: number, d: number) =>
    d > 0 ? Math.round((n / d) * 1000) / 10 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          icon={GitMerge}
          title="Workflow Compliance"
          description="Approval throughput, SLA adherence, and rejection trends."
        />
        <button
          onClick={() => void refetch()}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors"
          disabled={isFetching}
        >
          <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Date range + filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Period:</span>
        {PRESETS.map((p, i) => (
          <button
            key={p.days}
            onClick={() => setPreset(i)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              preset === i
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted/50"
            )}
          >
            {p.label}
          </button>
        ))}
        <span className="text-xs text-muted-foreground ml-2">|</span>
        <input
          className="h-7 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring w-40"
          placeholder="Filter entity type…"
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
        />
        {summary && (
          <span className="text-xs text-muted-foreground ml-auto">
            {fmtDateTime(summary.fromDate)} → {fmtDateTime(summary.toDate)}
          </span>
        )}
      </div>

      {/* Loading / error */}
      {isLoading && (
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card p-4 h-[88px] animate-pulse bg-muted/40" />
            ))}
          </div>
          <LoadingRows rows={5} cols={6} />
        </div>
      )}

      {isError && !isLoading && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center space-y-2">
          <AlertTriangle className="size-8 mx-auto text-destructive/60" />
          <p className="text-sm text-destructive">Failed to load compliance data.</p>
          <button
            onClick={() => void refetch()}
            className="text-xs text-muted-foreground underline"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && summary && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="Total requests"
              value={summary.totalRequests.toLocaleString()}
              icon={GitMerge}
              accent="blue"
            />
            <KpiCard
              label="Approved"
              value={summary.approved.toLocaleString()}
              sub={fmtRate(pct(summary.approved, summary.totalRequests))}
              icon={CheckCircle2}
              accent="green"
            />
            <KpiCard
              label="Rejected"
              value={summary.rejected.toLocaleString()}
              sub={`${fmtRate(summary.rejectionRate)} rejection rate`}
              icon={XCircle}
              accent={summary.rejectionRate > 20 ? "red" : "slate"}
            />
            <KpiCard
              label="Pending"
              value={summary.pending.toLocaleString()}
              icon={Loader2}
              accent="slate"
            />
            <KpiCard
              label="Avg approval time"
              value={fmtDuration(summary.avgApprovalMinutes)}
              sub="from creation to decision"
              icon={Timer}
              accent="blue"
            />
            <KpiCard
              label="SLA breached"
              value={summary.slaBreachedCount.toLocaleString()}
              sub={`${fmtRate(summary.slaBreachRate)} breach rate`}
              icon={ShieldAlert}
              accent={summary.slaBreachRate > 10 ? "red" : summary.slaBreachRate > 5 ? "amber" : "slate"}
            />
            <KpiCard
              label="Rejection rate"
              value={fmtRate(summary.rejectionRate)}
              icon={TrendingDown}
              accent={summary.rejectionRate > 25 ? "red" : summary.rejectionRate > 10 ? "amber" : "green"}
            />
            <KpiCard
              label="Stuck items"
              value={summary.stuckItemCount.toLocaleString()}
              sub="active, no activity > 24h"
              icon={Clock}
              accent={summary.stuckItemCount > 0 ? "amber" : "green"}
            />
          </div>

          {/* Per-template table */}
          <div className="rounded-lg border overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
              <p className="text-sm font-semibold">By template / entity type</p>
              <span className="text-xs text-muted-foreground">{rows.length} row{rows.length !== 1 ? "s" : ""}</span>
            </div>
            {rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No workflow requests in this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/20">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Template</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Entity type</th>
                      <SortHead col="totalRequests"      label="Total"       sort={sort} onSort={handleSort} />
                      <SortHead col="approved"           label="Approved"    sort={sort} onSort={handleSort} />
                      <SortHead col="rejected"           label="Rejected"    sort={sort} onSort={handleSort} />
                      <SortHead col="pending"            label="Pending"     sort={sort} onSort={handleSort} />
                      <SortHead col="avgApprovalMinutes" label="Avg time"    sort={sort} onSort={handleSort} />
                      <SortHead col="slaBreachedCount"   label="SLA breach"  sort={sort} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r, i) => {
                      const total      = r.totalRequests;
                      const rejRate    = pct(r.rejected,         total);
                      const slaRate    = pct(r.slaBreachedCount, total);
                      return (
                        <tr key={r.templateId ?? `${r.entityType}-${i}`} className="hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium truncate max-w-[180px]">
                                {r.templateName ?? <span className="text-muted-foreground italic">No template</span>}
                              </span>
                              {r.templateCode && (
                                <span className="font-mono text-[10px] bg-muted/60 border px-1 py-0.5 rounded text-muted-foreground">
                                  {r.templateCode}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-xs text-muted-foreground font-mono">{r.entityType}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center font-medium">{total.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="text-success">{r.approved}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={rejRate > 20 ? "text-destructive font-medium" : ""}>
                              {r.rejected}
                            </span>
                            {rejRate > 0 && (
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                ({fmtRate(rejRate)})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center text-muted-foreground">{r.pending}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={cn(
                              "text-xs",
                              r.avgApprovalMinutes && r.avgApprovalMinutes > 1440
                                ? "text-warning"
                                : ""
                            )}>
                              {fmtDuration(r.avgApprovalMinutes)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {r.slaBreachedCount > 0 ? (
                              <Badge
                                variant={slaRate > 10 ? "destructive" : "warning"}
                                className="text-[10px]"
                              >
                                {r.slaBreachedCount} ({fmtRate(slaRate)})
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Stuck items callout */}
          {summary.stuckItemCount > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 flex items-start gap-3">
              <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-medium text-warning">
                  {summary.stuckItemCount} stuck work item{summary.stuckItemCount !== 1 ? "s" : ""} detected
                </p>
                <p className="text-xs text-warning/80">
                  These approval tasks have been in an active state for over 24 hours with no
                  recent activity. They have been flagged in the event outbox
                  (topic&nbsp;=&nbsp;<code className="font-mono">wf</code>,
                  event_type&nbsp;=&nbsp;<code className="font-mono">wf.work_item.stuck</code>)
                  for operator review. Consider escalating or reassigning these items.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
