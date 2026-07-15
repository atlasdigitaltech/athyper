"use client";

import { useEffect } from "react";
import type { EntityEditState } from "./types";

export interface EditKeyboardShortcutsOptions {
  editState: EntityEditState | undefined;
  guardModalOpen: boolean;
  onEscape: () => void;
}

export function useEditKeyboardShortcuts({
  editState,
  guardModalOpen,
  onEscape,
}: EditKeyboardShortcutsOptions) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;

      const isSave = (event.metaKey || event.ctrlKey) && event.key === "s";
      if (isSave) {
        event.preventDefault();
        if (editState?.isDirty && !editState.isSaving) {
          void editState.save();
        }
        return;
      }

      if (event.key === "Escape" && editState?.isDirty && !guardModalOpen) {
        event.preventDefault();
        onEscape();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editState, guardModalOpen, onEscape]);
}

function isTypingTarget(element: Element | null): boolean {
  if (!element) return false;
  const tag = (element as HTMLElement).tagName;
  return tag === "INPUT"
    || tag === "TEXTAREA"
    || tag === "SELECT"
    || (element as HTMLElement).isContentEditable;
}
