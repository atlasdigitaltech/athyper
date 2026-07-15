"use client";

import { CommentList } from "@athyper/collaboration-ui/comments";

export interface CommentsPanelProps {
  entityCode: string;
  recordId: string;
  /** UUID of the record — required for master entities whose recordId is a string code. */
  recordUuid?: string;
  onCountChange?: (count: number) => void;
  searchOpen?: boolean;
  showFilters?: boolean;
}

export function CommentsPanel({ entityCode, recordId, recordUuid, onCountChange, searchOpen, showFilters }: CommentsPanelProps) {
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
