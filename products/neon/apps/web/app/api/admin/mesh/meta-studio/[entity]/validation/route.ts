import "server-only";

import { NextResponse } from "next/server";

import { hasDirectDb, getValidationDirect } from "../../db";
import {
  requireAdminSession,
  parseJsonBody,
  validateBody,
  proxyGet,
  proxyMutate,
} from "../../helpers";
import { saveValidationRulesSchema, testValidationSchema } from "../../schemas";

import type { NextRequest } from "next/server";

/**
 * GET /api/admin/mesh/meta-studio/[entity]/validation
 *
 * Fetch validation rules for an entity.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await params;

  if (hasDirectDb()) {
    try {
      const result = await getValidationDirect(entity);
      return NextResponse.json(result);
    } catch (err) {
      console.error("[meta-studio] Direct DB get validation failed:", err);
      return NextResponse.json(
        { success: false, error: { code: "DB_ERROR", message: String(err) } },
        { status: 500 },
      );
    }
  }

  return proxyGet(
    auth,
    `/api/meta/entities/${encodeURIComponent(entity)}/validation`,
  );
}

/**
 * POST /api/admin/mesh/meta-studio/[entity]/validation
 *
 * Supports two operations via `action` field:
 * - action: "save" — Save validation rules
 * - action: "test" — Test rules against a payload
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const { entity } = await params;

  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as Record<string, unknown>;
  const action = body.action;

  if (action === "test") {
    // Test mode: validate payload against rules without saving
    const validated = validateBody(body, testValidationSchema);
    if (!validated.ok) return validated.response;

    return proxyMutate(
      auth,
      `/api/meta/entities/${encodeURIComponent(entity)}/validation/test`,
      "POST",
      validated.data,
    );
  }

  // Default: save validation rules
  const validated = validateBody(body, saveValidationRulesSchema);
  if (!validated.ok) return validated.response;

  const ifMatch = request.headers.get("If-Match");

  return proxyMutate(
    auth,
    `/api/meta/entities/${encodeURIComponent(entity)}/validation`,
    "POST",
    validated.data,
    { ifMatch },
  );
}
