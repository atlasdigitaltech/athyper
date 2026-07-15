"use client";

import { AttachmentsPanel } from "./attachments-panel";
import { CommentsPanel } from "./comments-panel";
import { EventsPanel } from "./events-panel";
import {
  EntityContextDrawer,
  type EntityContextDrawerAttachmentSummary,
  type RuntimeContextDrawerEntity,
} from "./runtime-context-drawer";
import {
  AuditSummaryStrip,
  resolveAuditSummaryData,
} from "../header/audit-summary-strip";

export interface ContextDrawerHostProps {
  entity: RuntimeContextDrawerEntity;
  entityCode: string;
  recordId: string;
  /** Canonical record UUID. When `null`, panels do not mount. */
  recordUuid: string | null;
  recordData: Record<string, unknown>;
  activePanel: string | null;
  onClose: () => void;
  typeLabel?: string;
  identityName?: string | null;
  commentsCount: number;
  attachmentsSummary: EntityContextDrawerAttachmentSummary;
  onCommentsCountChange: (count: number | null) => void;
  /** Drawer width persistence scope. Defaults to `"neon-entity"`. */
  widthScope?: string;
}

/**
 * Drawer host shared by record + document workspaces. Mounts the
 * `EntityContextDrawer` shell and the three content panels (comments,
 * attachments, activity). All data (counts, active panel, close handler)
 * is supplied by `useContextDrawer`; this component is pure presentation.
 */
export function ContextDrawerHost({
  entity,
  entityCode,
  recordId,
  recordUuid,
  recordData,
  activePanel,
  onClose,
  typeLabel,
  identityName,
  commentsCount,
  attachmentsSummary,
  onCommentsCountChange,
  widthScope = "neon-entity",
}: ContextDrawerHostProps) {
  const auditSummary = resolveAuditSummaryData({ record: recordData, recordId });

  return (
    <EntityContextDrawer
      open={activePanel !== null && recordUuid !== null}
      onOpenChange={(open) => { if (!open) onClose(); }}
      activePanel={activePanel}
      widthScope={widthScope}
      entity={entity}
      recordId={recordId}
      recordData={recordData}
      typeLabel={typeLabel}
      identityName={identityName}
      panelCount={activePanel === "comments" ? commentsCount : null}
      attachments={attachmentsSummary}
    >
      <div className="px-6 py-5">
        {activePanel === "comments" && recordUuid && (
          <CommentsPanel
            entityCode={entityCode}
            recordId={recordId}
            recordUuid={recordUuid}
            onCountChange={onCommentsCountChange}
          />
        )}
        {activePanel === "attachments" && recordUuid && (
          <AttachmentsPanel
            entityCode={entityCode}
            recordId={recordId}
            recordUuid={recordUuid}
          />
        )}
        {activePanel === "activity" && recordUuid && (
          <div className="flex flex-col gap-4">
            <AuditSummaryStrip
              {...auditSummary}
              title={`${entity.entity_name} Audit Summary`}
            />
            <EventsPanel
              entityCode={entityCode}
              recordId={recordId}
              recordUuid={recordUuid}
            />
          </div>
        )}
      </div>
    </EntityContextDrawer>
  );
}
