/**
 * Notification admin relay — routing rules, templates, categories, preferences.
 *
 * Proxies /api/notifications/admin/<rest> → runtime /api/notifications/<rest>
 * (strips the /admin/ segment so the upstream path is clean).
 *
 * Why a separate /admin/ prefix here: the existing /api/notifications/[...slug]
 * already handles in-app POST actions (read, read-all) and routes them to
 * /api/platform/notifications/*. Adding admin paths under that same catch-all
 * would require conditional logic. An explicit /admin/ prefix in the BFF keeps
 * the two surfaces cleanly separated.
 */
import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

type Params = { params: Promise<{ path: string[] }> };

async function relay(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  const subPath = path.join("/");
  const search  = req.nextUrl.search;

  // Strip /admin/ BFF prefix — upstream path is /api/notifications/<subPath>
  const upstreamUrl = `${RUNTIME_API_URL}/api/notifications/${subPath}${search}`;

  const headers = new Headers(Object.entries(buildRuntimeHeaders(session)));
  const init: RequestInit = { method: req.method, headers, cache: "no-store" };

  if (req.method !== "GET" && req.method !== "HEAD") {
    headers.set("Content-Type", req.headers.get("Content-Type") ?? "application/json");
    init.body = await req.text();
  }

  try {
    const upstream = await fetch(upstreamUrl, init);
    if (upstream.status === 204) return new NextResponse(null, { status: 204 });
    const ct = upstream.headers.get("Content-Type") ?? "application/json";
    return new NextResponse(await upstream.arrayBuffer(), {
      status:  upstream.status,
      headers: { "Content-Type": ct },
    });
  } catch (err) {
    console.error("[relay:notifications-admin] upstream error", err);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}

export const GET    = relay;
export const POST   = relay;
export const PATCH  = relay;
export const DELETE = relay;
