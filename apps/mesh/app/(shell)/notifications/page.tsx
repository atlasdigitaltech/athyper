import { MeshNotificationsPage } from "@athyper/app-mesh/console";
import { PLANE_KEY } from "@/lib/plane";

export default function NotificationsRoute() {
  return <MeshNotificationsPage plane={PLANE_KEY} />;
}
