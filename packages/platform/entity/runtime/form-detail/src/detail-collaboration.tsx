"use client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRecordCollaboration } from "./record/use-record-collaboration";
import { entityRuntimeClient, type EntityRuntimeSectionResource } from "@athyper/platform-entity-descriptor-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { Button } from "@athyper/platform-ui";
import { EntityCollaborationSurface } from "./collaboration-surface";
import type { ActivityPresentation } from "./activity-comparison-model";
import { ActivityWorkspace } from "./activity-workspace";
import { CompiledEntitySectionContent } from "./compiled-section-content";
import { mergeSectionPages } from "./use-section-resource";

type Kind = "comments" | "attachments";
/** A record/identity-keyed instance; no data or in-flight requests survive a
 * tenant, principal, auth epoch or record switch. Capability reads reauthorize. */
export interface DetailCollaborationNavigation {
  readonly surface: ReactNode;
  readonly sections: readonly { key: string; label: string }[];
  readonly active: string;
  readonly full: boolean;
  readonly open: (key: string) => void;
  readonly showRecord: (updateLocation?: (url: URL) => void) => void;
}
export function DetailCollaboration({ entityCode, recordId, kinds: collaborationKinds, activity = false, fieldLabels, activityPresentation, recordTitle, entityLabel, renderRecord }: { entityCode: string; recordId: string; kinds: readonly Kind[]; activity?: boolean; recordTitle?: string; entityLabel?: string; activityPresentation?: ActivityPresentation; fieldLabels?: Readonly<Record<string,string>>; renderRecord?: (navigation: DetailCollaborationNavigation) => ReactNode }) {
  const kinds: readonly (Kind | "activity")[] = [...collaborationKinds, ...(activity ? ["activity" as const] : [])];
  const intl = useEntityI18n();
  const state = useRecordCollaboration();
  const active = kinds.includes(state.collaborationSection as Kind) ? state.collaborationSection! : kinds[0] ?? "comments";
  const sections = kinds.map(key => ({ key, label: key === "activity" ? intl.message("activity.title") : key === "comments" ? intl.message("collaboration.comments") : intl.message("collaboration.files") }));
  const open = (key: string) => { if (kinds.includes(key as Kind)) state.setCollaborationTab(key); };
  const showRecord = (updateLocation?: (url: URL) => void) => state.setCollaborationPanel(false, active, updateLocation);
  const surface = kinds.length ? <EntityCollaborationSurface recordContext={{label:recordTitle ?? recordId, detail:entityLabel ?? entityCode}} showFullClose={!renderRecord} open={state.collaborationOpen} activeSectionKey={active} sections={sections} onOpenChange={value => state.setCollaborationPanel(value, active)}
      fullView={state.collaborationFull} onFullViewChange={state.changeCollaborationFull}
      pinned={state.collaborationPinned} onPinnedChange={state.setCollaborationPinned}
      onActiveSectionChange={key => { if (kinds.includes(key as Kind)) state.setCollaborationTab(key); }}
      preloadSection={() => {}} renderSection={key => kinds.includes(key as Kind)
        ? key === "activity" ? <ActivityWorkspace entityCode={entityCode} recordId={recordId} fieldLabels={fieldLabels} metadata={activityPresentation} onExpand={()=>state.changeCollaborationFull(true)} /> : <CapabilityContent key={key} entityCode={entityCode} recordId={recordId} kind={key as Kind} /> : null} /> : null;
  return <>
    {renderRecord ? renderRecord({ sections, active, surface, full: state.collaborationFull && state.collaborationOpen, open, showRecord }) : sections.length ? <nav aria-label={intl.message("collaboration.record")}>{sections.map(section => <Button key={section.key} variant="secondary" onClick={() => open(section.key)}>{section.label}</Button>)}</nav> : null}
    {renderRecord ? null : surface}
  </>;
}

function CapabilityContent({ entityCode, recordId, kind }: { entityCode: string; recordId: string; kind: Kind }) {
  const intl = useEntityI18n();
  const client = useApiClient();
  const [resource, setResource] = useState<EntityRuntimeSectionResource>(), [error, setError] = useState(false), [busy, setBusy] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  const load = async (cursor?: string) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(false);
    // Keep the workspace mounted during refresh so drafts, upload queues and
    // the posted-comment action survive the updated read model.
    try {
      const next = await entityRuntimeClient.collaboration(client, { entityCode, recordId, kind, cursor, signal: controller.signal });
      if (!controller.signal.aborted) setResource(previous => cursor && previous?.releaseHash === next.releaseHash ? mergeSectionPages(previous, next) : next);
    } catch {
      if (!controller.signal.aborted) { setResource(undefined); setError(true); }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  useEffect(() => { setResource(undefined); void load(); return () => request.current?.abort(); }, [client, entityCode, recordId, kind]);
  if (error) return <div role="status">{intl.message("collaboration.unavailable")}<Button onClick={() => void load()}>{intl.message("action.retry")}</Button></div>;
  if (!resource) return <p role="status">{intl.message("collaboration.loading")}</p>;
  return <CompiledEntitySectionContent resource={resource} entityCode={entityCode} recordId={recordId} onChanged={() => void load()}
    onLoadThreadPage={(threadRootId, cursor) => entityRuntimeClient.collaboration(client, { entityCode, recordId, kind, threadRootId, cursor })}
    onLoadMentionsPage={(cursor, signal) => entityRuntimeClient.collaboration(client, { entityCode, recordId, kind, commentFilter: "mentions", cursor, signal })}
    loadingMore={busy} onLoadMore={() => {
      const data = resource.data as { nextCursor?: unknown };
      if (typeof data?.nextCursor === "string") void load(data.nextCursor);
    }} />;
}
