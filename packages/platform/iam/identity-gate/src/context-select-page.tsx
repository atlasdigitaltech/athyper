import type { PlaneKey } from "@athyper/platform-iam-session-plane";

import { ContextSelectClient } from "./context-select-client";

export function ContextSelectPage({ plane }: { plane: PlaneKey }) {
  return <ContextSelectClient plane={plane} />;
}


