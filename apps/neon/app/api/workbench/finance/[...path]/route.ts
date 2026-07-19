import "server-only";
import { NextResponse } from "next/server";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

async function forward(request: Request, path: string[]): Promise<NextResponse> {
  const session = await getNeonServerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const isGovernance = path[0] === "governance";
  const suffix = (isGovernance ? path.slice(1) : path).map(encodeURIComponent).join("/");
  const method = request.method.toUpperCase();
  const headers = new Headers(buildRuntimeHeaders(session));
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text();
  const upstreamPath = isGovernance ? `/api/governance/${suffix}` : `/api/finance/${suffix}`;
  const upstream = await fetch(buildRuntimeUrl(`${upstreamPath}${new URL(request.url).search}`), {
    method, headers, body: body || undefined, cache: "no-store",
  });
  const payload = await upstream.json().catch(() => null) as unknown;
  return NextResponse.json(payload ?? { error: "FINANCE_WORKBENCH_UPSTREAM_ERROR" }, {
    status: upstream.status,
    headers: { "cache-control": "no-store" },
  });
}

type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) { return forward(request, (await context.params).path); }
export async function POST(request: Request, context: Context) { return forward(request, (await context.params).path); }
export async function PUT(request: Request, context: Context) { return forward(request, (await context.params).path); }
export async function PATCH(request: Request, context: Context) { return forward(request, (await context.params).path); }
export async function DELETE(request: Request, context: Context) { return forward(request, (await context.params).path); }
