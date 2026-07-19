import { redirect } from "next/navigation";
import { AccountingProfileWorkbench } from "@athyper/finance-workbench/views";
import { getNeonServerSession } from "@/lib/server/session";
import { governanceRouteProps, type WorkbenchSearchParams } from "../_components/route-params";

export default async function AccountingProfilesPage({ searchParams }: { searchParams: Promise<WorkbenchSearchParams> }) {
  if (!await getNeonServerSession()) redirect("/login?next=/workbench/finance/accounting-profiles");
  const { scope } = governanceRouteProps(await searchParams);
  return <div className="flex h-full min-h-0 flex-col gap-3 p-4"><div className="shrink-0 rounded-lg border bg-card px-4 py-2 text-xs text-muted-foreground">Current scope: {scope.scopeId || "tenant"} · FY{scope.fiscalYear}</div><AccountingProfileWorkbench /></div>;
}
