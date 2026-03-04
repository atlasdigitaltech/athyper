import { getSessionId } from "@neon/auth/session";
import * as versionService from "@neon/content/server";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Validation schema for version restore request
 */
const RestoreSchema = z.object({
  documentId: z.string().uuid(),
  versionNo: z.number().int().positive(),
});

/**
 * POST /api/content/version/restore
 *
 * Restore a previous version as the current version.
 *
 * Flow:
 * 1. Validate session
 * 2. Validate documentId + versionNo
 * 3. Call runtime API to create new version (copy of specified version)
 * 4. Return new current version metadata
 *
 * CSRF-protected via middleware.
 */
export async function POST(req: Request) {
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

  try {
    const body = await req.json();
    const parsed = RestoreSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request",
            fieldErrors: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 },
      );
    }

    const { documentId, versionNo } = parsed.data;

    // TODO: Check permissions
    // const canVersion = await checkPermission(sid, tenantId, "document.version.create", { documentId });

    const result = await versionService.restoreVersion({
      documentId,
      versionNo,
      tenantId,
      actorId: sid,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error("Version restore error:", err);

    if (err.message.includes("not found")) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Version not found" },
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
