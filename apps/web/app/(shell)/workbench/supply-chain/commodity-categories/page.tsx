import { CommodityCategoryWorkbench } from "@athyper/finance-workbench/views";
import { PageFrame } from "@athyper/ui/layout";
import { Suspense } from "react";

export default function SupplyChainCommodityCategoriesPage() {
  return (
    <PageFrame width="full" className="h-full min-h-0">
      <Suspense fallback={<div className="h-full min-h-0 rounded-lg border bg-card" />}>
        <CommodityCategoryWorkbench />
      </Suspense>
    </PageFrame>
  );
}
