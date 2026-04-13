"use client";

/**
 * Chart of Accounts — /finance/coa
 *
 * Bespoke workbench surface. No [id] child routes.
 * All focus state via query params (chart, account, segment).
 *
 * Navigation:
 *   /finance/coa                     → CoaCatalogView (all charts)
 *   /finance/coa?chart=COA-IFRS      → AccountExplorerView for that chart
 *   /finance/coa?account=400100      → account selected in right drawer
 */

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageFrame } from "@athyper/ui/layout";
import { Badge } from "@athyper/ui/primitives";
import { CoaCatalogView, AccountExplorerView } from "@athyper/finance-workbench/views";
import { useCharts } from "@athyper/finance-workbench/hooks";
import type { ChartOfAccount } from "@athyper/finance-workbench/data";

export default function CoaPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const chartCode    = searchParams.get("chart");

  const { data: charts } = useCharts();

  // Resolve the selected chart from live data; fall back to a code-only shell
  // while charts are still loading so the header renders immediately.
  const selectedChart: ChartOfAccount | null = chartCode
    ? (charts?.find((c) => c.code === chartCode)
        ?? { id: chartCode, code: chartCode, name: chartCode, framework: "", tier: "operating" as const, country: null, accountCount: 0, version: 1, isLocked: false })
    : null;

  const handleOpenChart = useCallback(
    (chart: ChartOfAccount) => {
      router.push(`/finance/coa?chart=${encodeURIComponent(chart.code)}`);
    },
    [router],
  );

  const handleBack = useCallback(() => {
    router.push("/finance/coa");
  }, [router]);

  return (
    <PageFrame
      title={selectedChart ? selectedChart.name : "Chart of Accounts"}
      description={
        selectedChart
          ? `${selectedChart.framework.toUpperCase()} · ${selectedChart.accountCount} accounts`
          : "Chart of Accounts catalog — all companies"
      }
      actions={<Badge variant="muted">finance / coa</Badge>}
    >
      {selectedChart ? (
        <AccountExplorerView chart={selectedChart} onBack={handleBack} />
      ) : (
        <CoaCatalogView onOpenChart={handleOpenChart} />
      )}
    </PageFrame>
  );
}
