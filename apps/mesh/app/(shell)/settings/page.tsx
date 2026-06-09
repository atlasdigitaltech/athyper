import { MeshSettingsPage } from "@athyper/app-mesh/console";
import { PLANE_KEY } from "@/lib/plane";

export default function SettingsRoute() {
  return <MeshSettingsPage plane={PLANE_KEY} />;
}
