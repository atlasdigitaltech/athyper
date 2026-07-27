import { redirect } from "next/navigation";
import { getAdminServerSession } from "@/lib/server/session";
import { AdminDashboardClient } from "./DashboardClient";

export default async function DashboardRoute() {
  const session = await getAdminServerSession();
  if (!session) redirect("/login?next=/dashboard");
  return <AdminDashboardClient userName={session.displayName} />;
}
