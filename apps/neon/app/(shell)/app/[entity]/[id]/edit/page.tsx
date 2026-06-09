import { RuntimeEditPage } from "@athyper/runtime-canvas";
import { getMetaEntityRecordDetail, normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { PLANE_KEY } from "@/lib/plane";

export default async function RuntimeEditRoute({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  const recordId = normalizeRouteRecordId(id);
  const descriptor = await getMetaEntityRuntimeDescriptor(entity);
  const detail = await getMetaEntityRecordDetail(entity, recordId, descriptor);

  return (
    <RuntimeEditPage
      plane={PLANE_KEY}
      entity={entity}
      id={recordId}
      descriptor={descriptor}
      record={detail.record}
      detailState={detail.state}
    />
  );
}
