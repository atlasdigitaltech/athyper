import { getSessionId } from "@neon/auth/session";
import * as aclService from "@neon/content/server";
import { NextResponse } from "next/server";

/**
 * GET /api/content/acl/[id]
 *
 * List all ACL entries for a document.
 *
 * Returns array of ACL entries showing who has what permissions.
 */
export async function GET(
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
  const attachmentId = id;

  try {
    // TODO: Check permissions
    // const canViewAcl = await checkPermission(sid, tenantId, "document.read", { attachmentId });

    const result = await aclService.listDocumentAcls(attachmentId, tenantId);

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    console.error("List ACL error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const code = (err as Record<string, unknown>)?.code;

    if (message.includes("not found")) {
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
          code: code ?? "INTERNAL_ERROR",
          message,
        },
      },
      { status: 500 },
    );
  }
}
