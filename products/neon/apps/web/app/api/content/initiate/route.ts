import { getSessionId } from "@neon/auth/session";
import * as contentService from "@neon/content/server";
import { NextResponse } from "next/server";
import { z } from "zod";


/**
 * Validation schema for upload initiation request
 */
const InitiateSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  kind: z.enum([
    "attachment",
    "generated",
    "export",
    "template",
    "letterhead",
    "avatar",
    "signature",
    "certificate",
    "invoice",
    "receipt",
    "contract",
    "report",
  ]),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().positive(),
});

/**
 * POST /api/content/initiate
 *
 * Initiate file upload - validate request, generate presigned URL.
 *
 * Flow:
 * 1. Validate session
 * 2. Validate request body (Zod)
 * 3. Call runtime API to create pending attachment + presigned URL
 * 4. Return uploadId, presignedUrl, expiresAt
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
    const parsed = InitiateSchema.safeParse(body);

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

    const { entityType, entityId, kind, fileName, contentType, sizeBytes } = parsed.data;

    // TODO: Check permissions via PolicyGateService
    // const canUpload = await checkPermission(sid, tenantId, "document.upload", { entityType, entityId, kind });
    // if (!canUpload) {
    //   return NextResponse.json(
    //     { success: false, error: { code: "PERMISSION_DENIED", message: "Insufficient permissions" } },
    //     { status: 403 }
    //   );
    // }

    const result = await contentService.initiateUpload({
      tenantId,
      entityType,
      entityId,
      kind,
      fileName,
      contentType,
      sizeBytes,
      actorId: sid, // TODO: Replace with actual user ID from session
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error("Upload initiation error:", err);
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
