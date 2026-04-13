"use client";

/**
 * CommentForm — Text input for new comments and replies.
 *
 * Auto-saves drafts (2-second debounce via useDraft).
 * Restores draft text on mount if a draft exists.
 */

import { useState, useCallback } from "react";
import { Send, Loader2 } from "lucide-react";

import { Button } from "@athyper/ui/primitives";
import { useDraft } from "../hooks/collab";

import { MentionInput } from "./MentionInput";

export interface CommentFormProps {
  entityType: string;
  entityId: string;
  parentCommentId?: string;
  onSubmit: (text: string) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function CommentForm({
  entityType,
  entityId,
  parentCommentId,
  onSubmit,
  onCancel,
  placeholder,
  autoFocus,
}: CommentFormProps) {
  const { draft, saveDraft, deleteDraft } = useDraft(
    entityType,
    entityId,
    parentCommentId,
  );

  const [text, setText] = useState(draft?.draftText ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTextChange = useCallback(
    (value: string) => {
      setText(value);
      saveDraft(value);
    },
    [saveDraft],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = text.trim();
      if (!trimmed) return;

      setIsSubmitting(true);
      try {
        await onSubmit(trimmed);
        setText("");
        deleteDraft();
      } finally {
        setIsSubmitting(false);
      }
    },
    [text, onSubmit, deleteDraft],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <MentionInput
        value={text}
        onChange={handleTextChange}
        placeholder={placeholder ?? "Write a comment…"}
        rows={parentCommentId ? 2 : 3}
        disabled={isSubmitting}
        className={autoFocus ? "focus" : undefined}
      />

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !text.trim()}
        >
          {isSubmitting ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 size-4" />
          )}
          {parentCommentId ? "Reply" : "Comment"}
        </Button>
      </div>
    </form>
  );
}
