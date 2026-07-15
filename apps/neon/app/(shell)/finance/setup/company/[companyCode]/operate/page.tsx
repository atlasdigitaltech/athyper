import { redirect } from "next/navigation";
import { OperateWorkspaceView } from "@athyper/finance-workbench";
import { getNeonServerSession } from "@/lib/server/session";

export default async function FinanceSetupOperateRoute({
  params,
}: {
  params: Promise<{ companyCode: string }>;
}) {
  const { companyCode } = await params;
  const session = await getNeonServerSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/finance/setup/company/${companyCode}/operate`)}`);
  }
  return <OperateWorkspaceView companyCode={decodeURIComponent(companyCode)} />;
}
