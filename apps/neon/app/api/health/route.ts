// GET /api/health — liveness probe. Returns 200 with the plane key when session-plane config loads cleanly; a misconfigured PLANE_KEY surfaces as 500.
import { NextResponse } from "next/server";
import { getPlaneConfig } from "@athyper/platform-iam-session-plane";
import { PLANE_KEY } from "@/lib/plane";
import { documentEditDraftRecoveryStatus } from "@/lib/server/document-edit-runtime-drafts";

export function GET() {
  const plane = getPlaneConfig(PLANE_KEY);
  return NextResponse.json({
    ok: true,
    plane: plane.key,
    documentEditDraftRecovery: documentEditDraftRecoveryStatus(),
  });
}
