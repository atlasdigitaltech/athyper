import { redirect } from "next/navigation";
import { getNeonServerSession } from "@/lib/server/session";
import { NeonLandingDashboard } from "./NeonLandingDashboard";

export default async function DashboardRoute() {
  const session = await getNeonServerSession();
  if (!session) redirect("/login?next=/dashboard");
  const membership = session.activeOrg ? session.organizations[session.activeOrg] : undefined;
  const organizationName = membership?.organizationName ?? membership?.legalEntityName ?? membership?.tenantName ?? membership?.name ?? "Your organization";
  return <NeonLandingDashboard organizationName={organizationName} userName={session.displayName} workspaceName={session.activeWorkbench ?? "User"} periodLabel={currentPeriodLabel()} />;
}

function currentPeriodLabel() { return `Period ${new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date())}`; }
