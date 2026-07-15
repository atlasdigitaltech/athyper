import { NextResponse } from "next/server";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

type Params = {
  id: string;
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

  const { id: invoiceId, path } = await context.params;
  const segments = path ?? [];
  if (!invoiceId || !segments.length) {
    return NextResponse.json(
      { error: "ROUTE_NOT_FOUND", message: "This Neon route is not registered for the tenant control plane." },
      { status: 404 },
    );
  }

  const search = new URL(request.url).search;
  const upstream = await fetch(
    buildRuntimeUrl(
      `/api/finance/ap/invoices/${encodeURIComponent(invoiceId)}`
      + `/pricing-components/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`
      + search,
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
    body ?? { error: "PRICING_COMPONENTS_FETCH_FAILED", message: `Upstream returned ${upstream.status}.` },
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
