import { redirect } from "next/navigation";
import { getNeonServerSession } from "@/lib/server/session";
import { FinanceGovernanceRouteView } from "../_components/FinanceGovernanceRouteView";
import { governanceRouteProps, type WorkbenchSearchParams } from "../_components/route-params";

export default async function AnnualClosePage({ searchParams }: { searchParams: Promise<WorkbenchSearchParams> }) {
  if (!await getNeonServerSession()) redirect("/login?next=/workbench/finance/annual-close");
  return <FinanceGovernanceRouteView mode="annual" {...governanceRouteProps(await searchParams)} />;
}
