import { redirect } from "next/navigation";
import { getNeonServerSession } from "@/lib/server/session";
import { FinanceGovernanceRouteView } from "../_components/FinanceGovernanceRouteView";
import { governanceRouteProps, type WorkbenchSearchParams } from "../_components/route-params";

export default async function MonthlyClosePage({ searchParams }: { searchParams: Promise<WorkbenchSearchParams> }) {
  if (!await getNeonServerSession()) redirect("/login?next=/workbench/finance/monthly-close");
  return <FinanceGovernanceRouteView mode="monthly" {...governanceRouteProps(await searchParams)} />;
}
