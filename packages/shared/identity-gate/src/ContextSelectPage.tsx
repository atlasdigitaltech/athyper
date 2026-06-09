import type { PlaneKey } from "@athyper/session-plane";

import { ContextSelectClient } from "./ContextSelectClient";

export function ContextSelectPage({ plane }: { plane: PlaneKey }) {
  return <ContextSelectClient plane={plane} />;
}
