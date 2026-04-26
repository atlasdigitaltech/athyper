"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { EditGuardContext } from "./EditGuardContext";
import { EditGuardModal } from "./EditGuardModal";
import { useBeforeUnload } from "./useBeforeUnload";
import { useEditKeyboardShortcuts } from "./useEditKeyboardShortcuts";
import type { EntityEditState } from "./types";

export interface EntityWorkspaceShellProps {
  /**
   * The current edit state provided by the page.
   * Pass `undefined` for view-only pages — shell becomes a transparent wrapper.
   */
  editState: EntityEditState | undefined;
  children: ReactNode;
}

/**
 * Wraps an entity detail/edit page with:
 *   - EditGuardContext (guardNavigate)
 *   - beforeunload prompt when dirty
 *   - Cmd/Ctrl+S keyboard shortcut to save
 *   - Escape keyboard shortcut to open guard modal when dirty
 *   - EditGuardModal ("Stay" | "Discard" | "Save and leave")
 *
 * The page owns the save/discard logic via the `editState` prop.
 * Consumers call `const { guardNavigate } = useEntityEdit()` to
 * wrap any in-page navigation (back arrow, entity chip, cancel button, tabs).
 */
export function EntityWorkspaceShell({
  editState,
  children,
}: EntityWorkspaceShellProps) {
  const isDirty = editState?.isDirty ?? false;

  // Browser unload guard
  useBeforeUnload(isDirty);

  // Pending navigation function stored while modal is open
  const pendingNavRef = useRef<(() => void) | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const openModal = useCallback(() => setModalOpen(true), []);

  const guardNavigate = useCallback(
    (fn: () => void) => {
      if (!isDirty) {
        fn();
        return;
      }
      pendingNavRef.current = fn;
      setModalOpen(true);
    },
    [isDirty],
  );

  // Keyboard shortcuts: Cmd/Ctrl+S and Escape
  useEditKeyboardShortcuts({ editState, guardModalOpen: modalOpen, onEscape: openModal });

  const handleStay = useCallback(() => {
    setModalOpen(false);
    pendingNavRef.current = null;
  }, []);

  const handleLeave = useCallback(() => {
    setModalOpen(false);
  }, []);

  return (
    <EditGuardContext.Provider value={{ editState, guardNavigate }}>
      {children}
      <EditGuardModal
        open={modalOpen}
        editState={editState}
        onStay={handleStay}
        onLeave={handleLeave}
        pendingNavFn={pendingNavRef.current}
      />
    </EditGuardContext.Provider>
  );
}
