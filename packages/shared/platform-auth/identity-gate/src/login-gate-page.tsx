import type { PlaneKey } from "@athyper/session-plane";

import { LoginGateClient } from "./login-gate-client";

export function LoginGatePage({ plane, reason }: { plane: PlaneKey; reason?: string }) {
  return <LoginGateClient plane={plane} reason={reason} />;
}


