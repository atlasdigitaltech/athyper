import { NextRequest, NextResponse } from "next/server";
import { getSessionRedis } from "@/lib/auth/session-redis";
import { getSessionId } from "@/lib/auth/session";
import { clearMfaPendingCookie } from "@/lib/auth/session";
import { resolveRealmConfig } from "@/lib/auth/realm-config";
import { sessKey } from "@/lib/auth/redis-keys";
import type { V4Session } from "@/lib/auth/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { code?: string };
    const code = body.code?.trim();
    if (!code || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "INVALID_CODE", message: "A 6-digit code is required" }, { status: 400 });
    }

    const sid = await getSessionId();
    if (!sid) {
      return NextResponse.json({ error: "NO_SESSION" }, { status: 401 });
    }

    const isPlatformSession = request.cookies.get("neon_realm")?.value === "platform";
    const { sessionNamespace } = resolveRealmConfig(isPlatformSession);
    const redis = await getSessionRedis();

    const raw = await redis.get(sessKey(sessionNamespace, sid));
    if (!raw) {
      return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 401 });
    }

    const session = JSON.parse(raw as string) as V4Session;
    if (!session.mfaRequired) {
      // MFA already verified or not required — clear cookie defensively and allow
      await clearMfaPendingCookie();
      return NextResponse.json({ ok: true });
    }

    // Verify the TOTP code via the backend elevate endpoint
    const runtimeApiUrl = process.env.RUNTIME_API_URL ?? "http://localhost:4000";
    // Backend requires X-Org and X-Realm to resolve tenant context
    const firstOrgAlias = session.activeOrg ?? Object.keys(session.organizations)[0] ?? "";

    const elevateRes = await fetch(`${runtimeApiUrl}/api/iam/mfa/elevate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
        "X-Org": firstOrgAlias,
        "X-Realm": session.realmKey,
      },
      body: JSON.stringify({ action_class: "security_change", code, method_type: "totp" }),
    });

    if (!elevateRes.ok) {
      const err = await elevateRes.json().catch(() => ({})) as { message?: string };
      return NextResponse.json(
        { error: "INVALID_CODE", message: err.message ?? "Invalid or expired code. Try again." },
        { status: 422 },
      );
    }

    // Mark session as MFA-verified in Redis
    session.mfaRequired = false;
    session.mfaVerified = true;
    const ttl = await redis.ttl(sessKey(sessionNamespace, sid));
    await redis.set(
      sessKey(sessionNamespace, sid),
      JSON.stringify(session),
      { EX: ttl > 0 ? ttl : 28800 },
    );

    await clearMfaPendingCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/mfa/verify] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
