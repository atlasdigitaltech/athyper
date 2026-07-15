import {
  RuntimeDetailPage,
  resolveSnapshotChildEntityCodes,
  type SnapshotChildContracts,
} from "@athyper/runtime-canvas";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import { getMetaEntityProcessRuntimeState } from "@/lib/server/meta-entity-process-state";
import { getMetaEntityRecordDetail, normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { getDocumentEditCoordinatorIdentity } from "@/lib/server/document-edit-coordinator-identity";
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
  const descriptor = await getMetaEntityRuntimeDescriptor(entity, recordId);
  const detail = await getMetaEntityRecordDetail(entity, recordId, descriptor);

  // Document branch — render the object-page workspace in view mode.
  if (descriptor?.renderer === "document" && detail.record) {
    const [processState, snapshotChildContracts, editCoordinatorIdentity] = await Promise.all([
      getMetaEntityProcessRuntimeState(entity, recordId, descriptor, detail.record),
      loadSnapshotChildContracts(descriptor),
      descriptor.editRuntime
        ? getDocumentEditCoordinatorIdentity(detail.record)
        : Promise.resolve(undefined),
    ]);
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
        snapshotChildContracts={snapshotChildContracts}
        editCoordinatorIdentity={editCoordinatorIdentity}
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

/**
 * Prefetch the per-section child descriptors that the snapshot detail and
 * compare drawers consume (Phase 15b — descriptor-aware rendering for
 * lines / components / distributions / schedules).
 *
 * Mechanics:
 *   - Round 1: resolve {lines, components, schedules} child codes from the
 *     parent's has_many relations and fetch their descriptors in parallel.
 *   - Round 2: if a lines descriptor came back, walk *its* relations to
 *     find the accounting_distributions code (distributions live on the
 *     line, not the header) and fetch that one too.
 *
 * Returns a partial map. Any slot whose descriptor is unavailable (entity
 * not registered, fetch returned undefined) is simply omitted — the
 * drawer treats absence as "render this section with raw column names".
 */
async function loadSnapshotChildContracts(
  parent: MetaEntityRuntimeDescriptor,
): Promise<SnapshotChildContracts> {
  const initial = resolveSnapshotChildEntityCodes(parent);

  const [linesContract, componentsContract, schedulesContract] = await Promise.all([
    initial.lines      ? getMetaEntityRuntimeDescriptor(initial.lines)      : Promise.resolve(undefined),
    initial.components ? getMetaEntityRuntimeDescriptor(initial.components) : Promise.resolve(undefined),
    initial.schedules  ? getMetaEntityRuntimeDescriptor(initial.schedules)  : Promise.resolve(undefined),
  ]);

  const out: SnapshotChildContracts = {};
  if (linesContract)      out.lines      = linesContract;
  if (componentsContract) out.components = componentsContract;
  if (schedulesContract)  out.schedules  = schedulesContract;

  // Distributions live on the line — second hop, only meaningful when the
  // lines descriptor is in hand.
  if (linesContract) {
    const second = resolveSnapshotChildEntityCodes(parent, linesContract);
    if (second.distributions && second.distributions !== initial.distributions) {
      const distContract = await getMetaEntityRuntimeDescriptor(second.distributions);
      if (distContract) out.distributions = distContract;
    }
  }
  return out;
}
