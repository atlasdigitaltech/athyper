import { MeshSavedViewsPage } from "@athyper/app-mesh/console";
import { PLANE_KEY } from "@/lib/plane";

export default function SavedViewsRoute() {
  return <MeshSavedViewsPage plane={PLANE_KEY} />;
}
