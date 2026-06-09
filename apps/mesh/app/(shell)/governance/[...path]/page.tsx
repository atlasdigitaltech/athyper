import { MeshGovernancePage } from "@athyper/app-mesh/console";
import { PLANE_KEY } from "@/lib/plane";

export default async function GovernancePathRoute({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return <MeshGovernancePage plane={PLANE_KEY} path={path} />;
}
