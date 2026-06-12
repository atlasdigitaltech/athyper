import "server-only";

import { buildRelayHandler } from "@athyper/bff-relay";
import { getNeonServerSession } from "@/lib/server/session";

const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:4000";

export function makeModuleRelay(modulePrefix: string) {
  const handler = buildRelayHandler({
    resolveSession: () => getNeonServerSession(),
    runtimeApiUrl: RUNTIME_API_URL,
    appLabel: `neon:${modulePrefix}`,
    routePrefix: modulePrefix,
  });
  return { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler };
}
