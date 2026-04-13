import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/admin/report
 *
 * Returns a JSON diagnostic report for download.
 * Tries the runtime backend first; falls back to a BFF-level summary
 * if the backend is unreachable (so the download button always works).
 *
 * All sensitive values (tokens, secrets) are redacted before export.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Try runtime-generated report first
  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/platform/admin/report`,
      {
        headers: buildRuntimeHeaders(session),
        cache: "no-store",
      },
    );

    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      return NextResponse.json(data);
    }
  } catch {
    // Fall through to BFF-level fallback
  }

  // BFF-level fallback — built from session metadata only (no runtime data)
  const now = Date.now();
  const ttlSeconds = Math.max(0, Math.floor((session.accessExpiresAt - now) / 1000));

  return NextResponse.json({
    _format:       "athyper_diagnostics_v1",
    _redacted:     true,
    _exported_at:  new Date().toISOString(),
    _source:       "bff_fallback",
    session: {
      principal_id:      `${session.userId.slice(0, 8)}…${session.userId.slice(-4)}`,
      active_org:        session.activeOrg,
      active_workbench:  session.activeWorkbench,
      token_status:      ttlSeconds > 0 ? "valid" : "expired",
      token_ttl_seconds: ttlSeconds,
      csrf_status:       session.csrfToken ? "present" : "missing",
      mfa_required:      session.mfaRequired,
      mfa_verified:      session.mfaVerified,
    },
    bff: {
      environment: process.env.NODE_ENV ?? "unknown",
      runtime_url: process.env.RUNTIME_API_URL ? "configured" : "missing",
      realm_key:   session.realmKey,
    },
  });
}
