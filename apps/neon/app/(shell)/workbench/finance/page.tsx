import { redirect } from "next/navigation";
import { FinanceWorkbenchHub } from "@athyper/finance-workbench";
import { getNeonServerSession } from "@/lib/server/session";
import { governanceRouteProps, type WorkbenchSearchParams } from "./_components/route-params";

export default async function FinanceWorkbenchPage({ searchParams }: { searchParams: Promise<WorkbenchSearchParams> }) {
  if (!await getNeonServerSession()) redirect("/login?next=/workbench/finance");
  const { scope } = governanceRouteProps(await searchParams);
  return <FinanceWorkbenchHub scope={scope} />;
}
