import { MeshWorkbenchPage } from "@athyper/app-mesh/console";
import { PLANE_KEY } from "@/lib/plane";

export default async function WorkbenchPathRoute({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return <MeshWorkbenchPage plane={PLANE_KEY} path={path} />;
}
