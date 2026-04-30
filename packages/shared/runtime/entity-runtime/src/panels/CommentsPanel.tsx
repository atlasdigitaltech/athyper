"use client";

import { CommentList } from "@athyper/collaboration-ui/comments";

export interface CommentsPanelProps {
  entityCode: string;
  recordId: string;
  onCountChange?: (count: number) => void;
}

export function CommentsPanel({ entityCode, recordId, onCountChange }: CommentsPanelProps) {
  return <CommentList entityType={entityCode} entityId={recordId} onCountChange={onCountChange} />;
}
