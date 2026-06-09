import { ContentPage } from "@athyper/app-neon/workbench";
import { PLANE_KEY } from "@/lib/plane";

export default function ContentRoute() {
  return <ContentPage plane={PLANE_KEY} />;
}
