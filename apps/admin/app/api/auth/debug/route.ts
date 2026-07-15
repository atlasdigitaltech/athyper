import "server-only";

import { NextResponse } from "next/server";
import { getAdminServerSession } from "@/lib/server/session";
import { RUNTIME_API_URL } from "@/lib/server/runtime-headers";

export async function GET(): Promise<NextResponse> {
  const environment = (process.env.ENVIRONMENT ?? process.env.NEXT_PUBLIC_ENVIRONMENT ?? "").toLowerCase();
  const nodeEnv = (process.env.NODE_ENV ?? "").toLowerCase();
  const isLocal = environment === "local" || nodeEnv === "development";

  if (!isLocal) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const session = await getAdminServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nowSecs = Math.floor(Date.now() / 1000);
  const ttl = session.accessExpiresAt - nowSecs;

  return NextResponse.json({
    session: {
      principal_id: session.userId,
      active_org: session.activeOrg ?? "",
      active_workbench: session.activeWorkbench ?? "",
      token_status: ttl > 0 ? "valid" : "expired",
      token_expires: new Date(session.accessExpiresAt * 1000).toISOString(),
      token_ttl_seconds: Math.max(0, ttl),
      csrf_status: session.csrfToken ? "present" : "missing",
      mfa_required: session.mfaRequired,
      mfa_verified: session.mfaVerified,
    },
    bff: {
      connected: true,
      environment: process.env.NODE_ENV ?? "unknown",
      runtime_url: RUNTIME_API_URL,
      realm_key: session.realmKey,
    },
  });
}
