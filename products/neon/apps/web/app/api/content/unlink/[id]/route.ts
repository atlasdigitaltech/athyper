import { getSessionId } from "@neon/auth/session";
import * as linkService from "@neon/content/server";
import { NextResponse } from "next/server";

/**
 * DELETE /api/content/unlink/[id]
 *
 * Remove link between document and entity.
 *
 * Flow:
 * 1. Validate session
 * 2. Extract link ID from path
 * 3. Call runtime API to delete link
 * 4. Return success
 *
 * CSRF-protected via middleware.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const linkId = id;

  try {
    // TODO: Check permissions
    // const canUnlink = await checkPermission(sid, tenantId, "document.link.manage");

    await linkService.unlinkDocument(linkId, tenantId, sid);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Unlink error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const code = (err as Record<string, unknown>)?.code;

    if (message.includes("not found")) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Link not found" },
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: code ?? "INTERNAL_ERROR",
          message,
        },
      },
      { status: 500 },
    );
  }
}
