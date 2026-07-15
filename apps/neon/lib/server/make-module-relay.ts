import "server-only";

import { buildRelayHandler } from "@athyper/bff-relay";
import { getNeonServerSession } from "@/lib/server/session";

const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:4000";

export interface MakeModuleRelayOptions {
  passthroughHeaders?: readonly string[];
}

export function makeModuleRelay(modulePrefix: string, options: MakeModuleRelayOptions = {}) {
  const handler = buildRelayHandler({
    resolveSession: () => getNeonServerSession(),
    runtimeApiUrl: RUNTIME_API_URL,
    appLabel: `neon:${modulePrefix}`,
    routePrefix: modulePrefix,
    passthroughHeaders: options.passthroughHeaders,
  });
  return { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler };
}
