"use client";

// components/finance/admin/MaterialChangesPanel.tsx
//
// Materiality-aware delta analysis panel for CFO workspace.
// Shows which GL changes are material, which overrides matter most,
// and provides account-type-classified change insights.

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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

import type { PackDeltaDTO, MaterialityInsightDTO } from "@/lib/finance/use-pack-readiness";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MaterialChangesPanelProps {
  delta: PackDeltaDTO | null;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Risk level styling
// ---------------------------------------------------------------------------

const RISK_STYLES: Record<string, { badge: "destructive" | "default" | "secondary" | "outline"; icon: typeof AlertTriangle; color: string }> = {
  high: { badge: "destructive", icon: ShieldAlert, color: "text-red-600" },
  medium: { badge: "default", icon: AlertTriangle, color: "text-amber-600" },
  low: { badge: "secondary", icon: TrendingUp, color: "text-blue-600" },
  none: { badge: "outline", icon: CheckCircle2, color: "text-emerald-600" },
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  REVENUE: "Revenue",
  EXPENSE: "Expense",
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MaterialChangesPanel({ delta, loading }: MaterialChangesPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Material Changes
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Analyzing changes...</span>
        </CardContent>
      </Card>
    );
  }

  if (!delta || !delta.hasPriorPack) return null;

  const materiality = delta.materiality;
  if (!materiality) return null;

  const riskConfig = RISK_STYLES[materiality.riskLevel] ?? RISK_STYLES.none;
  const RiskIcon = riskConfig.icon;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <RiskIcon className={`h-4 w-4 ${riskConfig.color}`} />
              Material Changes Since Last Pack
            </CardTitle>
            <CardDescription className="text-xs">
              {delta.packGeneratedAt
                ? `Since ${new Date(delta.packGeneratedAt).toLocaleString()}`
                : "Change analysis"}
            </CardDescription>
          </div>
          <Badge variant={riskConfig.badge} className="text-[10px]">
            {materiality.riskLevel === "none" ? "No Changes" : `${materiality.riskLevel} risk`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Materiality insights */}
        {materiality.insights.length > 0 && (
          <div className="space-y-1">
            {materiality.insights.map((insight, i) => (
              <p key={i} className="text-xs text-foreground/80">
                • {insight}
              </p>
            ))}
          </div>
        )}

        {/* Change classification summary */}
        <div className="grid grid-cols-3 gap-2">
          <ChangeBox
            label="P&L Changes"
            value={materiality.materialPnLChanges}
            highlight={materiality.materialPnLChanges > 0}
          />
          <ChangeBox
            label="B/S Changes"
            value={materiality.materialBSChanges}
            highlight={false}
          />
          <ChangeBox
            label="New Overrides"
            value={Number(delta.overrideChanges?.new_overrides ?? 0)}
            highlight={Number(delta.overrideChanges?.new_overrides ?? 0) > 0}
          />
        </div>

        {/* Top changes table */}
        {delta.glChanges?.topChanges && delta.glChanges.topChanges.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-1.5">
              Largest GL Changes
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] py-1">Account</TableHead>
                  <TableHead className="text-[10px] py-1">Type</TableHead>
                  <TableHead className="text-[10px] py-1 text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {delta.glChanges.topChanges.slice(0, 5).map((change, i) => {
                  const balance = Number(change.balance);
                  return (
                    <TableRow key={i}>
                      <TableCell className="py-1">
                        <div className="text-xs font-medium">{change.account_code}</div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                          {change.account_name}
                        </div>
                      </TableCell>
                      <TableCell className="py-1">
                        <Badge variant="outline" className="text-[9px]">
                          {ACCOUNT_TYPE_LABELS[change.account_type] ?? change.account_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {balance > 0 ? (
                            <ArrowUp className="h-3 w-3 text-emerald-500" />
                          ) : balance < 0 ? (
                            <ArrowDown className="h-3 w-3 text-red-500" />
                          ) : null}
                          <span className={`text-xs font-mono ${
                            change.account_type === "REVENUE" || change.account_type === "EXPENSE"
                              ? "font-semibold"
                              : ""
                          }`}>
                            {Math.abs(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Task changes */}
        {delta.taskChanges && Number(delta.taskChanges.tasks_completed_since) > 0 && (
          <div className="pt-2 border-t text-xs text-muted-foreground">
            Close task changes: {delta.taskChanges.newly_completed} completed
            {Number(delta.taskChanges.newly_waived) > 0 && `, ${delta.taskChanges.newly_waived} waived`}
            {Number(delta.taskChanges.newly_failed) > 0 && (
              <span className="text-red-600">, {delta.taskChanges.newly_failed} failed</span>
            )}
          </div>
        )}

        {/* No changes state */}
        {!delta.hasChanges && (
          <div className="flex items-center gap-2 py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-emerald-700">{delta.summary}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Change Box
// ---------------------------------------------------------------------------

function ChangeBox({ label, value, highlight }: { label: string; value: number; highlight: boolean }) {
  return (
    <div className={`text-center p-2 rounded ${highlight ? "bg-amber-50 border border-amber-200" : "bg-gray-50"}`}>
      <div className={`text-sm font-semibold ${highlight ? "text-amber-700" : ""}`}>{value}</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}
