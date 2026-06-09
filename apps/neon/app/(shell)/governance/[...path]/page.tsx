import { GovernancePage } from "@athyper/app-neon/workbench";
import { PLANE_KEY } from "@/lib/plane";

export default async function GovernancePathRoute({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return <GovernancePage plane={PLANE_KEY} path={path} />;
}
