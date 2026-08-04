import type { PlaneKey } from "@athyper/session-plane";
import { getPlaneConfig } from "@athyper/session-plane";
import { PageFrame, PanelGrid, StatePanel, WorkPanel } from "@athyper/surface-kit";

type MeshPageProps = {
  plane: PlaneKey;
};

type PathPageProps = MeshPageProps & {
  path?: readonly string[];
};

function planeEyebrow(plane: PlaneKey): string {
  return getPlaneConfig(plane).appName;
}

export function MeshWorkbenchPage({ plane, path }: PathPageProps) {
  return (
    <PageFrame
      eyebrow={planeEyebrow(plane)}
      title="Exchange workbench"
      description={path?.length ? path.join(" / ") : "Operational queues for connection and document exchange work."}
    >
      <PanelGrid>
        <WorkPanel title="Inbox" description="Inbound envelopes awaiting validation, acknowledgement, or rejection." />
        <WorkPanel title="Outbox" description="Outbound envelopes queued for partner delivery." />
        <WorkPanel title="Exceptions" description="Failed or rejected exchange events that need action." />
      </PanelGrid>
    </PageFrame>
  );
}

export function MeshInboxPage({ plane }: MeshPageProps) {
  return (
    <PageFrame eyebrow={planeEyebrow(plane)} title="Inbox" description="Inbound partner and buyer exchange work.">
      <PanelGrid>
        <WorkPanel title="Received" description="New envelopes received from connected accounts." />
        <WorkPanel title="Acknowledgements" description="Documents awaiting accept, reject, or route decisions." />
        <WorkPanel title="Dead letter" description="Messages that failed validation or routing." />
      </PanelGrid>
    </PageFrame>
  );
}

export function MeshGovernancePage({ plane, path }: PathPageProps) {
  return (
    <PageFrame
      eyebrow={planeEyebrow(plane)}
      title="Connection governance"
      description={path?.length ? path.join(" / ") : "Network connection capability, policy, and partner onboarding controls."}
    >
      <PanelGrid>
        <WorkPanel title="Capabilities" description="Allowed document types, delivery modes, and acknowledgement rules." />
        <WorkPanel title="Connections" description="Buyer-supplier link lifecycle and approval status." />
        <WorkPanel title="Audit" description="Immutable exchange and connection event trail." />
      </PanelGrid>
    </PageFrame>
  );
}

export function MeshContentPage({ plane }: MeshPageProps) {
  return (
    <PageFrame eyebrow={planeEyebrow(plane)} title="Exchange content">
      <StatePanel title="No content selected" message="Select a document envelope to inspect payload metadata and attachments." />
    </PageFrame>
  );
}

export function MeshSettingsPage({ plane, path }: PathPageProps) {
  return (
    <PageFrame
      eyebrow={planeEyebrow(plane)}
      title="Settings"
      description={path?.length ? path.join(" / ") : "Mesh account preferences, delivery endpoints, and notification settings."}
    />
  );
}

export function MeshSavedViewsPage({ plane }: MeshPageProps) {
  return (
    <PageFrame eyebrow={planeEyebrow(plane)} title="Saved views" description="Personal views for Mesh connection and envelope queues." />
  );
}

export function MeshNotificationsPage({ plane }: MeshPageProps) {
  return (
    <PageFrame eyebrow={planeEyebrow(plane)} title="Notifications" description="Mesh delivery, acknowledgement, and exception notifications." />
  );
}
