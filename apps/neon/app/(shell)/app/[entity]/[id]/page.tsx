import { RuntimeDetailPage } from "@athyper/runtime-canvas";
import { getMetaEntityProcessRuntimeState } from "@/lib/server/meta-entity-process-state";
import { getMetaEntityRecordDetail, normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { PLANE_KEY } from "@/lib/plane";

export default async function RuntimeDetailRoute({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  const recordId = normalizeRouteRecordId(id);
  const descriptor = await getMetaEntityRuntimeDescriptor(entity);
  const detail = await getMetaEntityRecordDetail(entity, recordId, descriptor);
  const processState = await getMetaEntityProcessRuntimeState(entity, recordId, descriptor, detail.record);

  return (
    <RuntimeDetailPage
      plane={PLANE_KEY}
      entity={entity}
      id={recordId}
      descriptor={descriptor}
      record={detail.record}
      processState={processState ?? undefined}
      detailState={detail.state}
    />
  );
}
