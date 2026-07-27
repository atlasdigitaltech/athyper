/**
 * /finance/setup/company/:companyCode — Company Finance Settings
 *
 * Renders the feature-flagged Finance company landing surface.
 *   - Auth guard
 *   - Redirect to login if session is missing
 *
 * finance.settings_directory changes navigation only:
 * enabled renders the Settings directory; disabled renders the legacy Company Hub.
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
