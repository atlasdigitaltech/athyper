import { NextResponse } from "next/server";
import {
  getServerSession,
  parseOrgAlias,
} from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";
import { getSessionRedis } from "@/lib/auth/session-redis";
import { refreshTokens } from "@/lib/auth/keycloak";
import { resolveRealmConfig } from "@/lib/auth/realm-config";
import { cookies } from "next/headers";
import type { V4Session } from "@/lib/auth/types";

/**
 * GET /api/runtime/session?tenant=X&entity=Y&workbench=Z
 *
 * BFF proxy to the runtime session API.
 *   1. Reads the access token from the Redis session (never exposed to browser).
 *   2. Falls back to activeOrg / activeWorkbench from session when params absent.
 *   3. Forwards the request to {RUNTIME_API_URL}/api/session with Bearer auth.
 *   4. On 401 INVALID_TOKEN: attempts a one-shot token refresh, then retries.
 *      This is a safety net for the rare case the proactive timer in SessionProvider
 *      fires too late (e.g. suspended laptop, very busy event loop).
 *
 * Used by SessionProvider to hydrate the runtime session (modules, permissions,
 * scope) after the entity + workbench context is set in the BFF session.
 */
export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  /** Call the runtime backend with the given session. */
  async function callRuntime(s: V4Session) {
    return fetch(url, { headers: buildRuntimeHeaders(s), cache: "no-store" });
  }

  try {
    let res = await callRuntime(session);
    let data = (await res.json()) as { error?: string; message?: string };

    // ── Reactive refresh: one-shot safety net ─────────────────────────────────
    // If the backend returns 401 INVALID_TOKEN, the access token expired between
    // the proactive timer firing and this request. Attempt a silent refresh, then
    // retry once with the new token. If the refresh also fails, return 401 — the
    // SessionExpiredDialog will prompt the user to sign in again.
    if (res.status === 401 && data.error === "INVALID_TOKEN" && session.refreshToken) {
      try {
        const cookieStore = await cookies();
        const isPlatformSession = cookieStore.get("neon_realm")?.value === "platform";
        const { realm, clientId, sessionNamespace } = resolveRealmConfig(isPlatformSession);
        const baseUrl = process.env.KEYCLOAK_BASE_URL ?? "https://iam.athyper.local";

        const tokens = await refreshTokens({ baseUrl, realm, clientId, refreshToken: session.refreshToken });

        // Update the session in Redis with the new tokens (best-effort — don't fail the request if Redis write fails)
        try {
          const redis = await getSessionRedis();
          const sid = cookieStore.get("neon_sid")?.value;
          if (sid) {
            const ns = sessionNamespace;
            const raw = await redis.get(`sess:${ns}:${sid}`);
            if (raw) {
              const stored = JSON.parse(raw) as V4Session;
              const nowSec = Math.floor(Date.now() / 1000);
              const updated: V4Session = {
                ...stored,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token ?? stored.refreshToken,
                accessExpiresAt: nowSec + (tokens.expires_in ?? 300),
                refreshExpiresAt: tokens.refresh_expires_in
                  ? nowSec + tokens.refresh_expires_in
                  : stored.refreshExpiresAt,
                idToken: tokens.id_token ?? stored.idToken,
                lastSeenAt: nowSec,
              };
              const ttl = await redis.ttl(`sess:${ns}:${sid}`);
              await redis.set(`sess:${ns}:${sid}`, JSON.stringify(updated), { EX: ttl > 0 ? ttl : 28800 });
            }
          }
        } catch {
          // Redis write failure is non-fatal — the refreshed token is used for this request only
        }

        // Retry with the refreshed access token
        const refreshedSession = { ...session, accessToken: tokens.access_token };
        res = await callRuntime(refreshedSession);
        data = (await res.json()) as { error?: string; message?: string };
      } catch (refreshErr) {
        console.error("[api/runtime/session] reactive refresh failed:", refreshErr instanceof Error ? refreshErr.message : String(refreshErr));
        // Fall through — return the original 401 INVALID_TOKEN
      }
    }

    if (!res.ok) {
      console.error(
        `[api/runtime/session] upstream ${res.status} — ${data.error ?? "UNKNOWN"}: ${data.message ?? ""}`,
        { tenant, entity, workbench, userId: session.userId },
      );

      // Normalize 5xx server errors to a stable error code so the UI can
      // show a consistent "service unavailable" banner regardless of the
      // specific internal error. 4xx codes pass through as-is (they carry
      // meaningful error codes like PRINCIPAL_NOT_FOUND).
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
