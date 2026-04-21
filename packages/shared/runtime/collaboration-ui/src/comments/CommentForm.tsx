"use client";

/**
 * CommentForm — Text input for new comments and replies.
 *
 * Auto-saves drafts (2-second debounce via useDraft).
 * Restores draft text on mount if a draft exists.
 */

import { useState, useCallback, useRef } from "react";
import { Send, Loader2, Paperclip } from "lucide-react";

import { Button } from "@athyper/ui/primitives";
import { useDraft } from "../hooks/collab";
import { useCommentAttachments } from "../hooks/attachments";
import { StagedAttachmentChip } from "../attachments/AttachmentChip";

import { MentionInput } from "./MentionInput";

export interface CommentFormProps {
  entityType: string;
  entityId: string;
  parentCommentId?: string;
  onSubmit: (text: string, attachmentIds: string[]) => Promise<void>;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { staged, attachmentIds, isUploading, addFiles, remove, retry, reset } =
    useCommentAttachments();

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
      if (!trimmed && attachmentIds.length === 0) return;

      setIsSubmitting(true);
      try {
        await onSubmit(trimmed, attachmentIds);
        setText("");
        deleteDraft();
        reset();
      } finally {
        setIsSubmitting(false);
      }
    },
    [text, attachmentIds, onSubmit, deleteDraft, reset],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(e.target.files);
      e.target.value = "";
    },
    [addFiles],
  );

  const canSubmit = (text.trim().length > 0 || attachmentIds.length > 0) && !isUploading;

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <MentionInput
        value={text}
        onChange={handleTextChange}
        placeholder={placeholder ?? "Write a comment…"}
        rows={parentCommentId ? 2 : 3}
        disabled={isSubmitting}
        className={autoFocus ? "focus" : undefined}
      />

      {staged.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {staged.map((item) => (
            <StagedAttachmentChip
              key={item.key}
              item={item}
              onRemove={remove}
              onRetry={retry}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSubmitting}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          title="Attach files"
        >
          <Paperclip className="size-4" />
        </button>

        <div className="flex items-center gap-2">
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
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 size-4" />
            )}
            {parentCommentId ? "Reply" : "Comment"}
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
        accept="image/*,application/pdf,.xlsx,.xls,.csv,.docx,.doc,.txt,.zip"
      />
    </form>
  );
}
