import { MeshDashboardPage } from "@athyper/app-mesh/console";
import { PLANE_KEY } from "@/lib/plane";

export default function DashboardRoute() {
  return <MeshDashboardPage plane={PLANE_KEY} />;
}
