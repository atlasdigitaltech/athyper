"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlatformPanelIcon } from "../header";
import type { EntityContextDrawerAttachmentSummary } from "./runtime-context-drawer";

export interface UseContextDrawerInput {
  entityCode: string;
  /** Route/document identifier used for cache-key namespacing only. */
  recordId: string;
  /** Canonical record UUID used by collab/attachments APIs. `null` disables queries. */
  recordUuid: string | null;
  /** Chrome-provided icon model; `undefined` when the record isn't resolved. */
  platformIcons: PlatformPanelIcon[] | undefined;
}

export interface UseContextDrawerReturn {
  activePanel: string | null;
  activePlatformIcon: string | undefined;
  enrichedPlatformIcons: PlatformPanelIcon[] | undefined;
  onPlatformIconClick: (panelId: string) => void;
  close: () => void;
  commentsCount: number;
  attachmentsSummary: EntityContextDrawerAttachmentSummary;
  onCommentsCountChange: (count: number | null) => void;
  onAttachmentsSummaryChange: (summary: EntityContextDrawerAttachmentSummary | null) => void;
}

/**
 * Owns the context-drawer behaviour shared by record + document workspaces:
 * the active-panel toggle, comments + attachments count queries, and the
 * icon-model enrichment that drives badge counts in the header chrome.
 *
 * Print is intentionally NOT handled here. `RuntimeRecordChrome` already
 * intercepts `panelId === "print"` and routes it to its `onPrint` prop
 * before delegating to the consumer-supplied `onPlatformIconClick`, so the
 * hook only ever sees `comments | attachments | activity`.
 */
export function useContextDrawer({
  entityCode,
  recordId: _recordId,
  recordUuid,
  platformIcons,
}: UseContextDrawerInput): UseContextDrawerReturn {
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [commentsPanelCount, setCommentsPanelCount] = useState<number | null>(null);
  const [attachmentsPanelSummary, setAttachmentsPanelSummary] = useState<EntityContextDrawerAttachmentSummary | null>(null);

  useEffect(() => {
    setCommentsPanelCount(null);
    setAttachmentsPanelSummary(null);
  }, [entityCode, recordUuid]);

  const hasResolvedRecord = recordUuid !== null;
  const attachmentsSummary = attachmentsPanelSummary ?? EMPTY_ATTACHMENT_SUMMARY;
  const commentsCount = commentsPanelCount ?? 0;

  const enrichedPlatformIcons = useMemo(() => {
    if (!hasResolvedRecord) return undefined;
    return platformIcons?.map((icon) => {
      if (icon.id === "comments") {
        return {
          ...icon,
          count: commentsCount > 0 ? commentsCount : undefined,
          countPending: activePanel === "comments" && commentsPanelCount === null,
        };
      }
      if (icon.id === "attachments") {
        return {
          ...icon,
          count: attachmentsSummary.count > 0 ? attachmentsSummary.count : undefined,
          countPending: activePanel === "attachments" && attachmentsPanelSummary === null,
        };
      }
      return icon;
    });
  }, [
    activePanel,
    attachmentsPanelSummary,
    attachmentsSummary.count,
    commentsCount,
    commentsPanelCount,
    hasResolvedRecord,
    platformIcons,
  ]);

  const onPlatformIconClick = useCallback(
    (panelId: string) => {
      if (!hasResolvedRecord) return;
      setActivePanel((current) => (current === panelId ? null : panelId));
    },
    [hasResolvedRecord],
  );

  const close = useCallback(() => setActivePanel(null), []);

  return {
    activePanel,
    activePlatformIcon: activePanel ?? undefined,
    enrichedPlatformIcons,
    onPlatformIconClick,
    close,
    commentsCount,
    attachmentsSummary,
    onCommentsCountChange: setCommentsPanelCount,
    onAttachmentsSummaryChange: setAttachmentsPanelSummary,
  };
}

const EMPTY_ATTACHMENT_SUMMARY: EntityContextDrawerAttachmentSummary = {
  count: 0,
  totalBytes: 0,
  internalCount: 0,
  sharedCount: 0,
  quarantinedCount: 0,
};
