"use client";

/**
 * useCommentAttachments
 *
 * Manages the lifecycle of files staged for attachment to a comment:
 *   1. User picks / drops files → addFiles()
 *   2. Each file is uploaded to /api/collab/attachments (BFF multipart)
 *   3. On success: StagedAttachment.status = 'done', attachmentId populated
 *   4. On failure: status = 'error', retryable via retry()
 *   5. On form submit: caller reads attachmentIds (only 'done' ones)
 *   6. After submit: call reset() to clear
 */

import { useState, useCallback } from "react";
import { getCsrfToken } from "../utils/csrf";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StagedStatus = "uploading" | "done" | "error";

export interface StagedAttachment {
  /** Stable local key (not the server attachment_id) */
  key:          string;
  file:         File;
  progress:     number;   // 0–100
  status:       StagedStatus;
  attachmentId: string | null;
  errorMessage: string | null;
}

export interface UseCommentAttachmentsResult {
  staged:        StagedAttachment[];
  /** UUIDs of successfully uploaded attachments — safe to submit */
  attachmentIds: string[];
  /** True while any attachment is still uploading */
  isUploading:   boolean;
  addFiles:      (files: FileList | File[]) => void;
  remove:        (key: string) => void;
  retry:         (key: string) => void;
  reset:         () => void;
}

// ── Max files per comment (spec §8) ──────────────────────────────────────────

const MAX_FILES = 10;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCommentAttachments(): UseCommentAttachmentsResult {
  const [staged, setStaged] = useState<StagedAttachment[]>([]);

  const uploadFile = useCallback(async (entry: StagedAttachment): Promise<void> => {
    const form = new FormData();
    form.append("file", entry.file);

    setStaged((prev) =>
      prev.map((s) => s.key === entry.key ? { ...s, status: "uploading", progress: 10, errorMessage: null } : s),
    );

    try {
      const res = await fetch("/api/collab/attachments", {
        method:  "POST",
        headers: { "X-CSRF-Token": getCsrfToken() },
        body:    form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((body.message as string) ?? `Upload failed (${res.status})`);
      }

      const data = await res.json() as { attachment_id: string };

      setStaged((prev) =>
        prev.map((s) =>
          s.key === entry.key
            ? { ...s, status: "done", progress: 100, attachmentId: data.attachment_id }
            : s,
        ),
      );
    } catch (err) {
      setStaged((prev) =>
        prev.map((s) =>
          s.key === entry.key
            ? { ...s, status: "error", progress: 0, errorMessage: String(err) }
            : s,
        ),
      );
    }
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArr = Array.from(files);

      // Build entries OUTSIDE the setState updater. React Strict Mode double-invokes
      // updater functions to surface side effects — putting uploadFile inside the
      // updater (even via setTimeout) caused two S3 uploads per file in dev.
      const allNew: StagedAttachment[] = fileArr.map((file) => ({
        key:          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        progress:     0,
        status:       "uploading" as StagedStatus,
        attachmentId: null,
        errorMessage: null,
      }));

      if (allNew.length === 0) return;

      setStaged((prev) => {
        const available = MAX_FILES - prev.length;
        if (available <= 0) return prev;
        return [...prev, ...allNew.slice(0, available)];
      });

      // Trigger uploads once, outside the updater — safe from Strict Mode double-invoke.
      allNew.forEach((entry) => void uploadFile(entry));
    },
    [uploadFile],
  );

  const remove = useCallback((key: string) => {
    setStaged((prev) => prev.filter((s) => s.key !== key));
  }, []);

  const retry = useCallback(
    (key: string) => {
      setStaged((prev) => {
        const entry = prev.find((s) => s.key === key);
        if (!entry || entry.status !== "error") return prev;
        void uploadFile(entry);
        return prev.map((s) =>
          s.key === key ? { ...s, status: "uploading", progress: 10, errorMessage: null } : s,
        );
      });
    },
    [uploadFile],
  );

  const reset = useCallback(() => setStaged([]), []);

  const attachmentIds = staged
    .filter((s) => s.status === "done" && s.attachmentId)
    .map((s) => s.attachmentId!);

  const isUploading = staged.some((s) => s.status === "uploading");

  return { staged, attachmentIds, isUploading, addFiles, remove, retry, reset };
}

// ── useCommentAttachmentList (render-side: fetch attachments for a comment) ──

export interface CommentAttachmentItem {
  attachmentId: string;
  fileName:     string;
  contentType:  string;
  sizeBytes:    number;
  downloadUrl:  string;
}

export function useCommentAttachmentList(commentId: string): {
  items:     CommentAttachmentItem[];
  isLoading: boolean;
} {
  const [items,     setItems]     = useState<CommentAttachmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetched,   setFetched]   = useState(false);

  // Lazy fetch on first render
  if (!fetched && commentId) {
    setFetched(true);
    setIsLoading(true);
    fetch(`/api/collab/comments/${commentId}/attachments`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((body: { data?: CommentAttachmentItem[] }) => {
        setItems(body.data ?? []);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }

  return { items, isLoading };
}
