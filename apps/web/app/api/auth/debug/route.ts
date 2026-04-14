import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";

/**
 * GET /api/auth/debug
 *
 * Returns a redacted session snapshot for the Diagnostics console.
 * Sensitive values (actual tokens, CSRF secret) are NEVER exposed —
 * only status, expiry metadata, and BFF connectivity are returned.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.max(0, session.accessExpiresAt - nowSec);
  const tokenExpires = new Date(session.accessExpiresAt * 1000).toISOString();

  return NextResponse.json({
    session: {
      // Partial principal ID — first 8 + last 4 chars only
      principal_id: `${session.userId.slice(0, 8)}…${session.userId.slice(-4)}`,
      active_org:        session.activeOrg,
      active_workbench:  session.activeWorkbench,
      token_status:      ttlSeconds > 0 ? "valid" : "expired",
      token_expires:     tokenExpires,
      token_ttl_seconds: ttlSeconds,
      // csrf_token is never returned — only whether one is present
      csrf_status:       session.csrfToken ? "present" : "missing",
      mfa_required:      session.mfaRequired,
      mfa_verified:      session.mfaVerified,
    },
    bff: {
      connected:     true,
      environment:   process.env.NODE_ENV ?? "unknown",
      // Only confirm presence of the runtime URL, not its value
      runtime_url:   process.env.RUNTIME_API_URL ? "configured" : "missing",
      realm_key:     session.realmKey,
    },
  });
}
