import { LogoutPage } from "@athyper/identity-gate";
import { PLANE_KEY } from "@/lib/plane";

export default function LogoutRoute() {
  return <LogoutPage plane={PLANE_KEY} />;
}
