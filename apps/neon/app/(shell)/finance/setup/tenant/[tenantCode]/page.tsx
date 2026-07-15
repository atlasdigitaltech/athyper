import { redirect } from "next/navigation";
import { RollupView } from "@athyper/finance-workbench";
import { getNeonServerSession } from "@/lib/server/session";

export default async function FinanceSetupTenantRollupRoute({
  params,
}: {
  params: Promise<{ tenantCode: string }>;
}) {
  const { tenantCode } = await params;
  const session = await getNeonServerSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/finance/setup/tenant/${tenantCode}`)}`);
  }
  return <RollupView scopeType="tenant" scopeCode={decodeURIComponent(tenantCode)} />;
}
