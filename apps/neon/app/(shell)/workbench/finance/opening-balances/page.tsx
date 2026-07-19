import { redirect } from "next/navigation";
import { getNeonServerSession } from "@/lib/server/session";
import { FinanceGovernanceRouteView } from "../_components/FinanceGovernanceRouteView";
import { governanceRouteProps, type WorkbenchSearchParams } from "../_components/route-params";

export default async function OpeningBalancesPage({ searchParams }: { searchParams: Promise<WorkbenchSearchParams> }) {
  if (!await getNeonServerSession()) redirect("/login?next=/workbench/finance/opening-balances");
  return <FinanceGovernanceRouteView mode="opening" {...governanceRouteProps(await searchParams, 0)} />;
}
