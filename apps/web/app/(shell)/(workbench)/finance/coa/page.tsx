import { CoaWorkbench } from "@athyper/finance-workbench";
import { PageFrame } from "@athyper/ui/layout";
import { Suspense } from "react";

/**
 * Chart of Accounts - /finance/coa
 *
 * Workbench surface with URL-synced state:
 *   /finance/coa?tab=catalog                  (default)
 *   /finance/coa?tab=explorer&chart=COA-IFRS
 *   /finance/coa?tab=trial-balance
 */

export default function CoaPage() {
  return (
    <PageFrame width="full" className="h-full min-h-0">
      <Suspense fallback={<div className="h-full min-h-0 rounded-lg border bg-card" />}>
        <CoaWorkbench />
      </Suspense>
    </PageFrame>
  );
}
