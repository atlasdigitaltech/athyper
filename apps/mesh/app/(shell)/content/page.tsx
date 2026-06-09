import { MeshContentPage } from "@athyper/app-mesh/console";
import { PLANE_KEY } from "@/lib/plane";

export default function ContentRoute() {
  return <MeshContentPage plane={PLANE_KEY} />;
}
