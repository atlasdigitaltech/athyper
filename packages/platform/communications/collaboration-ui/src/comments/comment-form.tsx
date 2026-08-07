"use client";

import type { JSONContent } from "@tiptap/core";
import { RichCommentComposer } from "./rich-comment-composer";

export interface CommentFormProps {
  entityType: string;
  entityId: string;
  parentCommentId?: string;
  onSubmit: (
    text: string,
    attachmentIds: string[],
    contentJson?: JSONContent,
    contentHtml?: string,
    visibility?: string,
  ) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function CommentForm(props: CommentFormProps) {
  return <RichCommentComposer {...props} />;
}
