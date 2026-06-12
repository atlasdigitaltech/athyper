import { RuntimeDetailPage } from "@athyper/runtime-canvas";
import { getMetaEntityProcessRuntimeState } from "@/lib/server/meta-entity-process-state";
import { getMetaEntityRecordDetail, normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { PLANE_KEY } from "@/lib/plane";
import DocumentObjectPageClient from "./DocumentObjectPageClient";

/**
 * Generic view route — branches on `descriptor.renderer`:
 *   - `"document"` → scroll-synchronized DocumentObjectPageWorkspace in
 *     read-only mode. The chrome's Edit action navigates to `/edit`,
 *     where the same workspace renders with `autoEnterEdit=true`.
 *   - everything else → classic RuntimeDetailPage (master / ledger / simple)
 *
 * Matching the edit route's branch keeps both modes on the same shell, which
 * eliminates the old two-level tab confusion (outer process tabs + inner
 * surface tabs) for document entities.
 */
export default async function RuntimeDetailRoute({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  const { entity, id } = await params;
  const recordId = normalizeRouteRecordId(id);
  const descriptor = await getMetaEntityRuntimeDescriptor(entity);
  const detail = await getMetaEntityRecordDetail(entity, recordId, descriptor);

  // Document branch — render the object-page workspace in view mode.
  if (descriptor?.renderer === "document" && detail.record) {
    const processState = await getMetaEntityProcessRuntimeState(
      entity,
      recordId,
      descriptor,
      detail.record,
    );
    const recordUuid =
      typeof detail.record.id === "string" && detail.record.id.length > 0
        ? detail.record.id
        : recordId;
    return (
      <DocumentObjectPageClient
        entityCode={entity}
        recordId={recordId}
        recordUuid={recordUuid}
        descriptor={descriptor}
        record={detail.record}
        processState={processState ?? undefined}
      />
    );
  }

  // Classic branch — master / ledger / simple.
  const processState = await getMetaEntityProcessRuntimeState(
    entity,
    recordId,
    descriptor,
    detail.record,
  );
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
