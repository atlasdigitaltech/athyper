"use client";

// components/finance/admin/CloseDocumentReadinessPanel.tsx
//
// Close Document Readiness cockpit widget — embeds document-registry
// awareness directly into the Close Orchestration Dashboard.
//
// 4 sections:
//   1. Readiness summary bar (ready vs defect, by severity)
//   2. Doc-type breakdown table (ready/defect counts per type)
//   3. Defect aging buckets (CRITICAL/OVERDUE/AGING/RECENT)
//   4. Blocker highlights (accrual gaps, book gaps, approval gaps)

import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCloseDocumentReadiness } from "@/lib/finance/use-close-document-readiness";
import type {
  CloseDocumentSummaryDTO,
  CloseDocTypeBreakdownDTO,
  DefectAgingDTO,
  AgingBucket,
  BookPostingSummaryDTO,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CloseDocumentReadinessPanelProps {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  /** Optional book filter for multi-book close */
  bookCode?: string;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CloseDocumentReadinessPanel({
  entityCode,
  fiscalYear,
  periodNumber,
  bookCode,
}: CloseDocumentReadinessPanelProps) {
  const {
    summary,
    defects,
    accrualGaps,
    postingGaps,
    bookSummary,
    reversedMisaligned,
    approvalGaps,
    defectAging,
    loading,
    error,
    refresh,
  } = useCloseDocumentReadiness({
    entityCode,
    fiscalYear,
    periodNumber,
    bookCode,
    includeAging: true,
  });

  if (loading && !summary) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading document readiness…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-destructive">
          <AlertCircle className="mr-2 h-4 w-4" />
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  const hasBlockers =
    summary.highSeverityDefects > 0 ||
    (accrualGaps && accrualGaps.length > 0) ||
    (bookSummary && bookSummary.some((b) => b.failedCount > 0 || b.missingCount > 0)) ||
    (reversedMisaligned && reversedMisaligned.length > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-indigo-600" />
            Document Readiness
            {summary.allReady ? (
              <Badge variant="default" className="bg-emerald-600 ml-1">All Ready</Badge>
            ) : hasBlockers ? (
              <Badge variant="destructive" className="ml-1">Blockers</Badge>
            ) : (
              <Badge variant="secondary" className="ml-1">
                {summary.readinessPercent}%
              </Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <CardDescription>
          {summary.totalDocuments} document{summary.totalDocuments !== 1 ? "s" : ""} in period
          {bookCode ? ` · Book: ${bookCode}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 1. Readiness summary bar */}
        <ReadinessSummaryBar summary={summary} />

        {/* 2. Doc-type breakdown */}
        {summary.byDocType.length > 0 && (
          <DocTypeBreakdownTable breakdowns={summary.byDocType} />
        )}

        {/* 3. Defect aging (if defects exist) */}
        {defectAging && defectAging.length > 0 && (
          <DefectAgingSection aging={defectAging} />
        )}

        {/* 4. Blocker highlights */}
        {hasBlockers && (
          <BlockerHighlights
            highSeverity={summary.highSeverityDefects}
            accrualGapCount={accrualGaps?.length ?? 0}
            postingGapCount={postingGaps?.length ?? 0}
            bookSummary={bookSummary}
            reversedCount={reversedMisaligned?.length ?? 0}
            approvalGapCount={approvalGaps?.length ?? 0}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 1. Readiness Summary Bar
// ---------------------------------------------------------------------------

function ReadinessSummaryBar({ summary }: { summary: CloseDocumentSummaryDTO }) {
  const readyPct = summary.readinessPercent;
  const defectPct = 100 - readyPct;

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
        {readyPct > 0 && (
          <div
            className="bg-emerald-500 transition-all duration-300"
            style={{ width: `${readyPct}%` }}
          />
        )}
        {summary.highSeverityDefects > 0 && (
          <div
            className="bg-red-500"
            style={{
              width: `${(summary.highSeverityDefects / summary.totalDocuments) * 100}%`,
            }}
          />
        )}
        {summary.mediumSeverityDefects > 0 && (
          <div
            className="bg-amber-400"
            style={{
              width: `${(summary.mediumSeverityDefects / summary.totalDocuments) * 100}%`,
            }}
          />
        )}
        {summary.lowSeverityDefects > 0 && (
          <div
            className="bg-gray-300"
            style={{
              width: `${(summary.lowSeverityDefects / summary.totalDocuments) * 100}%`,
            }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Ready: {summary.readyDocuments}
        </span>
        {summary.highSeverityDefects > 0 && (
          <span className="flex items-center gap-1 text-red-600">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            High: {summary.highSeverityDefects}
          </span>
        )}
        {summary.mediumSeverityDefects > 0 && (
          <span className="flex items-center gap-1 text-amber-600">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
            Medium: {summary.mediumSeverityDefects}
          </span>
        )}
        {summary.lowSeverityDefects > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-gray-300" />
            Low: {summary.lowSeverityDefects}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Doc-Type Breakdown Table
// ---------------------------------------------------------------------------

function DocTypeBreakdownTable({ breakdowns }: { breakdowns: CloseDocTypeBreakdownDTO[] }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Doc Type</TableHead>
            <TableHead className="text-xs text-right">Ready</TableHead>
            <TableHead className="text-xs text-right">Defects</TableHead>
            <TableHead className="text-xs text-right">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {breakdowns.map((b) => (
            <TableRow key={b.docType}>
              <TableCell className="text-xs font-medium">
                {formatDocType(b.docType)}
              </TableCell>
              <TableCell className="text-xs text-right text-emerald-600">
                {b.readyCount}
              </TableCell>
              <TableCell className="text-xs text-right">
                {b.defectCount > 0 ? (
                  <Tooltip>
                    <TooltipTrigger>
                      <span className="text-red-600 font-medium">{b.defectCount}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs space-y-0.5">
                        {b.defects.failed > 0 && <p>Failed: {b.defects.failed}</p>}
                        {b.defects.approvedNotPosted > 0 && <p>Approved not posted: {b.defects.approvedNotPosted}</p>}
                        {b.defects.postingPending > 0 && <p>Posting pending: {b.defects.postingPending}</p>}
                        {b.defects.unfinalized > 0 && <p>Unfinalized: {b.defects.unfinalized}</p>}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell className="text-xs text-right">
                <span className={b.readinessPercent === 100 ? "text-emerald-600" : "text-muted-foreground"}>
                  {b.readinessPercent}%
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Defect Aging Section
// ---------------------------------------------------------------------------

const AGING_CONFIG: Record<AgingBucket, { label: string; color: string; bgColor: string; icon: typeof Clock }> = {
  CRITICAL: { label: "Critical (>72h)", color: "text-red-700", bgColor: "bg-red-50 border-red-200", icon: XCircle },
  OVERDUE: { label: "Overdue (>24h)", color: "text-orange-700", bgColor: "bg-orange-50 border-orange-200", icon: AlertTriangle },
  AGING: { label: "Aging (>8h)", color: "text-amber-700", bgColor: "bg-amber-50 border-amber-200", icon: Clock },
  RECENT: { label: "Recent (<8h)", color: "text-gray-600", bgColor: "bg-gray-50 border-gray-200", icon: Clock },
};

function DefectAgingSection({ aging }: { aging: DefectAgingDTO[] }) {
  const buckets = useMemo(() => {
    const counts: Record<AgingBucket, number> = { CRITICAL: 0, OVERDUE: 0, AGING: 0, RECENT: 0 };
    for (const d of aging) {
      counts[d.agingBucket] = (counts[d.agingBucket] ?? 0) + 1;
    }
    return counts;
  }, [aging]);

  const nonEmptyBuckets = (Object.entries(buckets) as [AgingBucket, number][])
    .filter(([, count]) => count > 0);

  if (nonEmptyBuckets.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Defect Aging</p>
      <div className="flex flex-wrap gap-2">
        {nonEmptyBuckets.map(([bucket, count]) => {
          const cfg = AGING_CONFIG[bucket];
          const Icon = cfg.icon;
          return (
            <div
              key={bucket}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${cfg.bgColor}`}
            >
              <Icon className={`h-3 w-3 ${cfg.color}`} />
              <span className={`font-medium ${cfg.color}`}>{count}</span>
              <span className="text-muted-foreground">{cfg.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Blocker Highlights
// ---------------------------------------------------------------------------

function BlockerHighlights({
  highSeverity,
  accrualGapCount,
  postingGapCount,
  bookSummary,
  reversedCount,
  approvalGapCount,
}: {
  highSeverity: number;
  accrualGapCount: number;
  postingGapCount: number;
  bookSummary: BookPostingSummaryDTO[] | null;
  reversedCount: number;
  approvalGapCount: number;
}) {
  const bookGaps = useMemo(() => {
    if (!bookSummary) return { failed: 0, missing: 0 };
    let failed = 0;
    let missing = 0;
    for (const b of bookSummary) {
      failed += b.failedCount;
      missing += b.missingCount;
    }
    return { failed, missing };
  }, [bookSummary]);

  const items: Array<{ icon: typeof AlertCircle; label: string; count: number; severity: "high" | "medium" | "low" }> = [];

  if (highSeverity > 0)
    items.push({ icon: XCircle, label: "High-severity defects (failed/unapproved posting)", count: highSeverity, severity: "high" });
  if (accrualGapCount > 0)
    items.push({ icon: AlertTriangle, label: "Accrual reversals due this period", count: accrualGapCount, severity: "high" });
  if (bookGaps.failed > 0)
    items.push({ icon: BookOpen, label: "Multi-book posting failures", count: bookGaps.failed, severity: "high" });
  if (bookGaps.missing > 0)
    items.push({ icon: BookOpen, label: "Multi-book posting gaps", count: bookGaps.missing, severity: "medium" });
  if (reversedCount > 0)
    items.push({ icon: AlertCircle, label: "Reversed docs with misaligned reversal", count: reversedCount, severity: "medium" });
  if (postingGapCount > 0)
    items.push({ icon: ShieldAlert, label: "Approved docs awaiting posting", count: postingGapCount, severity: "medium" });
  if (approvalGapCount > 0)
    items.push({ icon: ShieldAlert, label: "Missing approval evidence", count: approvalGapCount, severity: "low" });

  if (items.length === 0) return null;

  const severityColor = {
    high: "text-red-600",
    medium: "text-amber-600",
    low: "text-gray-500",
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Close Blockers</p>
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${severityColor[item.severity]}`} />
              <span className="text-muted-foreground">{item.label}</span>
              <Badge variant="outline" className={`ml-auto text-[10px] ${severityColor[item.severity]}`}>
                {item.count}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDocType(docType: string): string {
  return docType
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
