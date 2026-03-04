/**
 * Content Upload API
 *
 * POST /api/content/upload - Upload a file to object storage
 */

import { getSessionId } from "@neon/auth/session";
import { NextResponse } from "next/server";

import type { NextRequest} from "next/server";

/**
 * POST /api/content/upload
 *
 * Upload a file and create an attachment record.
 *
 * FormData fields:
 * - file: File (required)
 * - kind: string (required) - Document kind (attachment, avatar, etc.)
 * - ownerEntity: string (optional)
 * - ownerEntityId: string (optional)
 */
export async function POST(req: NextRequest) {
  // Authenticate
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const kind = formData.get("kind") as string | null;
    const ownerEntity = formData.get("ownerEntity") as string | null;
    const ownerEntityId = formData.get("ownerEntityId") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "Missing required field: file" },
        { status: 400 }
      );
    }

    if (!kind) {
      return NextResponse.json(
        { error: "Missing required field: kind" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Prepare multipart form data for backend
    const backendFormData = new FormData();
    backendFormData.append("file", new Blob([buffer], { type: file.type }), file.name);
    backendFormData.append("kind", kind);
    if (ownerEntity) backendFormData.append("ownerEntity", ownerEntity);
    if (ownerEntityId) backendFormData.append("ownerEntityId", ownerEntityId);

    // Call backend service
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";
    const response = await fetch(`${backendUrl}/api/content/upload`, {
      method: "POST",
      headers: {
        Cookie: req.headers.get("cookie") || "",
        "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
      },
      body: backendFormData,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Upload error:", error);
      return NextResponse.json(
        { error: "Failed to upload file", details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("Upload route error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: String(err) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/content/upload/:id/download
 *
 * Get a presigned download URL for an attachment.
 */
export async function GET(req: NextRequest) {
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing required parameter: id" },
        { status: 400 }
      );
    }

    // Call backend service
    const backendUrl = process.env.API_MESH_URL || "http://localhost:3000";
    const response = await fetch(
      `${backendUrl}/api/content/download/${id}`,
      {
        headers: {
          Cookie: req.headers.get("cookie") || "",
          "x-tenant-id": process.env.DEFAULT_TENANT_ID || "default",
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: "Failed to get download URL", details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Download URL route error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: String(err) },
      { status: 500 }
    );
  }
}
