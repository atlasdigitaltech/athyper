"use client";

/**
 * FinancialReportsWorkbench - /finance/reports
 *
 * Report compositor. Routes ?report= to the appropriate view.
 * Reports with status="placeholder" render a coming-soon tile.
 */

import { useState, type ComponentType } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, Download, FileBarChart2, MoreHorizontal } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@athyper/platform-ui/primitives";
import {
  REPORT_CODES,
  REPORT_REGISTRY,
  type ReportCode,
} from "../lib/reportRegistry";
import { type FinanceScope } from "../lib/scope";
import { FinanceContextBar } from "../components/FinanceContextBar";
import { ReportChooserSuffix } from "../components/ReportScaffold";
import { RecordLinkContextMenu } from "../components/RecordLinkContextMenu";
import { ApAgingView } from "./ApAgingView";
import { ArAgingView } from "./ArAgingView";
import { BalanceSheetView } from "./BalanceSheetView";
import { CashFlowView } from "./CashFlowView";
import { ProfitLossView } from "./ProfitLossView";
import { TrialBalanceView, type TrialBalanceViewMode } from "./TrialBalanceView";

const REPORT_VIEWS: Partial<Record<ReportCode, ComponentType<{ scope: FinanceScope }>>> = {
  "profit-loss":   ProfitLossView,
  "balance-sheet": BalanceSheetView,
  "trial-balance": TrialBalanceView,
  "cash-flow":     CashFlowView,
  "ap-aging":      ApAgingView,
  "ar-aging":      ArAgingView,
};

type ExportFormat = "csv" | "xlsx" | "pdf";

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
        <Badge variant="outline" className="mt-2 text-xs">Coming soon</Badge>
      </div>
    </div>
  );
}

export interface FinancialReportsWorkbenchProps {
  scope:  FinanceScope;
  report: ReportCode;
}

interface FinancialReportsSwitcherProps {
  report: ReportCode;
  onReportChange: (code: ReportCode) => void;
  onBack: () => void;
}

function FinancialReportsSwitcher({ report, onReportChange, onBack }: FinancialReportsSwitcherProps) {
  return (
    <DropdownMenu>
      <div className="inline-flex h-8 shrink-0 items-center overflow-hidden rounded-md border border-border bg-foreground text-sm font-medium text-background">
        <button
          type="button"
          className="flex h-full w-9 items-center justify-center border-r border-background/20 bg-inherit text-inherit transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-background"
          aria-label="Back to Finance"
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-full items-center gap-1.5 bg-inherit px-3 text-inherit transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-background"
            aria-label="Switch financial report"
          >
            <span className="leading-none">FINANCIAL REPORTS</span>
            <ReportChooserSuffix />
          </button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent align="start" className="min-w-[240px]">
        {REPORT_CODES.map((code) => {
          const meta = REPORT_REGISTRY[code];
          return (
            <DropdownMenuItem
              key={code}
              onSelect={() => onReportChange(code)}
              className={cn(
                "flex items-center justify-between gap-3",
                code === report && "font-medium",
              )}
            >
              <span>{meta.label}</span>
              {code === report && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FinancialReportsWorkbench({ scope, report }: FinancialReportsWorkbenchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [trialBalanceViewMode, setTrialBalanceViewMode] = useState<TrialBalanceViewMode>("summary");

  const meta = REPORT_REGISTRY[report];
  const View = REPORT_VIEWS[report];
  const isLive = meta.status === "live" && !!View;
  const isTrialBalance = report === "trial-balance";
  const isProfitLoss = report === "profit-loss";
  const isBalanceSheet = report === "balance-sheet";
  const isCashFlow = report === "cash-flow";
  const isGridReport = meta.displayType === "grid";
  const isGraphCapableReport = isProfitLoss || isBalanceSheet || isCashFlow;
  const moveReportingControlsToBody = isProfitLoss || isBalanceSheet || isCashFlow;
  const hideTopHeaderGrouping = isGridReport || moveReportingControlsToBody;
  const hideTopHeaderCompare = !meta.supportsCompare || moveReportingControlsToBody;
  const displayGraph = isGraphCapableReport && searchParams.get("displayGraph") === "true";
  const exportFormats = isLive ? meta.supportsExport : [];

  function setReport(code: ReportCode) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("report", code);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function handleExport(format: ExportFormat) {
    const res = await fetch("/api/finance/reports/export", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportCode: report, scope, format }),
    });
    if (!res.ok) return;

    const { downloadUrl } = await res.json() as { downloadUrl: string };
    window.open(downloadUrl, "_blank");
  }

  function setStatementGraph(enabled: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (enabled) params.set("displayGraph", "true");
    else params.delete("displayGraph");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-y-auto sm:gap-3 sm:overflow-hidden">
      <section className="shrink-0 overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-1.5 text-sm text-muted-foreground sm:px-3">
          <FinancialReportsSwitcher
            report={report}
            onReportChange={setReport}
            onBack={() => router.push("/finance")}
          />
          <span className="hidden text-border/80 sm:inline">|</span>
          <span className="order-1 shrink-0 sm:order-none">
            {meta.label}
          </span>
          <span className="hidden text-border/80 sm:inline">/</span>
          <FinanceContextBar
            variant="inline"
            className="order-3 w-full gap-x-2 sm:order-none sm:min-w-0 sm:flex-1"
            hideGrouping={hideTopHeaderGrouping}
            hideCompare={hideTopHeaderCompare}
          />
          <div className="order-2 ml-auto flex shrink-0 items-center gap-2 sm:order-none">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  title="More actions"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[170px]">
                {exportFormats.length > 0 ? (
                  exportFormats.map((format) => (
                    <DropdownMenuItem
                      key={format}
                      onSelect={() => void handleExport(format)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export {format.toUpperCase()}
                    </DropdownMenuItem>
                  ))
                ) : !isGraphCapableReport ? (
                  <DropdownMenuItem disabled>No actions</DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-none flex-col overflow-visible rounded-lg border bg-card shadow-sm sm:flex-1 sm:overflow-hidden">
        <div className="min-h-0 px-2 pb-3 pt-0 sm:flex-1 sm:overflow-auto sm:px-4 sm:pb-4">
          {isLive ? (
            isTrialBalance ? (
              <TrialBalanceView
                scope={scope}
                viewMode={trialBalanceViewMode}
                onViewModeChange={setTrialBalanceViewMode}
                showReportHeader
              />
            ) : isProfitLoss ? (
              <ProfitLossView
                scope={scope}
                showGraph={displayGraph}
                onShowGraphChange={setStatementGraph}
                moveReportingControlsToHeader
              />
            ) : isBalanceSheet ? (
              <BalanceSheetView
                scope={scope}
                showGraph={displayGraph}
                onShowGraphChange={setStatementGraph}
                moveReportingControlsToHeader
              />
            ) : isCashFlow ? (
              <CashFlowView
                scope={scope}
                showGraph={displayGraph}
                onShowGraphChange={setStatementGraph}
                moveReportingControlsToHeader
              />
            ) : report === "ap-aging" ? (
              <ApAgingView
                scope={scope}
                showReportHeader
              />
            ) : report === "ar-aging" ? (
              <ArAgingView
                scope={scope}
                showReportHeader
              />
            ) : (
              <View scope={scope} />
            )
          ) : (
            <ReportPlaceholderTile code={report} />
          )}
        </div>
      </section>

      <RecordLinkContextMenu />
    </div>
  );
}
