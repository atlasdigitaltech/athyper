import { SetupPage } from "@athyper/app-admin-command-hub";
import { isAdminSetupSection } from "@athyper/app-admin-route-manifest";
import { notFound } from "next/navigation";

export default async function SetupPathRoute({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path[0] && !isAdminSetupSection(path[0])) notFound();
  return <SetupPage path={path} />;
}
