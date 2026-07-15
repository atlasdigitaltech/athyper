import { NextResponse } from "next/server";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

type Params = {
  id: string;
  pcId: string;
  path: string[] | undefined;
};

export async function GET(
  request: Request,
  context: { params: Promise<Params> },
) {
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in to view apportionment." },
      { status: 401 },
    );
  }

  const { id: invoiceId, pcId, path } = await context.params;
  const remaining = path ?? [];
  if (remaining.length === 0) {
    return NextResponse.json(
      { error: "ROUTE_NOT_FOUND", message: "This Neon route is not registered for the tenant control plane." },
      { status: 404 },
    );
  }

  const remainder = remaining.map((segment) => encodeURIComponent(segment)).join("/");
  const upstream = await fetch(
    buildRuntimeUrl(
      `/api/finance/ap/invoices/${encodeURIComponent(invoiceId)}`
      + `/pricing-components/${encodeURIComponent(pcId)}`
      + `/${remainder}${request.url ? new URL(request.url).search : ""}`,
    ),
    {
      method: "GET",
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    },
  );

  const upstreamCt = upstream.headers.get("content-type") ?? "";
  if (upstreamCt.startsWith("text/csv")) {
    const headers = new Headers();
    headers.set("content-type", upstreamCt);
    headers.set("cache-control", "no-store");
    const cd = upstream.headers.get("content-disposition");
    if (cd) headers.set("content-disposition", cd);
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  }

  const body = await readJson(upstream);
  return NextResponse.json(
    body ?? { error: "APPORTIONMENT_FETCH_FAILED", message: `Upstream returned ${upstream.status}.` },
    { status: upstream.status, headers: { "cache-control": "no-store" } },
  );
}

async function readJson(input: Request | Response): Promise<unknown> {
  try {
    return await input.json() as unknown;
  } catch {
    return null;
  }
}
