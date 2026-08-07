// {GET|POST|PUT|PATCH|DELETE} /api/relay/[...path] — generic BFF relay to RUNTIME_API_URL.
// No routePrefix: incoming /api/relay/foo forwards to upstream /api/foo (or /foo when the caller path already starts with "api/").
// If-Match and X-Document-Edit-Workspace are forwarded independently for
// optimistic concurrency and workspace lifecycle authorization.
import "server-only";

import {
  buildRelayHandler,
  isNotificationEventStreamRequest,
} from "@athyper/platform-bff-relay";
import { getNeonServerSession } from "@/lib/server/session";
import {
  buildSessionConfigurationIdentity,
  invalidateSessionConfiguration,
} from "@/lib/server/session-configuration-cache";

const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:4000";

const RECORD_STREAM_PATH = /^\/api\/records\/[^/]+\/[^/]+\/stream$/;
const ATLAS_AGENT_STREAM_PATH = "/api/ai/agent/runs";

const handler = buildRelayHandler({
  resolveSession: () => getNeonServerSession(),
  runtimeApiUrl: RUNTIME_API_URL,
  appLabel: "neon:relay",
  passthroughHeaders: ["Idempotency-Key", "X-Idempotency-Key", "If-Match", "X-Document-Edit-Workspace"],
  isStreamingRequest: ({ request, upstreamPath }) =>
    (request.method === "POST" && upstreamPath === ATLAS_AGENT_STREAM_PATH) ||
    (request.method === "GET" && (
      isNotificationEventStreamRequest({ request, upstreamPath }) ||
      RECORD_STREAM_PATH.test(upstreamPath)
    )),
});

export const GET = handler;
export const POST = relayMutationWithConfigurationInvalidation;
export const PUT = relayMutationWithConfigurationInvalidation;
export const PATCH = relayMutationWithConfigurationInvalidation;
export const DELETE = relayMutationWithConfigurationInvalidation;

async function relayMutationWithConfigurationInvalidation(
  ...args: Parameters<typeof handler>
): ReturnType<typeof handler> {
  const [request, context] = args;
  const savedViewEntity = await resolveSavedViewMutationEntity(request.clone(), context);
  const response = await handler(...args);
  if (response.ok && savedViewEntity) {
    const session = await getNeonServerSession();
    const identity = session ? buildSessionConfigurationIdentity(session) : null;
    if (identity) {
      invalidateSessionConfiguration({
        namespace: "saved_views",
        tenantId: identity.tenantId,
        planeKey: identity.planeKey,
        realmKey: identity.realmKey,
        principalId: identity.principalId,
        keyParts: { entityCode: savedViewEntity },
        reason: "saved_view_mutation",
      });
    }
  }
  return response;
}

async function resolveSavedViewMutationEntity(
  request: Request,
  context: Parameters<typeof handler>[1],
): Promise<string | null> {
  const { path } = await context.params;
  if (path[0] !== "platform" || path[1] !== "saved-views") return null;
  const pathEntity = normalizeEntityCode(path[2]);
  if (pathEntity) return pathEntity;
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return null;
  try {
    const body = await request.json() as unknown;
    if (!isRecord(body)) return null;
    return normalizeEntityCode(body["entityCode"]) ?? normalizeEntityCode(body["entity_code"]);
  } catch {
    return null;
  }
}

function normalizeEntityCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/-/g, "_");
  return /^[a-z][a-z0-9_]*$/.test(normalized) ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
