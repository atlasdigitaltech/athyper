import { LogoutPage } from "@athyper/platform-iam-identity-gate";
import { PLANE_KEY } from "@/lib/plane";

export default function LogoutRoute() {
  return <LogoutPage plane={PLANE_KEY} />;
}
