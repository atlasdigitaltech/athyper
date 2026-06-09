import type { PlaneKey } from "@athyper/session-plane";

import { LogoutClient } from "./LogoutClient";

export function LogoutPage({ plane }: { plane: PlaneKey }) {
  return <LogoutClient plane={plane} />;
}
