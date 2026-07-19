import { HydrationBoundary } from "@tanstack/react-query";
import { RuntimeDetailPage } from "@athyper/runtime-canvas";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import { normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { loadRecordWorkspaceBootstrap } from "@/lib/server/record-workspace-bootstrap";
import {
  logRuntimeRecordDiagnosticSnapshot,
  RuntimeRecordDiagnosticCollector,
} from "@/lib/server/runtime-record-observability";
import { PLANE_KEY } from "@/lib/plane";
import DocumentObjectPageClient from "./DocumentObjectPageClient";

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

  if (descriptor?.renderer === "document" && record) {
    const recordUuid = typeof record.id === "string" && record.id.length > 0
      ? record.id
      : recordId;
    return (
      <HydrationBoundary state={bootstrap.dehydratedState}>
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

  return (
    <HydrationBoundary state={bootstrap.dehydratedState}>
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
