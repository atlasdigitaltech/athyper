import { NextResponse } from "next/server";
import { getMetaEntityProcessRuntimeState } from "@/lib/server/meta-entity-process-state";
import { getMetaEntityRecordDetail, normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const { entity, id } = await params;
  const recordId = normalizeRouteRecordId(id);
  const descriptor = await getMetaEntityRuntimeDescriptor(entity);
  if (!descriptor) {
    return NextResponse.json(
      { error: "ENTITY_NOT_FOUND", message: "This Neon route is not registered for the tenant control plane." },
      { status: 404 },
    );
  }

  if (!descriptor.capabilities.canRead) {
    return NextResponse.json(
      { error: "READ_NOT_ALLOWED", message: "This entity is not readable in the active runtime contract." },
      { status: 403 },
    );
  }

  const detail = await getMetaEntityRecordDetail(entity, recordId, descriptor);
  if (detail.state.status === "unavailable" || !detail.record) {
    return NextResponse.json(
      { error: "RECORD_NOT_FOUND", message: detail.state.message ?? "Record was not found in the active organization scope." },
      { status: 404 },
    );
  }

  const processState = await getMetaEntityProcessRuntimeState(entity, recordId, descriptor, detail.record);
  return NextResponse.json(
    { ok: true, processState },
    { headers: { "Cache-Control": "no-store" } },
  );
}
