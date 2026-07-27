import { redirect } from "next/navigation";
import { getNeonServerSession } from "@/lib/server/session";
import { NeonDashboardClient } from "./DashboardClient";

export default async function DashboardRoute() {
  const session = await getNeonServerSession();
  if (!session) redirect("/login?next=/dashboard");
  return <NeonDashboardClient userName={session.displayName} />;
}
