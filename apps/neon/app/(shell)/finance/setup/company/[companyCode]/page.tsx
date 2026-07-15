/**
 * /finance/setup/company/:companyCode — Finance Setup Company Hub
 *
 * Renders the top-level readiness Hub for a company. Server-side responsibilities:
 *   - Auth guard
 *   - Redirect to login if session is missing
 *
 * All data loading is client-side via React Query (useCompanyHub +
 * useFinanceSetupConflicts). The Hub is a snapshot view; mutations are Phase 2.
 */

import { redirect } from "next/navigation";
import { CompanyHubView } from "@athyper/finance-workbench";
import { getNeonServerSession } from "@/lib/server/session";

export default async function FinanceSetupCompanyHubRoute({
  params,
}: {
  params: Promise<{ companyCode: string }>;
}) {
  const { companyCode } = await params;
  const session = await getNeonServerSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/finance/setup/company/${companyCode}`)}`);
  }

  return <CompanyHubView companyCode={decodeURIComponent(companyCode)} />;
}
