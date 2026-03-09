"use client";

// components/finance/admin/PeriodCloseGovernance.tsx
//
// Period Close Governance Dashboard — displays the close checklist,
// progress bar, handler evidence, failure categories with action hints,
// and a "Run All Checks" button for target transition gates.

import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Clock,
  Database,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Shield,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";

import { DateCell } from "../list/finance-shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { finPost } from "@/lib/finance/fetcher";
import { FinanceHttpError } from "@/lib/finance/errors";
import { usePeriodClose, type PeriodCloseParams } from "@/lib/finance/use-period-close";
import type {
  PeriodCloseChecklistDTO,
  ChecklistTaskStatus,
  CloseTaskCategory,
  CloseTaskCompletionMode,
  CloseTaskSeverity,
  EvidenceCode,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Status icon + color mappings
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<ChecklistTaskStatus, {
  icon: typeof Check;
  bg: string;
  text: string;
  label: string;
}> = {
  PENDING: { icon: CircleDashed, bg: "bg-gray-100", text: "text-gray-600", label: "Pending" },
  IN_PROGRESS: { icon: Loader2, bg: "bg-blue-100", text: "text-blue-700", label: "In Progress" },
  COMPLETED: { icon: CheckCircle2, bg: "bg-green-100", text: "text-green-700", label: "Completed" },
  WAIVED: { icon: Shield, bg: "bg-amber-100", text: "text-amber-700", label: "Waived" },
  BLOCKED: { icon: Ban, bg: "bg-orange-100", text: "text-orange-700", label: "Blocked" },
  FAILED: { icon: XCircle, bg: "bg-red-100", text: "text-red-700", label: "Failed" },
};

const SEVERITY_CONFIG: Record<CloseTaskSeverity, {
  bg: string;
  text: string;
}> = {
  low: { bg: "bg-gray-100", text: "text-gray-600" },
  medium: { bg: "bg-blue-100", text: "text-blue-600" },
  high: { bg: "bg-amber-100", text: "text-amber-700" },
  critical: { bg: "bg-red-100", text: "text-red-700" },
};

const CATEGORY_LABELS: Record<CloseTaskCategory, string> = {
  SUBLEDGER: "Subledger",
  CONSOLIDATION: "Consolidation",
  VALIDATION: "Validation",
  TAX: "Tax",
  CASH: "Cash",
  REVENUE: "Revenue",
  ADJUSTMENTS: "Adjustments",
  APPROVAL: "Approval",
};

const COMPLETION_MODE_LABELS: Record<CloseTaskCompletionMode, string> = {
  MANUAL: "Manual",
  SYSTEM: "System",
  HYBRID: "Hybrid",
};

// ---------------------------------------------------------------------------
// Failure category → icon + action hint for UI
// ---------------------------------------------------------------------------

const EVIDENCE_CODE_CONFIG: Partial<Record<EvidenceCode, {
  icon: typeof AlertCircle;
  label: string;
  defaultActionHint: string;
}>> = {
  NOT_APPLICABLE: {
    icon: Check,
    label: "Not Applicable",
    defaultActionHint: "No action needed — this check does not apply to the current entity.",
  },
  MISSING_DATA: {
    icon: Database,
    label: "Missing Data",
    defaultActionHint: "No data found for this period. Ensure transactions are posted before running this check.",
  },
  MISSING_PREREQUISITE: {
    icon: AlertTriangle,
    label: "Missing Prerequisite",
    defaultActionHint: "Required reference data is missing (e.g., fiscal period, legal entity). Configure the prerequisite first.",
  },
  CONTEXT_MISSING_ENTITY: {
    icon: AlertTriangle,
    label: "Missing Entity",
    defaultActionHint: "Legal entity not found. Register it in the entity registry.",
  },
  MISSING_RUN: {
    icon: Play,
    label: "Not Executed",
    defaultActionHint: "The required process has not been run yet. Execute it to proceed.",
  },
  RUN_FAILED: {
    icon: XCircle,
    label: "Run Failed",
    defaultActionHint: "The process was executed but failed. Investigate the error and retry.",
  },
  RUN_INCOMPLETE: {
    icon: Loader2,
    label: "Run Incomplete",
    defaultActionHint: "The process started but has not completed. Wait for completion or investigate.",
  },
  POSTING_INCOMPLETE: {
    icon: ExternalLink,
    label: "Posting Incomplete",
    defaultActionHint: "Computation is done but journal entries have not been posted. Post the pending entries.",
  },
  RECONCILIATION_INCOMPLETE: {
    icon: AlertCircle,
    label: "Reconciliation Incomplete",
    defaultActionHint: "One or more bank statements have reconciliation issues. Review and resolve each.",
  },
  UNMATCHED_ITEMS: {
    icon: ShieldAlert,
    label: "Unmatched Items",
    defaultActionHint: "Some transactions remain unmatched in the reconciliation. Match or exclude them.",
  },
  DISCREPANCY: {
    icon: AlertTriangle,
    label: "Discrepancy",
    defaultActionHint: "A balance discrepancy exceeds tolerance. Investigate and resolve the difference.",
  },
};

// ---------------------------------------------------------------------------
// Gate filter options
// ---------------------------------------------------------------------------

const GATE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All Tasks" },
  { value: "SOFT_CLOSE", label: "Soft Close Gate" },
  { value: "HARD_CLOSE", label: "Hard Close Gate" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PeriodCloseGovernanceProps {
  params: PeriodCloseParams;
}

export function PeriodCloseGovernance({ params }: PeriodCloseGovernanceProps) {
  const { items, progress, loading, error, refresh } = usePeriodClose(params);
  const [gateFilter, setGateFilter] = useState("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [runningChecks, setRunningChecks] = useState(false);

  const runAllChecks = useCallback(async () => {
    setRunningChecks(true);
    try {
      const result = await finPost<{
        data: {
          executed: number;
          passed: number;
          failed: number;
          message: string;
        };
      }>(
        "/api/fin/period-close",
        {
          action: "run-checks",
          entityCode: params.entityCode,
          fiscalYear: params.fiscalYear,
          periodNumber: params.periodNumber,
          targetStatus: gateFilter !== "all" ? gateFilter : undefined,
        },
      );
      const { executed, passed, failed, message } = result.data;
      if (executed === 0) {
        toast.info(message);
      } else if (failed === 0) {
        toast.success(message);
      } else if (passed === 0) {
        toast.error(message);
      } else {
        toast.warning(message);
      }
      refresh();
    } catch (err) {
      const message =
        err instanceof FinanceHttpError ? err.message
          : err instanceof Error ? err.message
          : "Failed to run checks";
      toast.error(message);
    } finally {
      setRunningChecks(false);
    }
  }, [params, gateFilter, refresh]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (gateFilter === "all") return items;
    return items.filter((i) => i.task.requiredBefore === gateFilter);
  }, [items, gateFilter]);

  // When gate-filtered, recompute progress from visible items only
  const displayProgress = useMemo(() => {
    if (!progress) return null;
    if (gateFilter === "all") return progress;
    // Derive progress from filtered items
    const total = filteredItems.length;
    if (total === 0) return { ...progress, totalTasks: 0, completionPct: 0, completedCount: 0, waivedCount: 0, failedCount: 0, blockedCount: 0, inProgressCount: 0, pendingCount: 0 };
    let completed = 0, waived = 0, failed = 0, blocked = 0, inProg = 0, pending = 0;
    for (const item of filteredItems) {
      switch (item.taskStatus) {
        case "COMPLETED": completed++; break;
        case "WAIVED": waived++; break;
        case "FAILED": failed++; break;
        case "BLOCKED": blocked++; break;
        case "IN_PROGRESS": inProg++; break;
        case "PENDING": pending++; break;
      }
    }
    return {
      totalTasks: total,
      completedCount: completed,
      waivedCount: waived,
      failedCount: failed,
      blockedCount: blocked,
      inProgressCount: inProg,
      pendingCount: pending,
      completionPct: Math.round(((completed + waived) / total) * 100),
    };
  }, [progress, gateFilter, filteredItems]);

  // Group by category for section headers
  const grouped = useMemo(() => {
    const groups = new Map<CloseTaskCategory, PeriodCloseChecklistDTO[]>();
    for (const item of filteredItems) {
      const cat = item.task.category;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    return groups;
  }, [filteredItems]);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* ── Header ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Period Close Governance</h2>
            <span className="text-sm text-muted-foreground">
              {params.entityCode} / FY{params.fiscalYear} P{params.periodNumber}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Select value={gateFilter} onValueChange={setGateFilter}>
              <SelectTrigger className="w-[160px]" size="sm">
                <SelectValue placeholder="Gate" />
              </SelectTrigger>
              <SelectContent>
                {GATE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="default"
              size="sm"
              onClick={runAllChecks}
              disabled={runningChecks || loading}
            >
              {runningChecks
                ? <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                : <Play className="mr-1.5 size-3.5" />}
              Run All Checks
            </Button>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`mr-1.5 size-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* ── Progress bar ──────────────────────────────────────── */}
        {displayProgress && (
          <div className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                Close Progress: {displayProgress.completionPct}%
                {gateFilter !== "all" && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    ({gateFilter === "SOFT_CLOSE" ? "Soft Close" : "Hard Close"} gate)
                  </span>
                )}
              </span>
              <span className="text-muted-foreground">
                {displayProgress.completedCount + displayProgress.waivedCount} / {displayProgress.totalTasks} resolved
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${displayProgress.completionPct}%` }}
              />
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="size-3 text-green-600" />
                {displayProgress.completedCount} completed
              </span>
              <span className="flex items-center gap-1">
                <Shield className="size-3 text-amber-600" />
                {displayProgress.waivedCount} waived
              </span>
              {displayProgress.failedCount > 0 && (
                <span className="flex items-center gap-1">
                  <XCircle className="size-3 text-red-600" />
                  {displayProgress.failedCount} failed
                </span>
              )}
              {displayProgress.blockedCount > 0 && (
                <span className="flex items-center gap-1">
                  <Ban className="size-3 text-orange-600" />
                  {displayProgress.blockedCount} blocked
                </span>
              )}
              {displayProgress.inProgressCount > 0 && (
                <span className="flex items-center gap-1">
                  <Loader2 className="size-3 text-blue-600" />
                  {displayProgress.inProgressCount} in progress
                </span>
              )}
              <span className="flex items-center gap-1">
                <CircleDashed className="size-3 text-gray-400" />
                {displayProgress.pendingCount} pending
              </span>
            </div>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* ── Loading ───────────────────────────────────────────── */}
        {loading && !items && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* ── Checklist table ───────────────────────────────────── */}
        {items && items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30px]" />
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead>Task</TableHead>
                <TableHead className="w-[100px]">Category</TableHead>
                <TableHead className="w-[80px]">Mode</TableHead>
                <TableHead className="w-[80px]">Severity</TableHead>
                <TableHead className="w-[80px]">Gate</TableHead>
                <TableHead className="w-[120px]">Last Check</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from(grouped.entries()).map(([category, categoryItems]) => (
                <CategorySection
                  key={category}
                  category={category}
                  items={categoryItems}
                  expandedRow={expandedRow}
                  onToggleExpand={(id) => setExpandedRow(expandedRow === id ? null : id)}
                />
              ))}
            </TableBody>
          </Table>
        )}

        {/* ── Empty state ───────────────────────────────────────── */}
        {!loading && items && items.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No checklist items found. The checklist may not be materialized yet for this period.
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Category section (group header + rows)
// ---------------------------------------------------------------------------

function CategorySection({
  category,
  items,
  expandedRow,
  onToggleExpand,
}: {
  category: CloseTaskCategory;
  items: PeriodCloseChecklistDTO[];
  expandedRow: string | null;
  onToggleExpand: (id: string) => void;
}) {
  return (
    <>
      {/* Category header row */}
      <TableRow className="bg-muted/50 hover:bg-muted/50">
        <TableCell colSpan={8} className="py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {CATEGORY_LABELS[category] ?? category}
          </span>
        </TableCell>
      </TableRow>
      {items.map((item) => (
        <ChecklistRow
          key={item.id}
          item={item}
          isExpanded={expandedRow === item.id}
          onToggle={() => onToggleExpand(item.id)}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Checklist row + expandable detail panel
// ---------------------------------------------------------------------------

function ChecklistRow({
  item,
  isExpanded,
  onToggle,
}: {
  item: PeriodCloseChecklistDTO;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const status = STATUS_CONFIG[item.taskStatus];
  const StatusIcon = status.icon;
  const severity = item.task.severity ? SEVERITY_CONFIG[item.task.severity] : null;
  const hasDetail = item.lastHandlerResult || item.failureReason || item.completionNotes;

  return (
    <>
      <TableRow
        className={`cursor-pointer ${isExpanded ? "bg-muted/30" : ""}`}
        onClick={onToggle}
      >
        {/* Expand chevron */}
        <TableCell className="px-2">
          {hasDetail ? (
            isExpanded
              ? <ChevronDown className="size-4 text-muted-foreground" />
              : <ChevronRight className="size-4 text-muted-foreground" />
          ) : (
            <span className="size-4" />
          )}
        </TableCell>

        {/* Status badge */}
        <TableCell>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.bg} ${status.text}`}>
            <StatusIcon className={`size-3 ${item.taskStatus === "IN_PROGRESS" ? "animate-spin" : ""}`} />
            {status.label}
          </span>
        </TableCell>

        {/* Task name + mandatory badge */}
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{item.task.taskName}</span>
            {item.isMandatory && (
              <Badge variant="outline" className="text-[10px] px-1 py-0">Required</Badge>
            )}
            {item.waiverStatus === "pending_approval" && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-yellow-100 text-yellow-700">
                Waiver Pending
              </Badge>
            )}
          </div>
          {item.task.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
              {item.task.description}
            </p>
          )}
        </TableCell>

        {/* Category */}
        <TableCell className="text-xs text-muted-foreground">
          {CATEGORY_LABELS[item.task.category] ?? item.task.category}
        </TableCell>

        {/* Completion mode */}
        <TableCell>
          <CompletionModeBadge mode={item.task.completionMode} />
        </TableCell>

        {/* Severity */}
        <TableCell>
          {severity && item.task.severity && (
            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${severity.bg} ${severity.text}`}>
              {item.task.severity}
            </span>
          )}
        </TableCell>

        {/* Gate */}
        <TableCell className="text-xs text-muted-foreground">
          {item.task.requiredBefore === "SOFT_CLOSE" ? "Soft" : "Hard"}
        </TableCell>

        {/* Last handler run */}
        <TableCell>
          {item.lastHandlerRunAt ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  <DateCell date={item.lastHandlerRunAt} />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Run #{item.handlerRunCount}
                {item.lastHandlerResult
                  ? ` — ${item.lastHandlerResult.passed ? "Passed" : "Failed"}`
                  : ""}
              </TooltipContent>
            </Tooltip>
          ) : item.task.completionMode !== "MANUAL" ? (
            <span className="text-xs text-muted-foreground/50">Not run</span>
          ) : null}
        </TableCell>
      </TableRow>

      {/* ── Expanded detail panel ────────────────────────────── */}
      {isExpanded && hasDetail && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell />
          <TableCell colSpan={7} className="py-3">
            <TaskDetailPanel item={item} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Task detail panel (handler evidence, failure info, action hints)
// ---------------------------------------------------------------------------

function TaskDetailPanel({ item }: { item: PeriodCloseChecklistDTO }) {
  const result = item.lastHandlerResult;
  const evidenceCode = result?.evidenceCode ?? null;
  const codeConfig = evidenceCode ? EVIDENCE_CODE_CONFIG[evidenceCode] : null;
  const CodeIcon = codeConfig?.icon;
  const actionHint = result?.nextSuggestedAction ?? codeConfig?.defaultActionHint;

  return (
    <div className="space-y-3">
      {/* Handler result summary */}
      {result && (
        <div className={`rounded-md border p-3 ${result.passed ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
          <div className="flex items-start gap-2">
            {result.passed
              ? <CheckCircle2 className="mt-0.5 size-4 text-green-600 shrink-0" />
              : <XCircle className="mt-0.5 size-4 text-red-600 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${result.passed ? "text-green-800" : "text-red-800"}`}>
                {result.passed ? "Check Passed" : "Check Failed"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{result.message}</p>
            </div>
          </div>

          {/* Evidence code classification + action hint */}
          {!result.passed && (codeConfig || actionHint) && (
            <div className="mt-2 flex items-start gap-2 rounded-md bg-white/60 p-2">
              {CodeIcon && <CodeIcon className="mt-0.5 size-4 text-amber-600 shrink-0" />}
              <div>
                {codeConfig && <p className="text-xs font-semibold text-amber-800">{codeConfig.label}</p>}
                {actionHint && <p className="text-xs text-muted-foreground">{actionHint}</p>}
              </div>
            </div>
          )}

          {/* Evidence details */}
          {result.evidence && Object.keys(result.evidence).length > 0 && (
            <EvidenceViewer evidence={result.evidence} />
          )}
        </div>
      )}

      {/* Failure reason (non-handler) */}
      {!result && item.failureReason && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 size-4 text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">Failed</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.failureReason}</p>
            </div>
          </div>
        </div>
      )}

      {/* Completion notes */}
      {item.completionNotes && item.taskStatus === "COMPLETED" && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3">
          <p className="text-xs text-green-800">{item.completionNotes}</p>
        </div>
      )}

      {/* Waiver info */}
      {item.waiverReason && (item.taskStatus === "WAIVED" || item.waiverStatus === "pending_approval") && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-800">
            Waiver {item.waiverStatus === "pending_approval" ? "Pending Approval" : "Granted"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Reason: {item.waiverReason}</p>
          {item.waivedBy && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              By: {item.waivedBy} {item.waivedAt && <> at <DateCell date={item.waivedAt} /></>}
            </p>
          )}
        </div>
      )}

      {/* Assignment + SLA */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        {item.assignedRole && (
          <span>Role: <strong>{item.assignedRole}</strong></span>
        )}
        {item.assignedUserId && (
          <span>Assigned: <strong>{item.assignedUserId}</strong></span>
        )}
        {item.task.slaHours && (
          <span>SLA: {item.task.slaHours}h</span>
        )}
        {item.dueAt && (
          <span>Due: <DateCell date={item.dueAt} /></span>
        )}
        {item.handlerRunCount > 0 && (
          <span>Handler runs: {item.handlerRunCount}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence viewer (collapsible key-value display)
// ---------------------------------------------------------------------------

function formatEvidenceValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    // For arrays of primitives, join; for objects, compact JSON
    if (value.every((v) => typeof v !== "object" || v === null)) {
      return value.join(", ");
    }
    const json = JSON.stringify(value, null, 2);
    return json.length > 500 ? json.slice(0, 500) + "…" : json;
  }
  if (typeof value === "object") {
    const json = JSON.stringify(value, null, 2);
    return json.length > 500 ? json.slice(0, 500) + "…" : json;
  }
  return String(value);
}

function EvidenceViewer({ evidence }: { evidence: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const displayEntries = Object.entries(evidence);

  if (displayEntries.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Evidence ({displayEntries.length} fields)
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-0.5 rounded bg-white/80 p-2 font-mono text-[11px] max-h-64 overflow-y-auto">
          {displayEntries.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">{key}:</span>
              <span className="min-w-0 break-all whitespace-pre-wrap">
                {formatEvidenceValue(value)}
              </span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Completion mode badge
// ---------------------------------------------------------------------------

function CompletionModeBadge({ mode }: { mode: CloseTaskCompletionMode }) {
  const config: Record<CloseTaskCompletionMode, { bg: string; text: string }> = {
    SYSTEM: { bg: "bg-purple-100", text: "text-purple-700" },
    HYBRID: { bg: "bg-indigo-100", text: "text-indigo-700" },
    MANUAL: { bg: "bg-gray-100", text: "text-gray-600" },
  };
  const c = config[mode];
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${c.bg} ${c.text}`}>
      {COMPLETION_MODE_LABELS[mode]}
    </span>
  );
}
