import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

const NOTIF_PARAMS = ["limit", "offset", "unread", "priority", "event_code"] as const;

/**
 * GET /api/notifications
 *
 * BFF proxy for the notifications list.
 * Falls back to an empty list if the upstream endpoint is not yet available,
 * so the NotifPanel renders "No notifications" rather than an error.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const qs = forwardSearchParams(req.url, NOTIF_PARAMS);

  try {
    const res = await fetch(
      `${RUNTIME_API_URL}/api/platform/notifications?${qs}`,
      {
        headers: buildRuntimeHeaders(session),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      // Backend not yet available — return empty list so UI degrades gracefully
      return NextResponse.json({ data: [] });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ data: [] });
  }
}
