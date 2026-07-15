import type { PlaneKey } from "@athyper/session-plane";

import { MfaChallengeClient } from "./mfa-challenge-client";

export function MfaChallengePage({ plane }: { plane: PlaneKey }) {
  return <MfaChallengeClient plane={plane} />;
}



