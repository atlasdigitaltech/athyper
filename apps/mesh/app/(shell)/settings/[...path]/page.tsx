import { SettingsClient } from "../SettingsClient";

export default async function SettingsPathRoute({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return <SettingsClient path={path} />;
}
