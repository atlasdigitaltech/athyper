import { getSessionId } from "@neon/auth/session";
import * as aclService from "@neon/content/server";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Validation schema for ACL grant
 */
const GrantAclSchema = z.object({
  attachmentId: z.string().uuid(),
  principalId: z.string().uuid().optional(),
  roleId: z.string().uuid().optional(),
  permission: z.enum(["read", "download", "delete", "share"]),
  granted: z.boolean().default(true),
  expiresAt: z.string().datetime().optional(),
});

/**
 * POST /api/content/acl/grant
 *
 * Grant or revoke per-document permission.
 *
 * Flow:
 * 1. Validate session
 * 2. Validate request (must have principalId XOR roleId)
 * 3. Check actor has permission to manage ACLs
 * 4. Call runtime API to create ACL entry
 * 5. Return created ACL
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
    const parsed = GrantAclSchema.safeParse(body);

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

    // Validate exactly one of principalId or roleId
    if (!parsed.data.principalId && !parsed.data.roleId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Must specify either principalId or roleId",
          },
        },
        { status: 400 },
      );
    }

    if (parsed.data.principalId && parsed.data.roleId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Cannot specify both principalId and roleId",
          },
        },
        { status: 400 },
      );
    }

    // TODO: Check permissions
    // const canManageAcl = await checkPermission(sid, tenantId, "document.acl.manage");

    const result = await aclService.grantPermission({
      ...parsed.data,
      tenantId,
      actorId: sid,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error("Grant ACL error:", err);
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
