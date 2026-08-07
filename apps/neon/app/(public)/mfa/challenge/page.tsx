import { MfaChallengePage } from "@athyper/platform-iam-identity-gate";
import { PLANE_KEY } from "@/lib/plane";

export default function MfaPage() {
  return <MfaChallengePage plane={PLANE_KEY} />;
}
