import type { PlaneKey } from "@athyper/session-plane";

import { MfaChallengeClient } from "./MfaChallengeClient";

export function MfaChallengePage({ plane }: { plane: PlaneKey }) {
  return <MfaChallengeClient plane={plane} />;
}
