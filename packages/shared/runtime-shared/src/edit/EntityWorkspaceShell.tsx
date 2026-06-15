"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { EditGuardContext } from "./EditGuardContext";
import { EditGuardModal, type EditGuardModalProps } from "./EditGuardModal";
import { useBeforeUnload } from "./useBeforeUnload";
import { useEditKeyboardShortcuts } from "./useEditKeyboardShortcuts";
import type { EntityEditState } from "./types";

export interface EntityWorkspaceShellProps {
  editState: EntityEditState | undefined;
  children: ReactNode;
  /**
   * Optional render-prop for the unsaved-changes guard dialog. When omitted,
   * renders the legacy {@link EditGuardModal}. Apps/runtime-canvas can pass a
   * surface-stack-aware dialog (e.g. RuntimeEditGuardDialog from
   * `@athyper/runtime-canvas/edit`) to migrate to the typed shell + auto
   * frame registration without changing this contract.
   */
  renderGuardDialog?: (props: EditGuardModalProps) => ReactNode;
}

export function EntityWorkspaceShell({
  editState,
  children,
  renderGuardDialog,
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

  const guardProps: EditGuardModalProps = {
    open: modalOpen,
    editState,
    onStay: handleStay,
    onLeave: handleLeave,
    pendingNavFn: pendingNavRef.current,
  };

  return (
    <EditGuardContext.Provider value={{ editState, guardNavigate }}>
      {children}
      {renderGuardDialog ? renderGuardDialog(guardProps) : <EditGuardModal {...guardProps} />}
    </EditGuardContext.Provider>
  );
}
