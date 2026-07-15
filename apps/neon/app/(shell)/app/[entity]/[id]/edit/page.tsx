import { RuntimeEditPage } from "@athyper/runtime-canvas";
import { notFound } from "next/navigation";
import { getMetaEntityRecordDetail, normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { getDocumentEditCoordinatorIdentity } from "@/lib/server/document-edit-coordinator-identity";
import { resolveMetaEntityEditRoute } from "@/lib/server/meta-entity-edit-routing";
import { PLANE_KEY } from "@/lib/plane";
import { DocumentEditBootstrapClient } from "../DocumentObjectPageClient";

/**
 * Generic edit route — branches on `descriptor.renderer`:
 *   - `"document"` → scroll-synchronized DocumentObjectPageWorkspace
 *     (M5: every document entity opts in via this single gate)
 *   - `"master"` / `"simple"` → classic RuntimeEditPage
 *   - `"ledger"` or read-only → no edit renderer
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
  const descriptor = await getMetaEntityRuntimeDescriptor(entity, recordId);
  const routeDecision = resolveMetaEntityEditRoute(descriptor);

  // Document branch — render the object-page workspace. A document must never
  // silently fall back to classic record PATCH when its compiled edit runtime
  // is missing; that would bypass aggregate validation and atomic child saves.
  if (routeDecision.kind === "configuration_error") {
      return (
        <main className="flex min-h-[40vh] items-center justify-center px-6 text-sm text-destructive">
          This document is missing its compiled edit runtime. Editing is disabled until metadata is rebuilt.
        </main>
      );
  }
  if (routeDecision.kind === "document") {
    const editCoordinatorIdentity = await getDocumentEditCoordinatorIdentity();
    if (!editCoordinatorIdentity) {
      return <main className="p-6 text-sm text-destructive">The document editor is unavailable for this session.</main>;
    }
    return (
      <DocumentEditBootstrapClient
        entityCode={entity}
        recordId={recordId}
        identity={editCoordinatorIdentity}
      />
    );
  }

  // Ledger/log entities are immutable by definition. Fail closed at the route
  // boundary rather than mounting a disabled mutation form.
  if (routeDecision.kind === "reject") notFound();

  // Classic branch — master / simple. RuntimeEditPage handles its own
  // unavailable shell when the descriptor or record cannot be resolved.
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
