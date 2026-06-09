import { WorkbenchPage } from "@athyper/app-neon/workbench";
import { PLANE_KEY } from "@/lib/plane";

export default async function WorkbenchPathRoute({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return <WorkbenchPage plane={PLANE_KEY} path={path} />;
}
