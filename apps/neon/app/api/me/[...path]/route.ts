import "server-only";

import { buildRelayHandler } from "@athyper/bff-relay";
import { getNeonServerSession } from "@/lib/server/session";

const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:4000";

const handler = buildRelayHandler({
  resolveSession: () => getNeonServerSession(),
  runtimeApiUrl: RUNTIME_API_URL,
  appLabel: "neon:me",
  routePrefix: "me",
});

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
