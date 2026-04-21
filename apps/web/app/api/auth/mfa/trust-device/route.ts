import { NextRequest, NextResponse } from "next/server";
import { getSessionRedis } from "@/lib/auth/session-redis";
import { getSessionId } from "@/lib/auth/session";
import { resolveRealmConfig } from "@/lib/auth/realm-config";
import { sessKey } from "@/lib/auth/redis-keys";
import { RUNTIME_API_URL } from "@/lib/server/runtime-headers";
import type { V4Session } from "@/lib/auth/types";

/**
 * POST /api/auth/mfa/trust-device
 * BFF wrapper for trusted device registration during MFA challenge.
 * Needed because session.activeOrg is null before /auth/select — this
 * route reads the session server-side and supplies the first org alias.
 * Body: { device_name?: string, ttl_days?: number }
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

    // Use activeOrg if set, otherwise fall back to first org from the list
    const orgAlias = session.activeOrg ?? Object.keys(session.organizations)[0] ?? null;
    if (!orgAlias) {
      return NextResponse.json({ error: "NO_ORG", message: "No org context available" }, { status: 400 });
    }

    const body = await request.json() as { device_name?: string; ttl_days?: number };

    const upstream = await fetch(`${RUNTIME_API_URL}/api/iam/trusted-devices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
        "X-Org":   orgAlias,
        "X-Realm": session.realmKey,
      },
      body: JSON.stringify({ device_name: body.device_name, ttl_days: body.ttl_days ?? 30 }),
    });

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({})) as { message?: string };
      return NextResponse.json({ error: "UPSTREAM_ERROR", message: err.message }, { status: upstream.status });
    }

    const data = await upstream.json();
    const res = NextResponse.json(data, { status: 201 });

    // Forward Set-Cookie (td_token) from backend to browser
    const setCookie = upstream.headers.get("Set-Cookie");
    if (setCookie) res.headers.set("Set-Cookie", setCookie);

    return res;
  } catch (err) {
    console.error("[auth/mfa/trust-device] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
