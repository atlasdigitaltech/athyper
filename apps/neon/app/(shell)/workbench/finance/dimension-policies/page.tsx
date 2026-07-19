import { redirect } from "next/navigation";
import { FinanceAggregateEditor } from "@athyper/finance-workbench";
import { getNeonServerSession } from "@/lib/server/session";
import { governanceRouteProps, type WorkbenchSearchParams } from "../_components/route-params";

export default async function DimensionPoliciesPage({ searchParams }: { searchParams: Promise<WorkbenchSearchParams> }) {
  if (!await getNeonServerSession()) redirect("/login?next=/workbench/finance/dimension-policies");
  const { scope } = governanceRouteProps(await searchParams);
  return <div className="p-6"><FinanceAggregateEditor kind="dimensions" companyCode={scope.scopeId} /></div>;
}
