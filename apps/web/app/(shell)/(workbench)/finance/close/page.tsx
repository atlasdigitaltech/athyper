import { CloseCycleWorkbench } from "@athyper/finance-workbench/views";
import { parseFinanceScope } from "@athyper/finance-workbench/lib/scope";
import { PageFrame } from "@athyper/ui/layout";

/**
 * Period Close Workbench — /finance/close
 *
 * URL state (all optional — FinanceContextBar provides scope defaults):
 *   scopeType, scopeId, fiscalYear, period  — scope
 *   runId                                   — specific close run (deep-link safe)
 *   phaseCode                               — active phase tab within the run
 */
export default async function PeriodClosePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw       = await searchParams;
  const scope     = parseFinanceScope(raw);
  const runId     = Array.isArray(raw["runId"])     ? raw["runId"][0]     : raw["runId"];
  const phaseCode = Array.isArray(raw["phaseCode"]) ? raw["phaseCode"][0] : raw["phaseCode"];

  return (
    <PageFrame width="full">
      <CloseCycleWorkbench scope={scope} runId={runId} phaseCode={phaseCode} />
    </PageFrame>
  );
}
