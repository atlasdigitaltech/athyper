"use server";

/**
 * BFF relay — comment attachment upload
 *
 * Accepts multipart/form-data with a single file field ("file").
 * Converts the file to base64 JSON and forwards to
 * POST /api/collab/attachments on the backend runtime.
 *
 * Response mirrors the backend: { attachment_id, file_name, content_type, size_bytes }
 */

import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

const MAX_BYTES = 100 * 1024 * 1024; // 100 MiB hard cap at BFF layer

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "ATTACHMENT_SIZE_EXCEEDED", message: `File exceeds 100 MB limit` },
      { status: 413 },
    );
  }

  // Convert to base64 for the backend JSON handler
  const arrayBuffer = await file.arrayBuffer();
  const base64      = Buffer.from(arrayBuffer).toString("base64");

  const payload = {
    filename:     file.name,
    content_type: file.type || "application/octet-stream",
    size_bytes:   file.size,
    data_base64:  base64,
  };

  const headers = new Headers(Object.entries(buildRuntimeHeaders(session)));
  headers.set("Content-Type", "application/json");

  try {
    const upstream = await fetch(`${RUNTIME_API_URL}/api/collab/attachments`, {
      method:  "POST",
      headers,
      body:    JSON.stringify(payload),
      cache:   "no-store",
    });

    const body = await upstream.json();
    return NextResponse.json(body, { status: upstream.status });
  } catch (err) {
    console.error("[collab/attachments] upstream error", err);
    return NextResponse.json({ error: "Bad Gateway" }, { status: 502 });
  }
}

