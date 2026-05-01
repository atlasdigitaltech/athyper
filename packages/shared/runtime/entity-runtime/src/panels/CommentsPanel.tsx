"use client";

import { CommentList } from "@athyper/collaboration-ui/comments";

export interface CommentsPanelProps {
  entityCode: string;
  recordId: string;
  onCountChange?: (count: number) => void;
  searchOpen?: boolean;
  showFilters?: boolean;
}

export function CommentsPanel({ entityCode, recordId, onCountChange, searchOpen, showFilters }: CommentsPanelProps) {
  return (
    <CommentList
      entityType={entityCode}
      entityId={recordId}
      onCountChange={onCountChange}
      searchOpen={searchOpen}
      showFilters={showFilters}
    />
  );
}
