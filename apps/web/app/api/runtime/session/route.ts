import { NextResponse } from "next/server";
import {
  getServerSession,
  parseOrgAlias,
} from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/runtime/session?tenant=X&entity=Y&workbench=Z
 *
 * BFF proxy to the runtime session API.
 *   1. Reads the access token from the Redis session (never exposed to browser).
 *   2. Falls back to activeOrg / activeWorkbench from session when params absent.
 *   3. Forwards the request to {RUNTIME_API_URL}/api/session with Bearer auth.
 *
 * Token expiry handling: if the backend returns 401 INVALID_TOKEN the response is
 * forwarded as-is. SessionProvider detects it, calls POST /api/auth/refresh (which
 * uses the distributed lock + SID rotation), then retries this endpoint once with
 * the new cookie. Doing the refresh server-side here would race with the proactive
 * timer (both would consume the single-use KC refresh token simultaneously).
 */
export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "INVALID_TOKEN", message: "No active session." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  let tenant = searchParams.get("tenant");
  let entity = searchParams.get("entity");
  let workbench = searchParams.get("workbench");

  // Fall back to active context stored in BFF session
  if ((!tenant || !entity) && session.activeOrg) {
    const parsed = parseOrgAlias(session.activeOrg);
    tenant ??= parsed.tenant;
    entity ??= parsed.entity;
  }
  workbench ??= session.activeWorkbench ?? null;

  if (!tenant || !entity || !workbench) {
    return NextResponse.json(
      { error: "No active context. Select an entity first." },
      { status: 400 },
    );
  }

  const delegation = searchParams.get("delegation");
  const params = new URLSearchParams({ tenant, entity, workbench });
  if (delegation) params.set("delegation", delegation);
  const url = `${RUNTIME_API_URL}/api/session?${params}`;

  try {
    const res = await fetch(url, { headers: buildRuntimeHeaders(session), cache: "no-store" });
    const data = (await res.json()) as { error?: string; message?: string };

    if (!res.ok) {
      console.error(
        `[api/runtime/session] upstream ${res.status} — ${data.error ?? "UNKNOWN"}: ${data.message ?? ""}`,
        { tenant, entity, workbench, userId: session.userId },
      );
      if (res.status >= 500) {
        return NextResponse.json(
          {
            error: "SERVICE_UNAVAILABLE",
            message: "The platform service is temporarily unavailable. Please try again shortly.",
          },
          { status: res.status },
        );
      }
    }

    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api/runtime/session] proxy error:", msg, { tenant, entity, workbench });
    return NextResponse.json(
      {
        error: "SERVICE_UNAVAILABLE",
        message: "The platform service could not be reached. Please reload the page or try again shortly.",
      },
      { status: 503 },
    );
  }
}
