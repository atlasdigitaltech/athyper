"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UseDocumentEditSessionReturn } from "./useDocumentEditSession";

/**
 * React Context exposing the active `useDocumentEditSession` instance to
 * descendants of `<DocumentObjectPage>`.
 *
 * Why a context: line-grid renderers (and any future per-section component)
 * need to read pending edit state and call session actions without prop-
 * drilling through 4-6 levels of registry indirection. The context is
 * optional — consumers must handle `null` to keep the existing classic-mode
 * code paths working.
 *
 * Plane-agnostic. neon / mesh / admin all consume the same context type.
 */
const EditSessionContext = createContext<UseDocumentEditSessionReturn | null>(null);

export interface EditSessionProviderProps {
  /**
   * The session value. Pass `null` when not in object-page edit mode so
   * consumers can short-circuit cleanly.
   */
  value: UseDocumentEditSessionReturn | null;
  children: ReactNode;
}

export function EditSessionProvider({ value, children }: EditSessionProviderProps) {
  return (
    <EditSessionContext.Provider value={value}>
      {children}
    </EditSessionContext.Provider>
  );
}

/**
 * Reads the active edit session. Returns `null` when:
 *   - No provider is present (e.g. classic-tabs render path)
 *   - Provider was given a `null` value (object-page but not editing)
 *
 * Component authors should treat `null` as "no edit affordances" and
 * render the read-only path.
 *
 * @example
 * function RowDeleteButton({ lineId }: { lineId: string }) {
 *   const session = useEditSessionContext();
 *   if (!session?.isEditing) return null;
 *   return <Button onClick={() => session.deleteLine(lineId)}>Delete</Button>;
 * }
 */
export function useEditSessionContext(): UseDocumentEditSessionReturn | null {
  return useContext(EditSessionContext);
}

/**
 * Per-line dirty state derived from a session. Returns `null` when the
 * session is null (no provider) or the line ID is not affected by any
 * pending operation.
 *
 * Cheap to call inside row renderers — internal lookups are O(1) set/map
 * membership checks.
 */
export function useLineEditState(lineId: string | null | undefined):
  | { kind: "pendingUpdate" }
  | { kind: "pendingDelete" }
  | null
{
  const session = useContext(EditSessionContext);
  if (!session || !lineId) return null;
  if (session.pendingLineDeletes.includes(lineId)) return { kind: "pendingDelete" };
  if (lineId in session.pendingLineUpdates) return { kind: "pendingUpdate" };
  return null;
}
