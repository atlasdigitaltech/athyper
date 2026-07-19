import { NextResponse } from "next/server";
import { getMetaEntityProcessRuntimeState } from "@/lib/server/meta-entity-process-state";
import { getMetaEntityRecordDetail, normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { resolveEffectiveRecordWorkspaceManifestFromLoaded } from "@/lib/server/record-workspace-manifest";
import { getNeonServerSession } from "@/lib/server/session";
import { loadSnapshotChildContracts } from "@/lib/server/snapshot-child-contracts";

/** Lazy descriptor projection for Versions/Compare snapshot child graphs. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to load snapshot metadata." },
      { status: 401 },
    );
  }

  const { entity, id } = await params;
  const entityCode = entity.trim().replace(/-/g, "_");
  const recordId = normalizeRouteRecordId(id);
  const descriptor = await getMetaEntityRuntimeDescriptor(entityCode);
  if (!descriptor) {
    return NextResponse.json(
      { error: "ENTITY_NOT_FOUND", message: "The entity runtime contract is unavailable." },
      { status: 404 },
    );
  }
  if (!descriptor.capabilities.canRead) {
    return NextResponse.json(
      { error: "READ_NOT_ALLOWED", message: "This entity is not readable in the active runtime contract." },
      { status: 403 },
    );
  }

  const detail = await getMetaEntityRecordDetail(entityCode, recordId, descriptor);
  if (!detail.record) {
    return NextResponse.json(
      { error: "RECORD_NOT_FOUND", message: detail.state.message ?? "Record was not found." },
      { status: 404 },
    );
  }
  const processState = await getMetaEntityProcessRuntimeState(
    entityCode,
    recordId,
    descriptor,
    detail.record,
  );
  const { manifest } = resolveEffectiveRecordWorkspaceManifestFromLoaded({
    descriptor,
    recordId,
    record: detail.record,
    processState,
    session,
  });
  if (!manifest.resources.some((resource) => resource.key === "snapshots")) {
    return NextResponse.json(
      { error: "SNAPSHOTS_NOT_AVAILABLE", message: "Versions are not available for this record." },
      { status: 404 },
    );
  }

  const data = await loadSnapshotChildContracts(descriptor);
  return NextResponse.json(
    { ok: true, data },
    { headers: { "Cache-Control": "private, max-age=30" } },
  );
}
