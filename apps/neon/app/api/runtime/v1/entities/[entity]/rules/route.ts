import { NextResponse } from "next/server";
import { loadDocumentRuleProjection } from "@/lib/server/document-open-projections";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { getNeonServerSession } from "@/lib/server/session";
import { recordDocumentEditMetric } from "@/lib/server/document-edit-observability";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const { entity } = await params;
  const entityCode = entity.trim().replace(/-/g, "_");
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to load rules." },
      { status: 401 },
    );
  }
  const descriptor = await getMetaEntityRuntimeDescriptor(entityCode);
  if (!descriptor) {
    return NextResponse.json(
      { error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not registered for the active plane.` },
      { status: 404 },
    );
  }
  try {
    const startedAt = performance.now();
    const body = await loadDocumentRuleProjection({ session, entityCode, signal: request.signal });
    recordDocumentEditMetric({
      event: "workspace_compatibility_fetch",
      entityCode,
      tenantId: session.activeOrg ? session.organizations?.[session.activeOrg]?.tenantId : undefined,
      outcome: "success",
      reason: "rules_fetch",
      durationMs: performance.now() - startedAt,
    });
    return NextResponse.json(body, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 502;
    recordDocumentEditMetric({
      event: "workspace_compatibility_fetch",
      entityCode,
      tenantId: session.activeOrg ? session.organizations?.[session.activeOrg]?.tenantId : undefined,
      outcome: "failure",
      statusCode: status,
      reason: "rules_fetch",
    });
    return NextResponse.json(
      { error: "RULES_UPSTREAM_ERROR", message: error instanceof Error ? error.message : "Rules upstream failed." },
      { status },
    );
  }
}
