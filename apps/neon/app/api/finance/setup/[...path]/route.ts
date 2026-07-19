/**
 * BFF relay for Finance Setup Workbench endpoints.
 *
 * Forwards /api/finance/setup/... to the RUNTIME_API_URL with the neon session.
 * Relays read and mutation methods while preserving tenant/session headers.
 */

import "server-only";
import { NextResponse } from "next/server";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

async function forward(request: Request, path: string[]): Promise<NextResponse> {
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in to load finance setup." },
      { status: 401 },
    );
  }

  const suffix = path.map((p) => encodeURIComponent(p)).join("/");
  const search = new URL(request.url).search; // includes leading '?'
  const method = request.method.toUpperCase();
  const headers = new Headers(buildRuntimeHeaders(session));
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const requestBody = method === "GET" || method === "HEAD" ? undefined : await request.text();
  const upstream = await fetch(
    buildRuntimeUrl(`/api/finance/setup/${suffix}${search}`),
    {
      method,
      headers,
      body: requestBody || undefined,
      cache:   "no-store",
    },
  );

  const body = await readJson(upstream);
  return NextResponse.json(
    body ?? { error: "FINANCE_SETUP_FETCH_FAILED", message: `Upstream returned ${upstream.status}.` },
    { status: upstream.status, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return forward(request, path);
}

async function readJson(input: Request | Response): Promise<unknown> {
  try {
    return await input.json() as unknown;
  } catch {
    return null;
  }
}
