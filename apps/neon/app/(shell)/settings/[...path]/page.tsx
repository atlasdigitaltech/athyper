import { SettingsPage } from "@athyper/app-neon-command-hub";
import { PLANE_KEY } from "@/lib/plane";

export default async function SettingsPathRoute({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return <SettingsPage plane={PLANE_KEY} path={path} />;
}
