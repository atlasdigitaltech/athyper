import { NextRequest, NextResponse } from "next/server";
import { getSessionRedis } from "@/lib/auth/session-redis";
import { getSessionId, clearMfaPendingCookie } from "@/lib/auth/session";
import { resolveRealmConfig } from "@/lib/auth/realm-config";
import { sessKey } from "@/lib/auth/redis-keys";
import type { V4Session } from "@/lib/auth/types";

const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:4000";

async function markSessionVerified(redis: Awaited<ReturnType<typeof getSessionRedis>>, key: string, session: V4Session) {
  session.mfaRequired = false;
  session.mfaVerified = true;
  const ttl = await redis.ttl(key);
  await redis.set(key, JSON.stringify(session), { EX: ttl > 0 ? ttl : 28800 });
  await clearMfaPendingCookie();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      // TOTP
      code?: string;
      // WebAuthn
      type?: string;
      id?: string;
      rawId?: string;
      response?: { clientDataJSON?: string; authenticatorData?: string; signature?: string; userHandle?: string };
    };

    const sid = await getSessionId();
    if (!sid) return NextResponse.json({ error: "NO_SESSION" }, { status: 401 });

    const isPlatform = request.cookies.get("neon_realm")?.value === "platform";
    const { sessionNamespace } = resolveRealmConfig(isPlatform);
    const redis = await getSessionRedis();

    const raw = await redis.get(sessKey(sessionNamespace, sid));
    if (!raw) return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 401 });

    const session = JSON.parse(raw as string) as V4Session;
    const sKey = sessKey(sessionNamespace, sid);

    if (!session.mfaRequired) {
      await clearMfaPendingCookie();
      return NextResponse.json({ ok: true });
    }

    const orgAlias = session.activeOrg ?? Object.keys(session.organizations)[0] ?? "";
    const authHeaders = {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${session.accessToken}`,
      "X-Org":        orgAlias,
      "X-Realm":      session.realmKey,
    };

    // ── WebAuthn assertion ──────────────────────────────────────────────────
    if (body.type === "webauthn") {
      if (!body.id || !body.response?.clientDataJSON) {
        return NextResponse.json({ error: "INVALID_ASSERTION", message: "Invalid WebAuthn response" }, { status: 400 });
      }

      const assertRes = await fetch(`${RUNTIME_API_URL}/api/iam/mfa/webauthn/assert/verify`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ id: body.id, rawId: body.rawId, response: body.response, type: body.type }),
      });

      if (!assertRes.ok) {
        const err = await assertRes.json().catch(() => ({})) as { message?: string };
        return NextResponse.json(
          { error: "WEBAUTHN_FAILED", message: err.message ?? "Security Key verification failed." },
          { status: 422 },
        );
      }

      await markSessionVerified(redis, sKey, session);
      return NextResponse.json({ ok: true });
    }

    // ── TOTP code ──────────────────────────────────────────────────────────
    const code = body.code?.trim();
    if (!code || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "INVALID_CODE", message: "A 6-digit code is required" }, { status: 400 });
    }

    const elevateRes = await fetch(`${RUNTIME_API_URL}/api/iam/mfa/elevate`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ action_class: "security_change", code, method_type: "totp" }),
    });

    if (!elevateRes.ok) {
      const err = await elevateRes.json().catch(() => ({})) as { message?: string };
      return NextResponse.json(
        { error: "INVALID_CODE", message: err.message ?? "Invalid or expired code. Try again." },
        { status: 422 },
      );
    }

    await markSessionVerified(redis, sKey, session);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/mfa/verify] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
