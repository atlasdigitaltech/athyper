/** Authenticated Neon BFF relay for Finance master context endpoints. */

import "server-only";
import { NextResponse } from "next/server";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in to load Finance scope data." },
      { status: 401 },
    );
  }

  const { path } = await context.params;
  const suffix = path.map((segment) => encodeURIComponent(segment)).join("/");
  const search = new URL(request.url).search;
  const upstream = await fetch(
    buildRuntimeUrl(`/api/finance/master/${suffix}${search}`),
    {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    },
  );

  const body = await readJson(upstream);
  return NextResponse.json(
    body ?? { error: "FINANCE_MASTER_FETCH_FAILED", message: `Upstream returned ${upstream.status}.` },
    { status: upstream.status, headers: { "cache-control": "no-store" } },
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}
