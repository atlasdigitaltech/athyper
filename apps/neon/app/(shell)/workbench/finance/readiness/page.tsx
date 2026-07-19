import { redirect } from "next/navigation";
import { getNeonServerSession } from "@/lib/server/session";
import { FinanceGovernanceRouteView } from "../_components/FinanceGovernanceRouteView";
import { governanceRouteProps, type WorkbenchSearchParams } from "../_components/route-params";

export default async function FinanceReadinessPage({ searchParams }: { searchParams: Promise<WorkbenchSearchParams> }) {
  if (!await getNeonServerSession()) redirect("/login?next=/workbench/finance/readiness");
  return <FinanceGovernanceRouteView mode="readiness" {...governanceRouteProps(await searchParams)} />;
}
