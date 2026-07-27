import { HydrationBoundary } from "@tanstack/react-query";
import {
  RuntimeDetailPage,
  resolveRuntimeObjectPageRenderer,
} from "@athyper/runtime-canvas";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import { normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { loadRecordWorkspaceBootstrap } from "@/lib/server/record-workspace-bootstrap";
import {
  logRuntimeRecordDiagnosticSnapshot,
  RuntimeRecordDiagnosticCollector,
} from "@/lib/server/runtime-record-observability";
import { PLANE_KEY } from "@/lib/plane";
import { getNeonServerSession } from "@/lib/server/session";
import { resolveFxRateTenantCode } from "@/lib/server/fx-rate-runtime-context";
import DocumentObjectPageClient from "./DocumentObjectPageClient";
import { FxRateLineagePanel } from "../FxRateLineagePanel";
import { AtlasEntityContextBinding } from "./AtlasEntityContextBinding";

/**
 * Generic record route. The server bootstrap owns descriptor, record,
 * process-state and effective-manifest resolution for both renderer families,
 * then dehydrates those values under the canonical workspace query keys.
 */
export default async function RuntimeDetailRoute({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  const routeStartedAt = performance.now();
  const { entity, id } = await params;
  const recordId = normalizeRouteRecordId(id);
  const diagnostics = new RuntimeRecordDiagnosticCollector({ entityCode: entity, recordId });
  const bootstrap = await loadRecordWorkspaceBootstrap(entity, recordId, { diagnostics });
  const descriptor = bootstrap.descriptor;
  const record = bootstrap.record;

  logRuntimeRecordDiagnosticSnapshot(diagnostics.snapshot({
    totalMs: performance.now() - routeStartedAt,
    renderer: descriptor?.renderer ?? "unknown",
    capabilities: descriptor ? observableCapabilities(descriptor) : {},
  }));

  if (descriptor && resolveRuntimeObjectPageRenderer(descriptor) === "document" && record) {
    const recordUuid = typeof record.id === "string" && record.id.length > 0
      ? record.id
      : recordId;
    return (
      <HydrationBoundary state={bootstrap.dehydratedState}>
        <AtlasEntityContextBinding entityType={entity} entityId={recordId} />
        <DocumentObjectPageClient
          entityCode={entity}
          recordId={recordId}
          recordUuid={recordUuid}
          descriptor={descriptor}
          record={record}
          processState={bootstrap.processState ?? undefined}
          workspaceManifest={bootstrap.manifest}
          editCoordinatorIdentity={bootstrap.optional.ready.editCoordinatorIdentity}
        />
      </HydrationBoundary>
    );
  }

  const runtimePage=(
    <HydrationBoundary state={bootstrap.dehydratedState}>
      <AtlasEntityContextBinding entityType={entity} entityId={recordId} />
      <RuntimeDetailPage
        plane={PLANE_KEY}
        entity={entity}
        id={recordId}
        descriptor={descriptor}
        record={record}
        processState={bootstrap.processState ?? undefined}
        workspaceManifest={bootstrap.manifest}
        detailState={bootstrap.detailState}
      />
    </HydrationBoundary>
  );
  if(entity==="fx_rate"){
    const session=await getNeonServerSession();
    const tenantCode=session?resolveFxRateTenantCode(session):null;
    return (
      <div className="flex h-full flex-col gap-3">
        {tenantCode?<FxRateLineagePanel tenantCode={tenantCode} rateId={recordId}/>:null}
        <div className="min-h-0 flex-1">{runtimePage}</div>
      </div>
    );
  }
  return runtimePage;
}

function observableCapabilities(descriptor: MetaEntityRuntimeDescriptor): Record<string, boolean> {
  return {
    approvals: descriptor.capabilities.hasWorkflow,
    lifecycle: descriptor.capabilities.hasLifecycle,
    collections: descriptor.capabilities.hasLineItems || descriptor.capabilities.hasChildRecords,
    snapshots: descriptor.capabilities.hasVersions,
    comments: descriptor.capabilities.hasComments,
    attachments: descriptor.capabilities.hasAttachments,
    activity: descriptor.capabilities.hasActivityLog,
  };
}
