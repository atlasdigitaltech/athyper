import { MeshGovernancePage } from "@athyper/app-mesh/console";
import { PLANE_KEY } from "@/lib/plane";

export default function GovernanceRoute() {
  return <MeshGovernancePage plane={PLANE_KEY} />;
}
