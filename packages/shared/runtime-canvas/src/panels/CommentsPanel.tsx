"use client";

import { CommentList } from "@athyper/collaboration-ui";

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
  return (
    <CommentList
      entityType={entityCode}
      entityId={recordUuid ?? recordId}
      onCountChange={onCountChange}
      searchOpen={searchOpen}
      showFilters={showFilters}
    />
  );
}
