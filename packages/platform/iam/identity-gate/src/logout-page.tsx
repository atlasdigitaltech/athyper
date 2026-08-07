import type { PlaneKey } from "@athyper/platform-iam-session-plane";

import { LogoutClient } from "./logout-client";

export function LogoutPage({ plane }: { plane: PlaneKey }) {
  return <LogoutClient plane={plane} />;
}


