import { redirect } from "next/navigation";
import { getNeonServerSession } from "@/lib/server/session";
import { NeonLandingDashboard } from "./NeonLandingDashboard";

export default async function DashboardRoute() {
  const session = await getNeonServerSession();
  if (!session) redirect("/login?next=/dashboard");
  return <NeonLandingDashboard userName={session.displayName} />;
}
