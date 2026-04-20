"use client";

import { CommentList } from "@athyper/collaboration-ui/comments";

export interface CommentsPanelProps {
  entityCode: string;
  recordId: string;
}

export function CommentsPanel({ entityCode, recordId }: CommentsPanelProps) {
  return <CommentList entityType={entityCode} entityId={recordId} />;
}
