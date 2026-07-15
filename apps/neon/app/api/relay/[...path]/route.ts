// {GET|POST|PUT|PATCH|DELETE} /api/relay/[...path] — generic BFF relay to RUNTIME_API_URL.
// No routePrefix: incoming /api/relay/foo forwards to upstream /api/foo (or /foo when the caller path already starts with "api/").
// If-Match and X-Document-Edit-Workspace are forwarded independently for
// optimistic concurrency and workspace lifecycle authorization.
import "server-only";

import { buildRelayHandler } from "@athyper/bff-relay";
import { getNeonServerSession } from "@/lib/server/session";

const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:4000";

const RECORD_STREAM_PATH = /^\/api\/records\/[^/]+\/[^/]+\/stream$/;

const handler = buildRelayHandler({
  resolveSession: () => getNeonServerSession(),
  runtimeApiUrl: RUNTIME_API_URL,
  appLabel: "neon:relay",
  passthroughHeaders: ["Idempotency-Key", "X-Idempotency-Key", "If-Match", "X-Document-Edit-Workspace"],
  isStreamingRequest: ({ request, upstreamPath }) => request.method === "GET" && (
    upstreamPath === "/api/platform/notifications/stream" ||
    RECORD_STREAM_PATH.test(upstreamPath)
  ),
});

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
