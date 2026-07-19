"use client";

import {
  CloseCycleWorkbench,
  CrossBookPostingMonitor,
  FinanceReadinessWorkbench,
  OpeningBalanceWorkbench,
  type FinanceScope,
} from "@athyper/finance-workbench";

type Mode = "opening" | "readiness" | "monthly" | "annual" | "cross-book";

export function FinanceGovernanceRouteView({
  mode,
  scope,
  runId,
  phaseCode,
}: {
  mode: Mode;
  scope: FinanceScope;
  runId?: string;
  phaseCode?: string;
}) {
  if (mode === "opening") return <OpeningBalanceWorkbench scope={scope} runId={runId} phaseCode={phaseCode} />;
  if (mode === "readiness") return <FinanceReadinessWorkbench scope={scope} runId={runId} phaseCode={phaseCode} />;
  if (mode === "cross-book") return <CrossBookPostingMonitor scope={scope} />;
  return (
    <CloseCycleWorkbench
      scope={scope}
      runId={runId}
      phaseCode={phaseCode}
      cycleTypeCode={mode === "annual" ? "YEAR_END_CLOSE" : "MONTHLY_CLOSE"}
      title={mode === "annual" ? "Annual Close Workbench" : "Monthly Close Workbench"}
      description={`${scope.scopeId} · FY${scope.fiscalYear}${mode === "monthly" && scope.period != null ? ` · period ${scope.period}` : ""}`}
    />
  );
}
