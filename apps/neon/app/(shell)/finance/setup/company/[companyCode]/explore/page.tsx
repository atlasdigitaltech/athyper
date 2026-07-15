import { redirect } from "next/navigation";
import { ExploreWorkspaceView } from "@athyper/finance-workbench";
import { getNeonServerSession } from "@/lib/server/session";

export default async function FinanceSetupExploreRoute({
  params,
}: {
  params: Promise<{ companyCode: string }>;
}) {
  const { companyCode } = await params;
  const session = await getNeonServerSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/finance/setup/company/${companyCode}/explore`)}`);
  }
  return <ExploreWorkspaceView companyCode={decodeURIComponent(companyCode)} />;
}
