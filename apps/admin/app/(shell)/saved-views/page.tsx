import { SavedViewsPage } from "@athyper/app-admin-command-hub";
import { PLANE_KEY } from "@/lib/plane";

export default function SavedViewsRoute() {
  return <SavedViewsPage plane={PLANE_KEY} />;
}
