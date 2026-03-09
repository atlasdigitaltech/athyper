"use client";

// components/finance/admin/RiskSignalInbox.tsx
//
// Phase 6.3b — Risk Signal Inbox
// Operator-facing inbox for risk signals with filters, severity badges,
// actions (acknowledge, resolve, suppress), and escalation indicators.

import { useState, useCallback } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpCircle,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Zap,
} from "lucide-react";

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
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import {
  useRiskSignals,
  useRiskSummary,
  useRiskSignalActions,
  type RiskSignalParams,
} from "@/lib/finance/use-risk-signals";

import type {
  CloseRiskSignalDTO,
  CloseTaskSeverity,
  RiskSignalState,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Severity rendering
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG: Record<
  CloseTaskSeverity,
  { label: string; variant: "destructive" | "default" | "secondary" | "outline"; icon: typeof AlertCircle }
> = {
  critical: { label: "Critical", variant: "destructive", icon: AlertCircle },
  high: { label: "High", variant: "default", icon: AlertTriangle },
  medium: { label: "Medium", variant: "secondary", icon: Info },
  low: { label: "Low", variant: "outline", icon: Info },
};

const STATE_CONFIG: Record<
  RiskSignalState,
  { label: string; color: string }
> = {
  fired: { label: "Fired", color: "text-red-600" },
  acknowledged: { label: "Acknowledged", color: "text-amber-600" },
  resolved: { label: "Resolved", color: "text-green-600" },
  suppressed: { label: "Suppressed", color: "text-gray-500" },
};

function SeverityBadge({ severity }: { severity: CloseTaskSeverity }) {
  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function StateBadge({ state }: { state: RiskSignalState }) {
  const config = STATE_CONFIG[state];
  return (
    <span className={`text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

function EscalationIndicator({ level }: { level: number }) {
  if (level === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="destructive" className="gap-1 text-[10px]">
          <ArrowUpCircle className="h-3 w-3" />
          L{level}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Escalation level {level}</TooltipContent>
    </Tooltip>
  );
}

function formatAge(hours: number | null): string {
  if (hours === null) return "-";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

type SeverityFilter = CloseTaskSeverity | "all";
type ViewFilter = "active" | "all";

// ---------------------------------------------------------------------------
// Summary Cards
// ---------------------------------------------------------------------------

function SummaryCards({
  params,
}: {
  params: RiskSignalParams;
}) {
  const { summary, loading } = useRiskSummary(params);

  if (loading || !summary) return null;

  const cards = [
    { label: "Active", value: summary.activeCount, icon: ShieldAlert, color: "text-red-600" },
    { label: "Critical", value: summary.criticalCount, icon: AlertCircle, color: "text-red-700" },
    { label: "High", value: summary.highCount, icon: AlertTriangle, color: "text-orange-600" },
    { label: "Unacknowledged", value: summary.unacknowledgedCount, icon: Clock, color: "text-amber-600" },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{c.label}</span>
            <c.icon className={`h-4 w-4 ${c.color}`} />
          </div>
          <p className={`text-2xl font-bold ${c.value > 0 ? c.color : ""}`}>
            {c.value}
          </p>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resolve Dialog
// ---------------------------------------------------------------------------

function ResolveDialog({
  open,
  onClose,
  onResolve,
  acting,
  signal,
}: {
  open: boolean;
  onClose: () => void;
  onResolve: (notes: string) => void;
  acting: boolean;
  signal: CloseRiskSignalDTO | null;
}) {
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve Risk Signal</DialogTitle>
          <DialogDescription>
            {signal?.title ?? "Unknown signal"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium">Resolution Notes</label>
          <Textarea
            placeholder="Describe how the risk was resolved..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={acting}>
            Cancel
          </Button>
          <Button
            onClick={() => onResolve(notes)}
            disabled={!notes.trim() || acting}
          >
            {acting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export interface RiskSignalInboxProps {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

export function RiskSignalInbox({
  entityCode,
  fiscalYear,
  periodNumber,
}: RiskSignalInboxProps) {
  const params: RiskSignalParams = { entityCode, fiscalYear, periodNumber };

  const [viewFilter, setViewFilter] = useState<ViewFilter>("active");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [resolveTarget, setResolveTarget] = useState<CloseRiskSignalDTO | null>(null);

  const { signals, loading, error, refresh } = useRiskSignals(params, viewFilter);

  const refreshAll = useCallback(() => {
    refresh();
  }, [refresh]);

  const { acknowledge, resolve, suppress, evaluate, acting, actionError } =
    useRiskSignalActions(params, refreshAll);

  // Filter signals by severity
  const filteredSignals = signals?.filter(
    (s) => severityFilter === "all" || s.severity === severityFilter,
  ) ?? [];

  const handleResolve = useCallback(
    async (notes: string) => {
      if (!resolveTarget) return;
      try {
        await resolve(resolveTarget.id, notes);
        setResolveTarget(null);
      } catch {
        // error is set in actionError
      }
    },
    [resolveTarget, resolve],
  );

  const handleEvaluate = useCallback(async () => {
    try {
      await evaluate("SOFT_CLOSE");
    } catch {
      // error is set in actionError
    }
  }, [evaluate]);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Summary */}
        <SummaryCards params={params} />

        {/* Main inbox card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5" />
                  Risk Signals
                </CardTitle>
                <CardDescription>
                  {entityCode} — FY{fiscalYear} P{periodNumber}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEvaluate}
                  disabled={acting}
                >
                  {acting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Zap className="h-4 w-4 mr-1" />
                  )}
                  Evaluate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshAll}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex gap-1">
                {(["active", "all"] as const).map((v) => (
                  <Button
                    key={v}
                    variant={viewFilter === v ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewFilter(v)}
                    className="text-xs h-7"
                  >
                    {v === "active" ? "Active" : "All"}
                  </Button>
                ))}
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex gap-1">
                {(["all", "critical", "high", "medium", "low"] as const).map((s) => (
                  <Button
                    key={s}
                    variant={severityFilter === s ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setSeverityFilter(s)}
                    className="text-xs h-7"
                  >
                    {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="text-sm text-destructive mb-3">{error}</div>
            )}
            {actionError && (
              <div className="text-sm text-destructive mb-3">{actionError}</div>
            )}

            {loading && !signals ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading signals...
              </div>
            ) : filteredSignals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mb-2 text-green-500" />
                <p className="text-sm">
                  {viewFilter === "active"
                    ? "No active risk signals"
                    : "No risk signals found"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Severity</TableHead>
                    <TableHead>Signal</TableHead>
                    <TableHead className="w-[100px]">State</TableHead>
                    <TableHead className="w-[60px]">Age</TableHead>
                    <TableHead className="w-[80px]">Escalation</TableHead>
                    <TableHead className="w-[180px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSignals.map((signal) => (
                    <SignalRow
                      key={signal.id}
                      signal={signal}
                      onAcknowledge={() => acknowledge(signal.id).catch(() => {})}
                      onResolve={() => setResolveTarget(signal)}
                      onSuppress={() => suppress(signal.id).catch(() => {})}
                      acting={acting}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Resolve dialog */}
        <ResolveDialog
          open={resolveTarget !== null}
          onClose={() => setResolveTarget(null)}
          onResolve={handleResolve}
          acting={acting}
          signal={resolveTarget}
        />
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Signal Row
// ---------------------------------------------------------------------------

function SignalRow({
  signal,
  onAcknowledge,
  onResolve,
  onSuppress,
  acting,
}: {
  signal: CloseRiskSignalDTO;
  onAcknowledge: () => void;
  onResolve: () => void;
  onSuppress: () => void;
  acting: boolean;
}) {
  const canAcknowledge = signal.signalState === "fired";
  const canResolve = signal.signalState === "fired" || signal.signalState === "acknowledged";
  const canSuppress = signal.signalState === "fired" || signal.signalState === "acknowledged";

  return (
    <TableRow>
      <TableCell>
        <SeverityBadge severity={signal.severity} />
      </TableCell>
      <TableCell>
        <div>
          <p className="text-sm font-medium">{signal.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {signal.message}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {signal.ruleCode} — {signal.ruleType}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <StateBadge state={signal.signalState} />
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">
          {formatAge(signal.ageHours)}
        </span>
      </TableCell>
      <TableCell>
        <EscalationIndicator level={signal.escalationLevel} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {canAcknowledge && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAcknowledge}
                  disabled={acting}
                  className="h-7 px-2"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Acknowledge</TooltipContent>
            </Tooltip>
          )}
          {canResolve && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onResolve}
                  disabled={acting}
                  className="h-7 px-2"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Resolve</TooltipContent>
            </Tooltip>
          )}
          {canSuppress && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSuppress}
                  disabled={acting}
                  className="h-7 px-2"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Suppress</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
