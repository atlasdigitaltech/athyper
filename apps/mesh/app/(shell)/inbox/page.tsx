import { MeshInboxPage } from "@athyper/app-mesh/console";
import { PLANE_KEY } from "@/lib/plane";

export default function InboxRoute() {
  return <MeshInboxPage plane={PLANE_KEY} />;
}
