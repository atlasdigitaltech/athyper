import { MfaChallengePage } from "@athyper/identity-gate";
import { PLANE_KEY } from "@/lib/plane";

export default function MfaPage() {
  return <MfaChallengePage plane={PLANE_KEY} />;
}
