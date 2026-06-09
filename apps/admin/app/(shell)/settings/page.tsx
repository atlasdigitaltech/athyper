import { SettingsPage } from "@athyper/app-admin-command-hub";
import { PLANE_KEY } from "@/lib/plane";

export default function SettingsRoute() {
  return <SettingsPage plane={PLANE_KEY} />;
}
