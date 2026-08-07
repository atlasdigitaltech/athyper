import { ContextSelectPage } from "@athyper/platform-iam-identity-gate";
import { PLANE_KEY } from "@/lib/plane";

export default function AuthSelectPage() {
  return <ContextSelectPage plane={PLANE_KEY} />;
}
