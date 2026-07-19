import { redirect } from "next/navigation";
import { getNeonServerSession } from "@/lib/server/session";
import { FinanceWorkspace } from "./FinanceWorkspace";

export default async function FinancePage() {
  const session = await getNeonServerSession();
  if (!session) redirect("/login?next=/finance");
  const membership = session.activeOrg ? session.organizations[session.activeOrg] : undefined;
  const organizationName = membership?.organizationName ?? membership?.legalEntityName ?? membership?.tenantName ?? membership?.name ?? "Finance";
  return <FinanceWorkspace organizationName={organizationName} periodLabel={currentPeriodLabel()} />;
}

function currentPeriodLabel() {
  return `Period ${new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date())}`;
}
