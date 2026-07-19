import { NextResponse } from "next/server";
import {
  isRecordWorkspaceDiagnosticsAdministrator,
  loadEffectiveRecordWorkspaceManifest,
} from "@/lib/server/record-workspace-manifest";
import { getNeonServerSession } from "@/lib/server/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const session = await getNeonServerSession();
  if (!session) {
    return json(
      { error: "UNAUTHENTICATED", message: "Sign in again to inspect workspace diagnostics." },
      401,
    );
  }
  if (!isRecordWorkspaceDiagnosticsAdministrator(session)) {
    return json(
      { error: "ADMIN_REQUIRED", message: "Workspace manifest diagnostics require administrator access." },
      403,
    );
  }

  const { entity, id } = await params;
  const result = await loadEffectiveRecordWorkspaceManifest(entity, id, session);
  if (!result.ok) {
    return json({ error: result.error, message: result.message }, result.status);
  }

  return json({
    ok: true,
    entityCode: result.descriptor.entityCode,
    renderer: result.descriptor.renderer,
    capabilities: result.descriptor.capabilities,
    definition: result.descriptor.recordWorkspace,
    manifest: result.resolution.manifest,
    diagnostics: result.resolution.diagnostics,
  }, 200);
}

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
