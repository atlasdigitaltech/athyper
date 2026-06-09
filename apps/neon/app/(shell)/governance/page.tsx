import { GovernancePage } from "@athyper/app-neon/workbench";
import { PLANE_KEY } from "@/lib/plane";

export default function GovernanceRoute() {
  return <GovernancePage plane={PLANE_KEY} />;
}
