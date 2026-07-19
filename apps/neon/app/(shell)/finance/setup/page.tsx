/**
 * /finance/setup — Finance Setup Workbench root
 *
 * Resolves the accessible company-code set. A single company is selected
 * automatically; multiple companies require an explicit user choice.
 */

import { redirect } from "next/navigation";
import { FinanceSetupCompanyEntry } from "@athyper/finance-workbench";
import { getNeonServerSession } from "@/lib/server/session";

export default async function FinanceSetupRootRoute() {
  const session = await getNeonServerSession();
  if (!session) redirect("/login?next=/finance/setup");

  return <FinanceSetupCompanyEntry />;
}
