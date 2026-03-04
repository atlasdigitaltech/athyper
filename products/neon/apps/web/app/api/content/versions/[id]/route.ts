import { getSessionId } from "@neon/auth/session";
import * as versionService from "@neon/content/server";
import { NextResponse } from "next/server";

/**
 * GET /api/content/versions/[id]
 *
 * Get version history for a document.
 *
 * Flow:
 * 1. Validate session
 * 2. Extract document ID from path
 * 3. Call runtime API to get version history
 * 4. Return list of all versions with current version highlighted
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
  const documentId = id;

  try {
    const result = await versionService.getVersionHistory(documentId, tenantId);

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error("Get version history error:", err);

    if (err.message.includes("not found")) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Document not found" },
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
