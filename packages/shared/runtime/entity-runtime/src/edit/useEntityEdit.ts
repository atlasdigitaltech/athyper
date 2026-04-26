"use client";

import { useContext } from "react";
import { EditGuardContext, type EditGuardContextValue } from "./EditGuardContext";

/**
 * Returns the current edit guard context.
 *
 * Safe to call outside of EntityWorkspaceShell — returns a no-op context so
 * view-only pages and tests work without a shell wrapper.
 *
 * Usage:
 *   const { editState, guardNavigate } = useEntityEdit();
 *   <button onClick={() => guardNavigate(() => router.back())}>Back</button>
 */
export function useEntityEdit(): EditGuardContextValue {
  const ctx = useContext(EditGuardContext);
  if (!ctx) {
    return {
      editState: undefined,
      guardNavigate: (fn) => fn(),
    };
  }
  return ctx;
}
