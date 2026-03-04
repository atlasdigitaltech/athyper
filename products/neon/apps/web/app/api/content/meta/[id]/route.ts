import { getSessionId } from "@neon/auth/session";
import * as contentService from "@neon/content/server";
import { NextResponse } from "next/server";

/**
 * GET /api/content/meta/[id]
 *
 * Get attachment metadata without downloading the file.
 *
 * Flow:
 * 1. Validate session
 * 2. Extract attachment ID from path
 * 3. Call runtime API to get metadata
 * 4. Return metadata (name, size, type, dates, version info)
 *
 * Useful for:
 * - Showing file info before download
 * - Version comparisons
 * - Audit trails
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sid = await getSessionId();
  if (!sid) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Session required" },
      },
      { status: 401 },
    );
  }

  const tenantId = process.env.DEFAULT_TENANT_ID ?? "default";
  const attachmentId = id;

  try {
    // TODO: Check permissions
    // const canRead = await checkPermission(sid, tenantId, "document.read", { attachmentId });

    const result = await contentService.getMetadata(attachmentId, tenantId);

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error("Get metadata error:", err);

    if (err.message.includes("not found")) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Attachment not found" },
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: err.code ?? "INTERNAL_ERROR",
          message: err.message,
        },
      },
      { status: 500 },
    );
  }
}
