import { FinancialReportsWorkbench } from "@athyper/finance-workbench/views";
import { parseFinanceScope } from "@athyper/finance-workbench/lib/scope";
import { parseReportCode } from "@athyper/finance-workbench/lib/reportRegistry";

/**
 * Financial Reports Workbench — /finance/reports
 *
 * URL state:
 *   report      — active report (profit-loss | balance-sheet | trial-balance | …)
 *   scopeType, scopeId, fiscalYear, period, comparative — scope from FinanceContextBar
 */
export default async function FinanceReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw    = await searchParams;
  const scope  = parseFinanceScope(raw);
  const report = parseReportCode(raw["report"]);

  return <FinancialReportsWorkbench scope={scope} report={report} />;
}
