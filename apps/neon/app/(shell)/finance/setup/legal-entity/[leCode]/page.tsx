import { redirect } from "next/navigation";
import { RollupView } from "@athyper/finance-workbench";
import { getNeonServerSession } from "@/lib/server/session";

export default async function FinanceSetupLegalEntityRollupRoute({
  params,
}: {
  params: Promise<{ leCode: string }>;
}) {
  const { leCode } = await params;
  const session = await getNeonServerSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/finance/setup/legal-entity/${leCode}`)}`);
  }
  return <RollupView scopeType="legal_entity" scopeCode={decodeURIComponent(leCode)} />;
}
