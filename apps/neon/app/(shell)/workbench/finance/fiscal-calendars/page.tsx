import { redirect } from "next/navigation";
import { ConfigureWorkspaceView } from "@athyper/finance-workbench";
import { getNeonServerSession } from "@/lib/server/session";
import { governanceRouteProps, type WorkbenchSearchParams } from "../_components/route-params";

export default async function FiscalCalendarsPage({ searchParams }: { searchParams: Promise<WorkbenchSearchParams> }) {
  if (!await getNeonServerSession()) redirect("/login?next=/workbench/finance/fiscal-calendars");
  const { scope } = governanceRouteProps(await searchParams);
  return <ConfigureWorkspaceView companyCode={scope.scopeId} initialTab="fiscal_calendar" />;
}
