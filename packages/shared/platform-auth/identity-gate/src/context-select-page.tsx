import type { PlaneKey } from "@athyper/session-plane";

import { ContextSelectClient } from "./context-select-client";

export function ContextSelectPage({ plane }: { plane: PlaneKey }) {
  return <ContextSelectClient plane={plane} />;
}


