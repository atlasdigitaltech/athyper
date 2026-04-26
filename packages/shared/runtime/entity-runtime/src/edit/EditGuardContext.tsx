"use client";

import { createContext } from "react";
import type { EntityEditState } from "../header/types";

export interface EditGuardContextValue {
  /** The current edit state. Undefined in view-only mode. */
  editState: EntityEditState | undefined;
  /**
   * Wrap any navigation call with this function.
   * - Not dirty → calls fn() immediately.
   * - Dirty → shows the "Unsaved changes" guard modal; fn() runs only after
   *   the user confirms (discard or save-and-leave).
   */
  guardNavigate: (fn: () => void) => void;
}

export const EditGuardContext = createContext<EditGuardContextValue | null>(null);
