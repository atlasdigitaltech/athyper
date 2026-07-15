import "server-only";

import { buildRelayHandler } from "@athyper/bff-relay";
import { getMeshServerSession } from "@/lib/server/session";

const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:4000";

const handler = buildRelayHandler({
  resolveSession: () => getMeshServerSession(),
  runtimeApiUrl: RUNTIME_API_URL,
  appLabel: "mesh:iam",
  routePrefix: "iam",
});

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
