import type { PlaneKey } from "@athyper/session-plane";

import { LoginGateClient } from "./LoginGateClient";

export function LoginGatePage({ plane, reason }: { plane: PlaneKey; reason?: string }) {
  return <LoginGateClient plane={plane} reason={reason} />;
}
