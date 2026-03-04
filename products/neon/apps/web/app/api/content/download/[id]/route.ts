import { getSessionId } from "@neon/auth/session";
import * as contentService from "@neon/content/server";
import { NextResponse } from "next/server";

/**
 * GET /api/content/download/[id]
 *
 * Get presigned download URL for attachment.
 *
 * Flow:
 * 1. Validate session
 * 2. Extract attachment ID from path
 * 3. Check permissions (TODO)
 * 4. Call runtime API to generate presigned URL
 * 5. Return URL + metadata
 *
 * Note: This route generates a presigned URL but doesn't stream the file.
 * Client uses the returned URL to download directly from S3.
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
    // TODO: Check permissions via PolicyGateService
    // const canDownload = await checkPermission(sid, tenantId, "document.read", { attachmentId });
    // if (!canDownload) {
    //   return NextResponse.json(
    //     { success: false, error: { code: "PERMISSION_DENIED", message: "Insufficient permissions" } },
    //     { status: 403 }
    //   );
    // }

    const result = await contentService.getDownloadUrl(attachmentId, tenantId, sid);

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error("Download URL generation error:", err);

    // Map common errors to appropriate status codes
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
