import { NotificationsPage } from "@athyper/app-neon-command-hub";
import { PLANE_KEY } from "@/lib/plane";

export default function NotificationsRoute() {
  return <NotificationsPage plane={PLANE_KEY} />;
}
