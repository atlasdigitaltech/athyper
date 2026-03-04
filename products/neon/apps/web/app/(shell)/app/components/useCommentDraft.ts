import { useEffect, useRef, useCallback } from "react";

/**
 * Comment Draft Hook Options
 */
interface UseCommentDraftOptions {
  entityType: string;
  entityId: string;
  parentCommentId?: string;
  enabled?: boolean;
  autoSaveDelay?: number; // milliseconds
}

/**
 * Comment Draft Hook
 *
 * Provides auto-save functionality for comment drafts.
 * - Auto-saves after user stops typing (debounced)
 * - Loads existing draft on mount
 * - Clears draft after successful submit
 */
export function useCommentDraft(
  text: string,
  setText: (text: string) => void,
  visibility: 'public' | 'internal' | 'private',
  options: UseCommentDraftOptions
) {
  const {
    entityType,
    entityId,
    parentCommentId,
    enabled = true,
    autoSaveDelay = 3000,
  } = options;

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedTextRef = useRef<string>("");

  /**
   * Load draft on mount
   */
  useEffect(() => {
    if (!enabled) return;

    const loadDraft = async () => {
      try {
        const params = new URLSearchParams({
          entityType,
          entityId,
          ...(parentCommentId && { parentCommentId }),
        });

        const res = await fetch(`/api/collab/drafts?${params}`, {
          credentials: "same-origin",
        });

        if (res.ok) {
          const data = await res.json();
          if (data.data && data.data.draftText) {
            setText(data.data.draftText);
            lastSavedTextRef.current = data.data.draftText;
          }
        }
      } catch (err) {
        console.error("Failed to load draft:", err);
      }
    };

    loadDraft();
  }, [enabled, entityType, entityId, parentCommentId, setText]);

  /**
   * Auto-save draft when text changes (debounced)
   */
  useEffect(() => {
    if (!enabled || text === lastSavedTextRef.current || !text.trim()) {
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch("/api/collab/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            entityType,
            entityId,
            parentCommentId,
            draftText: text,
            visibility,
          }),
        });

        lastSavedTextRef.current = text;
      } catch (err) {
        console.error("Failed to save draft:", err);
      }
    }, autoSaveDelay);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [enabled, text, visibility, entityType, entityId, parentCommentId, autoSaveDelay]);

  /**
   * Clear draft
   */
  const clearDraft = useCallback(async () => {
    if (!enabled) return;

    try {
      const params = new URLSearchParams({
        entityType,
        entityId,
        ...(parentCommentId && { parentCommentId }),
      });

      await fetch(`/api/collab/drafts?${params}`, {
        method: "DELETE",
        credentials: "same-origin",
      });

      lastSavedTextRef.current = "";
    } catch (err) {
      console.error("Failed to clear draft:", err);
    }
  }, [enabled, entityType, entityId, parentCommentId]);

  return { clearDraft };
}
