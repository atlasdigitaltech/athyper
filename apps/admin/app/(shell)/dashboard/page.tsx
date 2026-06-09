import { DashboardPage } from "@athyper/app-admin-command-hub";
import { PLANE_KEY } from "@/lib/plane";

export default function DashboardRoute() {
  return <DashboardPage plane={PLANE_KEY} />;
}
