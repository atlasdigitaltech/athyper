"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { EditGuardContext } from "./EditGuardContext";
import { EditGuardModal } from "./EditGuardModal";
import { useBeforeUnload } from "./useBeforeUnload";
import { useEditKeyboardShortcuts } from "./useEditKeyboardShortcuts";
import type { EntityEditState } from "./types";

export interface EntityWorkspaceShellProps {
  editState: EntityEditState | undefined;
  children: ReactNode;
}

export function EntityWorkspaceShell({
  editState,
  children,
}: EntityWorkspaceShellProps) {
  const isDirty = editState?.isDirty ?? false;
  const pendingNavRef = useRef<(() => void) | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useBeforeUnload(isDirty);

  const openModal = useCallback(() => setModalOpen(true), []);
  const guardNavigate = useCallback((fn: () => void) => {
    if (!isDirty) {
      fn();
      return;
    }
    pendingNavRef.current = fn;
    setModalOpen(true);
  }, [isDirty]);

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
