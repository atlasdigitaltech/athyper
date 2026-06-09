import { MeshWorkbenchPage } from "@athyper/app-mesh/console";
import { PLANE_KEY } from "@/lib/plane";

export default function WorkbenchRoute() {
  return <MeshWorkbenchPage plane={PLANE_KEY} />;
}
