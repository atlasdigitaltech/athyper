import "server-only";

import { buildRelayHandler } from "@athyper/bff-relay";
import { getNeonServerSession } from "@/lib/server/session";

const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:4000";

const handler = buildRelayHandler({
  resolveSession: () => getNeonServerSession(),
  runtimeApiUrl: RUNTIME_API_URL,
  appLabel: "neon:relay",
  // `If-Match` carries the etag for the document edit-session PATCH path
  // (Phase 4 optimistic concurrency). Without forwarding, every save would
  // hit the records service with a missing precondition and fall back to
  // last-write-wins. The other Idempotency-* headers cover non-edit POSTs.
  passthroughHeaders: ["Idempotency-Key", "X-Idempotency-Key", "If-Match"],
});

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
