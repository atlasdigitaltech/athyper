"use client";

/**
 * FinancialReportsWorkbench — /finance/reports
 *
 * Report compositor. Routes ?report= to the appropriate view.
 * Reports with status="placeholder" render a coming-soon tile — no build gate.
 *
 * URL state: ?report=profit-loss&scopeType=company&scopeId=ADT-001
 *            &fiscalYear=2026&period=3&comparative=true
 *
 * Adding a new report:
 *   1. Set status="live" in REPORT_REGISTRY (reportRegistry.ts)
 *   2. Add the view component to REPORT_VIEWS below
 *   Placeholders auto-upgrade to live — no other changes needed.
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Download, FileBarChart2 } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Button, Badge } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import {
  REPORT_REGISTRY,
  REPORT_CODES,
  parseReportCode,
  type ReportCode,
} from "../lib/reportRegistry";
import { scopeToParams } from "../lib/scope";
import type { FinanceScope } from "../lib/scope";
import { BalanceSheetView } from "./BalanceSheetView";
import { ProfitLossView } from "./ProfitLossView";
import { TrialBalanceView } from "./TrialBalanceView";
import { CashFlowView } from "./CashFlowView";
import { ApAgingView } from "./ApAgingView";
import { ArAgingView } from "./ArAgingView";

// ── Report → View map ─────────────────────────────────────────────────────────
// Add entries here as new views are built. REPORT_REGISTRY.status="placeholder"
// acts as the gate — views listed here are only rendered when status="live".

const REPORT_VIEWS: Partial<Record<ReportCode, React.ComponentType<{ scope: FinanceScope }>>> = {
  "profit-loss":   ProfitLossView,
  "balance-sheet": BalanceSheetView,
  "trial-balance": TrialBalanceView,
  "cash-flow":     CashFlowView,
  "ap-aging":      ApAgingView,
  "ar-aging":      ArAgingView,
};

// ── Period label ──────────────────────────────────────────────────────────────

const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function periodLabel(scope: FinanceScope, mode: "for-period" | "as-of"): string {
  const month = scope.period != null && scope.period >= 1 && scope.period <= 12
    ? MONTH_NAMES[scope.period]
    : null;

  if (mode === "as-of") {
    return month
      ? `As at ${month} ${scope.fiscalYear}`
      : `As at FY${scope.fiscalYear}`;
  }
  return month
    ? `For ${month} ${scope.fiscalYear}`
    : `FY${scope.fiscalYear}`;
}

// ── Placeholder tile ──────────────────────────────────────────────────────────

function ReportPlaceholderTile({ code }: { code: ReportCode }) {
  const meta = REPORT_REGISTRY[code];
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <FileBarChart2 className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{meta.label}</p>
        <p className="text-xs text-muted-foreground">{meta.description}</p>
        <Badge variant="outline" className="mt-2 text-[10px]">Coming soon</Badge>
      </div>
    </div>
  );
}

// ── Export button ─────────────────────────────────────────────────────────────

function ExportButton({ scope, report }: { scope: FinanceScope; report: ReportCode }) {
  const meta = REPORT_REGISTRY[report];
  if (meta.supportsExport.length === 0) return null;

  async function handleExport(format: "csv" | "xlsx" | "pdf") {
    const res = await fetch("/api/finance/reports/export", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportCode: report, scope, format }),
    });
    if (!res.ok) return;
    const { downloadUrl } = await res.json() as { downloadUrl: string };
    window.open(downloadUrl, "_blank");
  }

  if (meta.supportsExport.length === 1) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => void handleExport(meta.supportsExport[0]!)}
      >
        <Download className="h-3.5 w-3.5" />
        Export {meta.supportsExport[0]!.toUpperCase()}
      </Button>
    );
  }

  return (
    <div className="relative group">
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
        <Download className="h-3.5 w-3.5" />
        Export
      </Button>
      <div className="absolute right-0 top-full z-10 mt-1 hidden min-w-[100px] rounded-lg border bg-popover p-1 shadow-md group-hover:block">
        {meta.supportsExport.map((fmt) => (
          <button
            key={fmt}
            onClick={() => void handleExport(fmt)}
            className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-muted"
          >
            {fmt.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface FinancialReportsWorkbenchProps {
  scope:  FinanceScope;
  report: ReportCode;
}

// ── Main component ────────────────────────────────────────────────────────────

export function FinancialReportsWorkbench({ scope, report }: FinancialReportsWorkbenchProps) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  const meta = REPORT_REGISTRY[report];
  const View = REPORT_VIEWS[report];
  const isLive = meta.status === "live" && !!View;

  function setReport(code: ReportCode) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("report", code);
    router.replace(`${pathname}?${p.toString()}`);
  }

  function toggleCompare() {
    const p = new URLSearchParams(searchParams.toString());
    if (scope.comparative) p.delete("comparative");
    else p.set("comparative", "true");
    router.replace(`${pathname}?${p.toString()}`);
  }

  return (
    <PageFrame
      title="Financial Reports"
      description={scope.scopeId ? `${scope.scopeId} · ${periodLabel(scope, meta.periodMode)}` : "Select a scope from the context bar"}
      actions={
        <div className="flex items-center gap-2">
          {isLive && meta.supportsCompare && (
            <Button
              variant={scope.comparative ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={toggleCompare}
            >
              Compare prior year
            </Button>
          )}
          {isLive && <ExportButton scope={scope} report={report} />}
        </div>
      }
    >
      <div className="flex gap-0 h-[calc(100vh-14rem)] min-h-0">

        {/* ── Left: Report catalog ──────────────────────────────────────── */}
        <div className="w-52 shrink-0 border-r pr-3 space-y-0.5 overflow-auto">
          {REPORT_CODES.map((code) => {
            const m        = REPORT_REGISTRY[code];
            const isActive = code === report;
            return (
              <button
                key={code}
                onClick={() => setReport(code)}
                className={cn(
                  "w-full text-left rounded-lg px-3 py-2.5 transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <div className="text-xs font-medium">{m.label}</div>
                {m.status === "placeholder" && (
                  <div className="text-[10px] text-muted-foreground/60">Coming soon</div>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Right: Active report ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-auto pl-4">
          {isLive ? (
            <View scope={scope} />
          ) : (
            <ReportPlaceholderTile code={report} />
          )}
        </div>

      </div>
    </PageFrame>
  );
}
