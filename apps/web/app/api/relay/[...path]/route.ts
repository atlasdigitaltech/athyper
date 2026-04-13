import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * GET /api/relay/[...path]
 * POST /api/relay/[...path]
 * PUT /api/relay/[...path]
 * PATCH /api/relay/[...path]
 * DELETE /api/relay/[...path]
 *
 * Wildcard BFF proxy — forwards requests to RUNTIME_API_URL with
 * Bearer auth + tenant context injected from the Redis session.
 *
 * Client-side code never touches tokens directly; it calls /api/relay/*
 * and the BFF handles all auth concerns.
 */

type Params = { params: Promise<{ path: string[] }> };

async function relay(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  const upstreamPath = "/" + path.join("/");

  // Preserve query string
  const search = req.nextUrl.search;
  const upstreamUrl = `${RUNTIME_API_URL}${upstreamPath}${search}`;

  // Forward relevant headers, strip Next.js / host specifics
  const reqContentType = req.headers.get("Content-Type") ?? "";

  const forwarded = new Headers(Object.entries(buildRuntimeHeaders(session)));

  const init: RequestInit = {
    method: req.method,
    headers: forwarded,
    cache: "no-store",
  };

  // Pass body for mutating methods
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (reqContentType.startsWith("multipart/form-data")) {
      // Convert multipart file upload to base64 JSON so the runtime can handle
      // it without a multipart parser. The "file" field is extracted and encoded.
      const formData = await req.formData();
      const file = formData.get("file");
      if (file instanceof File) {
        const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
        if (file.size > MAX_BYTES) {
          return NextResponse.json({ error: "File too large (max 50 MB)" }, { status: 413 });
        }
        const bytes = await file.arrayBuffer();
        const base64 = Buffer.from(bytes).toString("base64");
        forwarded.set("Content-Type", "application/json");
        init.body = JSON.stringify({
          filename:     file.name,
          content_type: file.type || "application/octet-stream",
          size_bytes:   file.size,
          data_base64:  base64,
        });
      } else {
        // No file field — forward empty JSON
        forwarded.set("Content-Type", "application/json");
        init.body = "{}";
      }
    } else {
      forwarded.set("Content-Type", reqContentType || "application/json");
      init.body = await req.text();
    }
  }

  try {
    const upstream = await fetch(upstreamUrl, init);

    // 204 No Content — return as-is
    if (upstream.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const contentType = upstream.headers.get("Content-Type") ?? "application/json";

    // Use arrayBuffer for all response bodies — preserves binary content (file downloads)
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: upstream.status,
      headers: { "Content-Type": contentType },
    });
  } catch (err) {
    console.error("[relay] upstream error", err);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}

export const GET = relay;
export const POST = relay;
export const PUT = relay;
export const PATCH = relay;
export const DELETE = relay;
