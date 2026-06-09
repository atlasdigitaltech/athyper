import type { PlaneKey } from "@athyper/session-plane";
import { getPlaneConfig } from "@athyper/session-plane";
import type { DocumentEnvelopeStatus, DocumentType } from "@athyper/mesh-exchange-contracts";
import { MetricStrip, PageFrame, PanelGrid, StatePanel, ToolbarButton, WorkPanel } from "@athyper/surface-kit";

type MeshPageProps = {
  plane: PlaneKey;
};

type PathPageProps = MeshPageProps & {
  path?: readonly string[];
};

const exchangeMetrics = [
  { label: "Active connections", value: "0", tone: "neutral" as const },
  { label: "Inbound envelopes", value: "0", tone: "neutral" as const },
  { label: "Awaiting ack", value: "0", tone: "warn" as const },
  { label: "Failed today", value: "0", tone: "critical" as const },
];

const documentStates: readonly DocumentEnvelopeStatus[] = [
  "received",
  "validated",
  "accepted",
  "rejected",
  "routed",
  "failed",
  "archived",
];

const documentTypes: readonly DocumentType[] = [
  "purchase_order",
  "invoice",
  "credit_note",
  "debit_note",
  "remittance_advice",
  "acknowledgement",
];

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (part) => part.toUpperCase());
}

function planeEyebrow(plane: PlaneKey): string {
  return getPlaneConfig(plane).appName;
}

export function MeshDashboardPage({ plane }: MeshPageProps) {
  return (
    <PageFrame
      eyebrow={planeEyebrow(plane)}
      title="Exchange dashboard"
      description="Buyer and partner document exchange status across Mesh network accounts."
      actions={<ToolbarButton href="/app/document_envelope">Open envelopes</ToolbarButton>}
    >
      <MetricStrip metrics={exchangeMetrics} />
      <PanelGrid>
        <WorkPanel title="Network accounts" description="BNA buyer and supplier addresses visible to this principal." />
        <WorkPanel title="Connections" description="Active buyer-supplier links and pending handshakes." />
        <WorkPanel title="Routing health" description="Envelope validation, acknowledgement, and routing status." />
      </PanelGrid>
    </PageFrame>
  );
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

export function MeshExchangeListPage({ plane, entity }: MeshPageProps & { entity: string }) {
  const normalized = entity.replaceAll("-", "_");
  const title = normalized === "document_envelope" ? "Document envelopes" : titleCase(normalized);
  const isDocumentSurface = normalized === "document_envelope" || normalized === "network_connection" || normalized === "network_account";
  return (
    <PageFrame
      eyebrow={planeEyebrow(plane)}
      title={title}
      description={isDocumentSurface ? "Mesh-owned exchange records from the separate network database." : "Mesh exchange surface."}
      actions={<ToolbarButton href="/dashboard">Dashboard</ToolbarButton>}
    >
      <PanelGrid>
        <WorkPanel title="Statuses" description={documentStates.map(titleCase).join(", ")} />
        <WorkPanel title="Document types" description={documentTypes.map(titleCase).join(", ")} />
        <WorkPanel title="Boundary" description="This app reads Mesh exchange state and does not expose Neon ERP runtime entities." />
      </PanelGrid>
    </PageFrame>
  );
}

export function MeshExchangeDetailPage({ plane, entity, id }: MeshPageProps & { entity: string; id: string }) {
  return (
    <PageFrame
      eyebrow={planeEyebrow(plane)}
      title={`${titleCase(entity)} ${id}`}
      description="Envelope, connection, event, and payload metadata for a Mesh-owned exchange record."
    >
      <PanelGrid>
        <WorkPanel title="Envelope" description="Header, routing, idempotency, and payload references." />
        <WorkPanel title="Events" description="Received, validated, accepted, rejected, routed, and acknowledgement events." />
        <WorkPanel title="Connection" description="Buyer and supplier BNA account relationship used for this exchange." />
      </PanelGrid>
    </PageFrame>
  );
}
