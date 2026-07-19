"use client";

import { CloseCycleWorkbench } from "./CloseCycleWorkbench";
import type { FinanceScope } from "../lib/scope";

export interface FinanceReadinessWorkbenchProps {
  scope: FinanceScope;
  runId?: string;
  phaseCode?: string;
}

export function FinanceReadinessWorkbench({ scope, runId, phaseCode }: FinanceReadinessWorkbenchProps) {
  return (
    <CloseCycleWorkbench
      scope={scope}
      runId={runId}
      phaseCode={phaseCode}
      cycleTypeCode="FIN_SETUP_READINESS"
      runData={{ readiness_scope: "company", evaluated_period: scope.period }}
      title="Finance Setup Readiness"
      description={`${scope.scopeId} · system-evaluated controls and FINANCE_POSTING_READY certification`}
    />
  );
}
