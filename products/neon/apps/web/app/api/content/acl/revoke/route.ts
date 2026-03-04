import { getSessionId } from "@neon/auth/session";
import * as aclService from "@neon/content/server";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Validation schema for ACL revoke
 */
const RevokeAclSchema = z.object({
  attachmentId: z.string().uuid(),
  principalId: z.string().uuid(),
});

/**
 * POST /api/content/acl/revoke
 *
 * Revoke all permissions for a principal on a document.
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
    const parsed = RevokeAclSchema.safeParse(body);

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
    // const canManageAcl = await checkPermission(sid, tenantId, "document.acl.manage");

    await aclService.revokePermissions(
      parsed.data.attachmentId,
      parsed.data.principalId,
      tenantId,
      sid,
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Revoke ACL error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const code = (err as Record<string, unknown>)?.code;
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
