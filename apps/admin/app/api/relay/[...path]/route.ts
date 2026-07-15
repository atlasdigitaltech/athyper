import "server-only";

import { buildRelayHandler } from "@athyper/bff-relay";
import { getAdminServerSession } from "@/lib/server/session";

const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:4000";

const handler = buildRelayHandler({
  resolveSession: () => getAdminServerSession(),
  runtimeApiUrl: RUNTIME_API_URL,
  appLabel: "admin:relay",
  passthroughHeaders: ["Idempotency-Key", "X-Idempotency-Key", "If-Match"],
});

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
