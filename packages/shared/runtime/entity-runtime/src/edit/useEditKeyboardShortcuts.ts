"use client";

import { useEffect } from "react";
import type { EntityEditState } from "./types";

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

export interface EditKeyboardShortcutsOptions {
  editState: EntityEditState | undefined;
  /** Whether the guard modal is currently open — suppresses the Escape handler to avoid reopening immediately after Radix closes it. */
  guardModalOpen: boolean;
  onEscape: () => void;
}

/**
 * Wires up keyboard shortcuts for the edit workspace:
 *   Cmd/Ctrl+S  → save (only when dirty and not already saving)
 *   Escape      → trigger the navigation guard (only when dirty, modal not open)
 *
 * Both shortcuts are suppressed when focus is inside a text input,
 * textarea, select, or contentEditable element.
 */
export function useEditKeyboardShortcuts({
  editState,
  guardModalOpen,
  onEscape,
}: EditKeyboardShortcutsOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;

      const isSave = (e.metaKey || e.ctrlKey) && e.key === "s";
      const isEscape = e.key === "Escape";

      if (isSave) {
        e.preventDefault();
        if (editState?.isDirty && !editState.isSaving) {
          void editState.save();
        }
        return;
      }

      if (isEscape && editState?.isDirty && !guardModalOpen) {
        e.preventDefault();
        onEscape();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editState, guardModalOpen, onEscape]);
}
