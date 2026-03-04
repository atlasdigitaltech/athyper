import { getSessionId } from "@neon/auth/session";
import * as linkService from "@neon/content/server";
import { NextResponse } from "next/server";
import { z } from "zod";


/**
 * Validation schema for link creation
 */
const LinkSchema = z.object({
  attachmentId: z.string().uuid(),
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  linkKind: z.enum(["primary", "related", "supporting", "compliance", "audit"]).default("related"),
  displayOrder: z.number().int().nonnegative().optional(),
});

/**
 * POST /api/content/link
 *
 * Link a document to an entity.
 *
 * Flow:
 * 1. Validate session
 * 2. Validate request body
 * 3. Call runtime API to create link
 * 4. Return created link
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
    const parsed = LinkSchema.safeParse(body);

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

    // TODO: Check permissions
    // const canLink = await checkPermission(sid, tenantId, "document.link.manage");

    const result = await linkService.linkDocumentToEntity({
      ...parsed.data,
      tenantId,
      actorId: sid,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error("Link creation error:", err);
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
