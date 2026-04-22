import { NextRequest, NextResponse } from "next/server";
import { getSessionRedis } from "@/lib/auth/session-redis";
import { getSessionId } from "@/lib/auth/session";
import { resolveRealmConfig } from "@/lib/auth/realm-config";
import { sessKey } from "@/lib/auth/redis-keys";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";
import type { V4Session } from "@/lib/auth/types";

/**
 * POST /api/auth/mfa/webauthn-begin
 * Calls backend to generate a WebAuthn assertion challenge.
 * Supplies X-Org from session since activeOrg may be null pre-select.
 */
export async function POST(request: NextRequest) {
  try {
    const sid = await getSessionId();
    if (!sid) return NextResponse.json({ error: "NO_SESSION" }, { status: 401 });

    const isPlatform = request.cookies.get("neon_realm")?.value === "platform";
    const { sessionNamespace } = resolveRealmConfig(isPlatform);
    const redis = await getSessionRedis();

    const raw = await redis.get(sessKey(sessionNamespace, sid));
    if (!raw) return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 401 });

    const session = JSON.parse(raw as string) as V4Session;
    const orgAlias = session.activeOrg ?? Object.keys(session.organizations)[0] ?? null;
    if (!orgAlias) return NextResponse.json({ error: "NO_ORG" }, { status: 400 });

    const headers = buildRuntimeHeaders(session);
    if (!headers["X-Org"]) headers["X-Org"] = orgAlias;

    const upstream = await fetch(`${RUNTIME_API_URL}/api/iam/mfa/webauthn/assert/begin`, {
      method: "POST",
      headers,
    });

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({})) as { message?: string };
      return NextResponse.json({ error: "UPSTREAM_ERROR", message: err.message }, { status: upstream.status });
    }

    const data = await upstream.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[auth/mfa/webauthn-begin]", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
