import { redirect } from "next/navigation";
import { getMeshServerSession } from "@/lib/server/session";
import { MeshDashboardClient } from "./DashboardClient";

export default async function DashboardRoute() {
  const session = await getMeshServerSession();
  if (!session) redirect("/login?next=/dashboard");
  return <MeshDashboardClient userName={session.displayName} />;
}
