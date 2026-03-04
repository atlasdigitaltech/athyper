"use client";

import { Send, Loader2 } from "lucide-react";
import { useState, useCallback } from "react";

import { FileUpload, type UploadedFile } from "./FileUpload";
import { MentionInput } from "./MentionInput";

import { Button } from "@/components/ui/button";
import { useDraft } from "@/lib/collab";

interface CommentFormProps {
  entityType: string;
  entityId: string;
  parentCommentId?: string;
  onSubmit: (text: string, attachments?: UploadedFile[]) => Promise<void>;
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
  const [files, setFiles] = useState<UploadedFile[]>([]);
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
        await onSubmit(trimmed, files.length > 0 ? files : undefined);
        setText("");
        setFiles([]);
        await deleteDraft();
      } finally {
        setIsSubmitting(false);
      }
    },
    [text, files, onSubmit, deleteDraft],
  );

  const handleFileUpload = useCallback((file: UploadedFile) => {
    setFiles((prev) => [...prev, file]);
  }, []);

  const handleFileRemove = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <MentionInput
        value={text}
        onChange={handleTextChange}
        placeholder={placeholder ?? "Write a comment..."}
        rows={parentCommentId ? 2 : 3}
        disabled={isSubmitting}
        className={autoFocus ? "focus" : undefined}
      />

      <div className="flex items-center justify-between">
        <FileUpload
          files={files}
          onUpload={handleFileUpload}
          onRemove={handleFileRemove}
          disabled={isSubmitting}
        />

        <div className="flex gap-2">
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
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {parentCommentId ? "Reply" : "Comment"}
          </Button>
        </div>
      </div>
    </form>
  );
}
