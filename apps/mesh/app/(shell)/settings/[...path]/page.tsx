import { MeshSettingsPage } from "@athyper/app-mesh/console";
import { PLANE_KEY } from "@/lib/plane";

export default async function SettingsPathRoute({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return <MeshSettingsPage plane={PLANE_KEY} path={path} />;
}
