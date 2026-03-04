import { getSessionId } from "@neon/auth/session";
import * as contentService from "@neon/content/server";
import { NextResponse } from "next/server";

/**
 * DELETE /api/content/delete/[id]
 *
 * Delete attachment - removes from S3 and database.
 *
 * Flow:
 * 1. Validate session
 * 2. Extract attachment ID from path
 * 3. Check permissions (TODO)
 * 4. Call runtime API to delete from S3 + database
 * 5. Return success
 *
 * CSRF-protected via middleware.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    // const canDelete = await checkPermission(sid, tenantId, "document.delete", { attachmentId });
    // if (!canDelete) {
    //   return NextResponse.json(
    //     { success: false, error: { code: "PERMISSION_DENIED", message: "Insufficient permissions" } },
    //     { status: 403 }
    //   );
    // }

    await contentService.deleteFile(attachmentId, tenantId, sid);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("File deletion error:", err);

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
