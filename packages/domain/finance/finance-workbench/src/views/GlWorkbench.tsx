"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import type { FinanceScope } from "../lib/scope";
import { ScopeSelector } from "../components/ScopeSelector";
import { PeriodSelector } from "../components/PeriodSelector";
import { useScopeOptions } from "../hooks/useScopeOptions";
import { TrialBalanceView } from "./TrialBalanceView";
import { BalanceSheetView } from "./BalanceSheetView";
import { ProfitLossView } from "./ProfitLossView";
import { GlDetailView } from "./GlDetailView";
import { ApWorkbenchView } from "./ApWorkbenchView";
import { BankReconciliationView } from "./BankReconciliationView";
import { PeriodCloseDashboardView } from "./PeriodCloseDashboardView";

type WorkbenchTab = "trial-balance" | "balance-sheet" | "profit-loss" | "gl-detail" | "ap-ar" | "bank-recon" | "period-close";

const TABS: Array<{ id: WorkbenchTab; label: string }> = [
  { id: "trial-balance",  label: "Trial Balance" },
  { id: "balance-sheet",  label: "Balance Sheet" },
  { id: "profit-loss",    label: "P&L" },
  { id: "gl-detail",      label: "GL Detail" },
  { id: "ap-ar",          label: "AP / AR" },
  { id: "bank-recon",     label: "Bank Recon" },
  { id: "period-close",   label: "Period Close" },
];

interface GlWorkbenchProps {
  /** Initial scope to render. Defaults to first available company. */
  defaultScope?: Partial<FinanceScope>;
  /** Initial tab to activate. Defaults to "trial-balance". */
  defaultTab?: WorkbenchTab;
  /** When true, shows the comparative (prior year) toggle */
  allowComparative?: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();

const DEFAULT_SCOPE: FinanceScope = {
  scopeType: "company",
  scopeId: "",
  fiscalYear: CURRENT_YEAR,
  period: null,
  comparative: false,
};

export function GlWorkbench({ defaultScope, defaultTab = "trial-balance", allowComparative = true }: GlWorkbenchProps) {
  const [tab, setTab] = useState<WorkbenchTab>(defaultTab);
  const [scope, setScope] = useState<FinanceScope>({ ...DEFAULT_SCOPE, ...defaultScope });
  const [glAccountCode, setGlAccountCode] = useState<string>("");

  const { data: scopeOptions, isLoading: scopeLoading } = useScopeOptions();

  function handleScopeChange(next: FinanceScope) {
    setScope(next);
  }

  function handlePeriodChange(fiscalYear: number, period: number | null) {
    setScope((prev) => ({ ...prev, fiscalYear, period }));
  }

  function handleDrillDown(accountCode: string) {
    setGlAccountCode(accountCode);
    setTab("gl-detail");
  }

  return (
    <div className="flex flex-col gap-3 h-full min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-xl border flex-wrap">
        {/* Scope selector */}
        <div>
          <div className="text-[9px] text-muted-foreground uppercase mb-0.5">Scope</div>
          <ScopeSelector
            value={scope}
            onChange={handleScopeChange}
            companies={scopeOptions?.companies ?? []}
            entities={scopeOptions?.entities ?? []}
            allowGroup
            size="sm"
          />
        </div>

        {/* Period selector */}
        <div>
          <div className="text-[9px] text-muted-foreground uppercase mb-0.5">Period</div>
          <PeriodSelector
            fiscalYear={scope.fiscalYear}
            period={scope.period}
            onChange={handlePeriodChange}
            showFullYear
            size="sm"
          />
        </div>

        {/* Comparative toggle */}
        {allowComparative && (
          <div>
            <div className="text-[9px] text-muted-foreground uppercase mb-0.5">Compare</div>
            <Button
              variant={scope.comparative ? "default" : "outline"}
              size="sm"
              className="h-7 text-[10px] px-2.5"
              onClick={() => setScope((prev) => ({ ...prev, comparative: !prev.comparative }))}
            >
              vs. prior year
            </Button>
          </div>
        )}

        <div className="flex-1" />

        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
          <Download size={12} />
          Export
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-1.5 text-xs border-b-2 transition-colors",
              tab === t.id
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-auto px-0.5">
        {scopeLoading ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground animate-pulse">
            Loading…
          </div>
        ) : (
          <>
            {tab === "trial-balance" && (
              <TrialBalanceView scope={scope} />
            )}
            {tab === "balance-sheet" && (
              <BalanceSheetView scope={scope} onDrillDown={handleDrillDown} />
            )}
            {tab === "profit-loss" && (
              <ProfitLossView scope={scope} onDrillDown={handleDrillDown} />
            )}
            {tab === "gl-detail" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-[10px] text-muted-foreground">Account:</div>
                  <input
                    type="text"
                    value={glAccountCode}
                    onChange={(e) => setGlAccountCode(e.target.value)}
                    placeholder="e.g. 1000"
                    className="h-7 w-36 rounded-md border px-2 text-xs font-mono bg-background"
                  />
                </div>
                <GlDetailView scope={scope} accountCode={glAccountCode} />
              </div>
            )}
            {tab === "ap-ar"        && <ApWorkbenchView          scope={scope} />}
            {tab === "bank-recon"   && <BankReconciliationView   scope={scope} />}
            {tab === "period-close" && <PeriodCloseDashboardView scope={scope} />}
          </>
        )}
      </div>
    </div>
  );
}
