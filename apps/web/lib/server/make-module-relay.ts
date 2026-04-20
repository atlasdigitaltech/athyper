import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, sanitizeContentDisposition } from "@/lib/server/runtime-headers";

/**
 * Creates a catch-all relay handler for a specific module prefix.
 *
 * Usage (in apps/web/app/api/<module>/[...path]/route.ts):
 *   const { GET, POST, PUT, PATCH, DELETE } = makeModuleRelay("governance");
 *   export { GET, POST, PUT, PATCH, DELETE };
 *
 * Proxies /api/<module>/<rest> → runtime /api/<module>/<rest>
 * with Bearer auth + tenant context injected from the session.
 */
export function makeModuleRelay(modulePrefix: string) {
  type Params = { params: Promise<{ path: string[] }> };

  async function relay(req: NextRequest, { params }: Params): Promise<NextResponse> {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { path } = await params;
    const subPath = path.join("/");
    const search = req.nextUrl.search;
    const upstreamUrl = `${RUNTIME_API_URL}/api/${modulePrefix}/${subPath}${search}`;

    const headers = new Headers(Object.entries(buildRuntimeHeaders(session)));

    const init: RequestInit = { method: req.method, headers, cache: "no-store" };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const ct = req.headers.get("Content-Type") ?? "application/json";
      headers.set("Content-Type", ct);
      init.body = await req.text();
    }

    try {
      const upstream = await fetch(upstreamUrl, init);
      if (upstream.status === 204) return new NextResponse(null, { status: 204 });
      const ct = upstream.headers.get("Content-Type") ?? "application/json";
      const disposition = upstream.headers.get("Content-Disposition");
      const resHeaders: Record<string, string> = { "Content-Type": ct };
      if (disposition) resHeaders["Content-Disposition"] = sanitizeContentDisposition(disposition);
      return new NextResponse(await upstream.arrayBuffer(), { status: upstream.status, headers: resHeaders });
    } catch (err) {
      console.error(`[relay:${modulePrefix}] upstream error`, err);
      return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
    }
  }

  return { GET: relay, POST: relay, PUT: relay, PATCH: relay, DELETE: relay };
}
