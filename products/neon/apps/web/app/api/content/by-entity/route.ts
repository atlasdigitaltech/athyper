import { getSessionId } from "@neon/auth/session";
import * as contentService from "@neon/content/server";
import { NextResponse } from "next/server";

/**
 * GET /api/content/by-entity?entity={type}&id={uuid}
 *
 * List all attachments for a specific entity.
 *
 * Flow:
 * 1. Validate session
 * 2. Extract query parameters (entity, id)
 * 3. Check permissions (TODO)
 * 4. Call runtime API to list attachments
 * 5. Return array of attachment metadata
 *
 * Query params:
 * - entity: Entity type (e.g., "invoice", "customer")
 * - id: Entity ID (UUID)
 */
export async function GET(req: Request) {
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
    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get("entity");
    const entityId = searchParams.get("id");

    if (!entityType || !entityId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required query parameters: entity, id",
          },
        },
        { status: 400 },
      );
    }

    // Validate entityId is UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(entityId)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid entity ID format (must be UUID)",
          },
        },
        { status: 400 },
      );
    }

    // TODO: Check permissions via PolicyGateService
    // const canRead = await checkPermission(sid, tenantId, "document.read", { entityType, entityId });
    // if (!canRead) {
    //   return NextResponse.json(
    //     { success: false, error: { code: "PERMISSION_DENIED", message: "Insufficient permissions" } },
    //     { status: 403 }
    //   );
    // }

    // Gracefully handle missing runtime API (content service may not be running)
    if (!process.env.RUNTIME_API_URL) {
      return NextResponse.json({ success: true, data: [] });
    }

    const attachments = await contentService.listByEntity(tenantId, entityType, entityId);

    return NextResponse.json({ success: true, data: attachments });
  } catch (err: any) {
    // Return empty array when content service is unavailable (graceful degradation)
    const msg = err?.message ?? "";
    if (msg.includes("RUNTIME_API_URL") || msg.includes("Unknown error") || msg.includes("fetch failed")) {
      console.warn("[GET /api/content/by-entity] Content service unavailable, returning empty:", msg);
      return NextResponse.json({ success: true, data: [] });
    }
    console.error("List attachments error:", err);
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
