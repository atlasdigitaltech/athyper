"use client";

import { CommentList, type CommentsPage } from "@athyper/collaboration-ui";
import { useRecordWorkspaceComments } from "../record-query";

export interface CommentsPanelProps {
  entityCode: string;
  recordId: string;
  recordUuid?: string;
  onCountChange?: (count: number) => void;
  searchOpen?: boolean;
  showFilters?: boolean;
}

export function CommentsPanel({
  entityCode,
  recordId,
  recordUuid,
  onCountChange,
  searchOpen,
  showFilters,
}: CommentsPanelProps) {
  const comments = useRecordWorkspaceComments<CommentsPage>({
    params: { limit: 50, offset: 0 },
  });

  return (
    <CommentList
      entityType={entityCode}
      entityId={recordUuid ?? recordId}
      onCountChange={onCountChange}
      searchOpen={searchOpen}
      showFilters={showFilters}
      page={comments.data}
      pageLoading={comments.isLoading}
      pageError={comments.error}
      onRefresh={() => comments.refetch()}
    />
  );
}
