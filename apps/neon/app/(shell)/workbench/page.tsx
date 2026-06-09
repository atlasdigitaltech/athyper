import { WorkbenchPage } from "@athyper/app-neon/workbench";
import { PLANE_KEY } from "@/lib/plane";

export default function WorkbenchRoute() {
  return <WorkbenchPage plane={PLANE_KEY} />;
}
