"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PlatformPanelIcon } from "../header";
import type { EntityContextDrawerAttachmentSummary } from "./runtime-context-drawer";

interface CommentsCountResponse {
  data?: unknown[];
  count?: number;
}

interface AttachmentSummaryItem {
  size_bytes?: number;
  visibility?: string | null;
  scan_status?: string | null;
  status?: string | null;
}

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

  const hasResolvedRecord = recordUuid !== null;
  const enabledPanelIds = useMemo(
    () => new Set(hasResolvedRecord ? (platformIcons ?? []).map((icon) => icon.id) : []),
    [hasResolvedRecord, platformIcons],
  );

  const commentsCountQuery = useQuery<number>({
    queryKey: ["collab-comments", entityCode, recordUuid],
    queryFn: async ({ signal }) => {
      if (!recordUuid) return 0;
      const params = new URLSearchParams({
        entityType: entityCode,
        entityId: recordUuid,
        limit: "200",
      });
      const res = await fetch(`/api/collab/comments?${params}`, {
        signal,
        cache: "no-store",
      });
      if (!res.ok) return 0;
      const body = await res.json().catch(() => null) as CommentsCountResponse | null;
      if (typeof body?.count === "number") return body.count;
      return Array.isArray(body?.data) ? body.data.length : 0;
    },
    staleTime: 30_000,
    enabled: hasResolvedRecord && enabledPanelIds.has("comments") && activePanel === "comments",
  });

  const attachmentsQuery = useQuery<AttachmentSummaryItem[]>({
    queryKey: ["attachments", entityCode, recordUuid],
    queryFn: async ({ signal }) => {
      if (!recordUuid) return [];
      const res = await fetch(
        `/api/relay/api/documents/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordUuid)}/attachments`,
        { signal, cache: "no-store" },
      );
      if (!res.ok) return [];
      const body = await res.json().catch(() => []);
      return Array.isArray(body) ? body as AttachmentSummaryItem[] : [];
    },
    staleTime: 30_000,
    enabled: hasResolvedRecord && enabledPanelIds.has("attachments") && activePanel === "attachments",
  });

  const attachmentsSummary = useMemo(
    () => summarizeAttachments(attachmentsQuery.data ?? []),
    [attachmentsQuery.data],
  );

  const commentsCount = commentsPanelCount ?? commentsCountQuery.data ?? 0;

  const enrichedPlatformIcons = useMemo(() => {
    if (!hasResolvedRecord) return undefined;
    return platformIcons?.map((icon) => {
      if (icon.id === "comments") {
        return {
          ...icon,
          count: commentsCount > 0 ? commentsCount : undefined,
          countPending: commentsCountQuery.isLoading,
        };
      }
      if (icon.id === "attachments") {
        return {
          ...icon,
          count: attachmentsSummary.count > 0 ? attachmentsSummary.count : undefined,
          countPending: attachmentsQuery.isLoading,
        };
      }
      return icon;
    });
  }, [
    attachmentsQuery.isLoading,
    attachmentsSummary.count,
    commentsCount,
    commentsCountQuery.isLoading,
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
  };
}

function summarizeAttachments(items: AttachmentSummaryItem[]): EntityContextDrawerAttachmentSummary {
  return items.reduce<EntityContextDrawerAttachmentSummary>((summary, item) => {
    const size = typeof item.size_bytes === "number" ? item.size_bytes : 0;
    const visibility = item.visibility ?? "internal";
    const isQuarantined = item.scan_status === "quarantined" || item.status === "quarantined";

    summary.count += 1;
    summary.totalBytes += Number.isFinite(size) ? size : 0;
    if (visibility === "shared_with_supplier") summary.sharedCount += 1;
    else summary.internalCount += 1;
    if (isQuarantined) summary.quarantinedCount += 1;

    return summary;
  }, {
    count: 0,
    totalBytes: 0,
    internalCount: 0,
    sharedCount: 0,
    quarantinedCount: 0,
  });
}
