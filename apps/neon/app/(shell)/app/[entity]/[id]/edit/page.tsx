import { RuntimeEditPage } from "@athyper/runtime-canvas";
import { getMetaEntityProcessRuntimeState } from "@/lib/server/meta-entity-process-state";
import { getMetaEntityRecordDetail, normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { PLANE_KEY } from "@/lib/plane";
import DocumentObjectPageClient from "../DocumentObjectPageClient";

/**
 * Generic edit route — branches on `descriptor.renderer`:
 *   - `"document"` → scroll-synchronized DocumentObjectPageWorkspace
 *     (M5: every document entity opts in via this single gate)
 *   - everything else → classic RuntimeEditPage (master / ledger / simple)
 *
 * No per-entity route file needed for document entities — the renderer flag
 * is the system's canonical declaration that an entity is a document, and
 * it's already set by the compiler from `display_config`.
 */
export default async function RuntimeEditRoute({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  const { entity, id } = await params;
  const recordId = normalizeRouteRecordId(id);
  const descriptor = await getMetaEntityRuntimeDescriptor(entity);
  const detail = await getMetaEntityRecordDetail(entity, recordId, descriptor);

  // Document branch — render the object-page workspace.
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
        autoEnterEdit
      />
    );
  }

  // Classic branch — master / ledger / simple, or document without a
  // resolvable record. RuntimeEditPage handles its own unavailable shell.
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
